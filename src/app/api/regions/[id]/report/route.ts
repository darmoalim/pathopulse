import { NextResponse } from "next/server";
import { db } from "@/db";
import { regions } from "@/db/schema";
import { calcPriority } from "@/lib/scoring";
import { eq } from "drizzle-orm";

const OPERATOR_CODE = process.env.OPERATOR_PIN || "PP-ADMIN-2025";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  // ── Server-side auth guard ──────────────────────────────────
  const pin = request.headers.get("x-operator-pin");
  if (pin !== OPERATOR_CODE) {
    return NextResponse.json({ error: "Unauthorized. Operator access required." }, { status: 401 });
  }

  try {
    const params = await context.params;
    const id = parseInt(params.id, 10);
    if (isNaN(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    
    const body = await request.json().catch(() => ({}));
    const newReports = parseInt(body.symptom_reports, 10);
    if (isNaN(newReports) || newReports < 0) {
        return NextResponse.json({ error: "Invalid count" }, { status: 400 });
    }

    const row = await db.select().from(regions).where(eq(regions.id, id)).get();
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const newScore = calcPriority(row.sequenced, newReports);
    
    // SQLite doesn't natively have NOW() without raw queries, use ISO string
    const updated = await db.update(regions).set({
        symptom_reports: newReports,
        previous_score: row.priority_score,
        priority_score: newScore,
        notes: body.notes || row.notes,
        updated_at: new Date().toISOString()
    }).where(eq(regions.id, id)).returning().get();

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "DB Error" }, { status: 500 });
  }
}
