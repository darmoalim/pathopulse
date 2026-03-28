import { NextResponse } from "next/server";
import { db } from "@/db";
import { outbreaks, report_submissions, asha_workers, labs, zones } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { calcPriority } from "@/lib/scoring";

const OPERATOR_CODE = process.env.OPERATOR_PIN || "PP-ADMIN-2025";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/v2/outbreaks/[id] — full outbreak detail with submission history
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const outbreakId = parseInt(id);
    if (isNaN(outbreakId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const outbreak = await db.select().from(outbreaks).where(eq(outbreaks.id, outbreakId)).get();
    if (!outbreak) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Get lab info
    const lab = outbreak.lab_id
      ? await db.select().from(labs).where(eq(labs.id, outbreak.lab_id)).get()
      : null;

    // Get zone info
    const zone = await db.select().from(zones).where(eq(zones.id, outbreak.zone_id)).get();

    // Get submission history
    const submissions = await db
      .select()
      .from(report_submissions)
      .where(eq(report_submissions.outbreak_id, outbreakId))
      .all();
    submissions.sort((a, b) =>
      new Date(b.submitted_at ?? "").getTime() - new Date(a.submitted_at ?? "").getTime()
    );

    return NextResponse.json({ ...outbreak, lab, zone, submissions });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "DB Error" }, { status: 500 });
  }
}

// POST /api/v2/outbreaks/[id]/report — operator submits a new case update
export async function POST(request: Request, ctx: Ctx) {
  const pin = request.headers.get("x-operator-pin");
  if (pin !== OPERATOR_CODE) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const { id } = await ctx.params;
    const outbreakId = parseInt(id);
    const body = await request.json();

    const { new_cases, deaths = 0, hospitalized = 0, recovered = 0,
            notes, sample_status = "pending", severity = "moderate",
            worker_name, lab_code } = body;

    if (isNaN(new_cases) || new_cases < 0) {
      return NextResponse.json({ error: "Invalid case count" }, { status: 400 });
    }

    const existing = await db.select().from(outbreaks).where(eq(outbreaks.id, outbreakId)).get();
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Resolve lab if code provided
    let labId = existing.lab_id;
    if (lab_code) {
      const labRow = await db.select().from(labs).where(eq(labs.code, lab_code)).get();
      if (labRow) labId = labRow.id;
    }

    // Update outbreak totals
    const newTotal = (existing.total_cases ?? 0) + new_cases;
    const newDeaths = (existing.deaths ?? 0) + deaths;
    const newHosp = (existing.hospitalized ?? 0) + hospitalized;
    const newRecov = (existing.recovered ?? 0) + recovered;
    const newActive = newTotal - newDeaths - newRecov;
    const newScore = calcPriority(existing.sequenced ?? false, newTotal, newDeaths);

    await db.update(outbreaks).set({
      total_cases: newTotal,
      deaths: newDeaths,
      hospitalized: newHosp,
      recovered: newRecov,
      active_cases: Math.max(0, newActive),
      previous_score: existing.priority_score,
      priority_score: newScore,
      lab_id: labId,
      last_updated: new Date().toISOString(),
    }).where(eq(outbreaks.id, outbreakId));

    // Insert submission record
    await db.insert(report_submissions).values({
      outbreak_id: outbreakId,
      zone_id: existing.zone_id,
      worker_name: worker_name || "Anonymous Field Worker",
      new_cases, deaths, hospitalized, recovered,
      lab_id: labId,
      sample_status,
      severity,
      notes,
      location_accuracy: "manual",
      submitted_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, new_score: newScore });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "DB Error" }, { status: 500 });
  }
}
