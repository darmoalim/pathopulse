import { NextResponse } from "next/server";
import { db } from "@/db";
import { outbreaks, report_submissions, labs, zones, event_log, patient_cases } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { calcPriority } from "@/lib/scoring";
import { getSessionFromRequest } from "@/lib/session";
import { validateSubmission } from "@/lib/validation";
import { broadcastEvent } from "@/lib/feed";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/v2/outbreaks/[id] — full outbreak detail with submission history
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const outbreakId = parseInt(id);
    if (isNaN(outbreakId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const outbreak = await db.select().from(outbreaks).where(eq(outbreaks.id, outbreakId)).get();
    if (!outbreak) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const lab = outbreak.lab_id
      ? await db.select().from(labs).where(eq(labs.id, outbreak.lab_id)).get()
      : null;

    const zone = await db.select().from(zones).where(eq(zones.id, outbreak.zone_id)).get();

    const submissions = await db
      .select()
      .from(report_submissions)
      .where(eq(report_submissions.outbreak_id, outbreakId))
      .orderBy(desc(report_submissions.submitted_at))
      .all();

    return NextResponse.json({ ...outbreak, lab, zone, submissions });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "DB Error" }, { status: 500 });
  }
}

// POST /api/v2/outbreaks/[id] — operator submits a new case update
export async function POST(request: Request, ctx: Ctx) {
  // ── 1. Authenticate via session token ──────────────────────────
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized. Valid operator session required." }, { status: 401 });
  }

  try {
    const { id } = await ctx.params;
    const outbreakId = parseInt(id);
    if (isNaN(outbreakId)) return NextResponse.json({ error: "Invalid outbreak ID" }, { status: 400 });

    const body = await request.json();

    // ── 2. Validate all inputs server-side ─────────────────────────
    const validation = validateSubmission(body);
    if (!validation.valid) {
      return NextResponse.json({ error: "Validation failed", errors: validation.errors }, { status: 400 });
    }
    const { new_cases, deaths, hospitalized, recovered, severity, sample_status, notes, lab_code } = validation.data!;

    // ── 3. Lab verification gate — only lab_operator can set sequenced ─
    if (sample_status === "sequenced" && session.role !== "lab_operator" && session.role !== "admin") {
      return NextResponse.json({ error: "Only lab operators can mark samples as sequenced" }, { status: 403 });
    }

    const existing = await db.select().from(outbreaks).where(eq(outbreaks.id, outbreakId)).get();
    if (!existing) return NextResponse.json({ error: "Outbreak not found" }, { status: 404 });

    // Get zone for population-normalized scoring
    const zone = await db.select().from(zones).where(eq(zones.id, existing.zone_id)).get();

    // Resolve lab
    let labId = existing.lab_id;
    if (lab_code) {
      const labRow = await db.select().from(labs).where(eq(labs.code, lab_code)).get();
      if (labRow) labId = labRow.id;
    }

    const now = new Date().toISOString();

    // ── 3.5. Cryptographic Deduplication (Insert Patient Hashes) ────
    let actualNewCases = new_cases;
    if (body.patient_hashes && Array.isArray(body.patient_hashes) && body.patient_hashes.length > 0) {
      const validHashes = body.patient_hashes.filter((h: any) => typeof h === "string").slice(0, 500);
      actualNewCases = 0;
      
      for (const phash of validHashes) {
        try {
          const insertResult = await db.insert(patient_cases).values({
            outbreak_id: outbreakId,
            patient_hash: phash,
            worker_id: session.worker_db_id || null,
            reported_at: now,
          }).onConflictDoNothing().run(); // Ignore if hash already exists
          
          if (insertResult.changes > 0) actualNewCases++;
        } catch { /* ignore individual hash errors */ }
      }

      // If no new net cases after deduplication, skip the math update but return success
      if (actualNewCases === 0) {
        return NextResponse.json({ ok: true, msg: "All patients already processed (deduplicated)." });
      }
    }

    // ── 4. Update outbreak totals (Using Deduplicated Cases) ───────
    const newTotal = (existing.total_cases ?? 0) + actualNewCases;
    const newDeaths = (existing.deaths ?? 0) + deaths;
    const newHosp = (existing.hospitalized ?? 0) + hospitalized;
    const newRecov = (existing.recovered ?? 0) + recovered;
    const newActive = Math.max(0, newTotal - newDeaths - newRecov);

    // ── 5. Population-normalized score ────────────────────────────
    const population = zone?.population ?? 50000;
    const newScore = calcPriority(
      existing.sequenced ?? false,
      newTotal,
      newDeaths,
      population,
      newActive,
      new Date().toISOString()
    );

    // const now = new Date().toISOString(); // Removed redeclaration

    await db.update(outbreaks).set({
      total_cases: newTotal,
      deaths: newDeaths,
      hospitalized: newHosp,
      recovered: newRecov,
      active_cases: newActive,
      previous_score: existing.priority_score,
      priority_score: newScore,
      lab_id: labId,
      last_updated: now,
    }).where(eq(outbreaks.id, outbreakId));

    // ── 6. Insert submission with authenticated worker identity ────
    await db.insert(report_submissions).values({
      outbreak_id: outbreakId,
      zone_id: existing.zone_id,
      worker_id: session.worker_db_id || null,
      worker_name: session.name,  // from verified token, not user input
      new_cases: actualNewCases, deaths, hospitalized, recovered,
      lab_id: labId,
      sample_status,
      severity,
      notes,
      location_accuracy: "manual",
      submitted_at: now,
    });

    // ── 7. Write to event_log for real-time SSE feed ───────────────
    const eventMsg = `${zone?.name ?? "Unknown Zone"}: ${actualNewCases} new ${existing.disease} case${actualNewCases !== 1 ? "s" : ""} reported by ${session.name}.`;
    await db.insert(event_log).values({
      type: "report",
      zone_name: zone?.name ?? null,
      district_name: null,
      disease: existing.disease,
      message: eventMsg,
      severity,
      metadata_json: JSON.stringify({ outbreak_id: outbreakId, new_score: newScore }),
      created_at: now,
    });

    // Broadcast to any connected SSE clients
    broadcastEvent({ message: eventMsg, severity, disease: existing.disease, zone_name: zone?.name, timestamp: now });

    return NextResponse.json({ ok: true, new_score: newScore });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
