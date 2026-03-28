import { NextResponse } from "next/server";
import { db } from "@/db";
import { zones, outbreaks, labs } from "@/db/schema";
import { eq } from "drizzle-orm";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/v2/districts/[id]/zones — get zones with outbreaks for a district
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const districtId = parseInt(id);
    if (isNaN(districtId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const districtZones = await db.select().from(zones).where(eq(zones.district_id, districtId)).all();

    const result = await Promise.all(districtZones.map(async (z) => {
      const zoneOutbreaks = await db
        .select({
          id: outbreaks.id, disease: outbreaks.disease, variant: outbreaks.variant,
          resistance: outbreaks.resistance, status: outbreaks.status,
          sequenced: outbreaks.sequenced, priority_score: outbreaks.priority_score,
          previous_score: outbreaks.previous_score,
          total_cases: outbreaks.total_cases, active_cases: outbreaks.active_cases,
          deaths: outbreaks.deaths, hospitalized: outbreaks.hospitalized,
          recovered: outbreaks.recovered, first_reported: outbreaks.first_reported,
          last_updated: outbreaks.last_updated, lab_id: outbreaks.lab_id,
        })
        .from(outbreaks)
        .where(eq(outbreaks.zone_id, z.id))
        .all();

      // Attach lab name to each outbreak
      const outbreaksWithLab = await Promise.all(zoneOutbreaks.map(async (o) => {
        if (!o.lab_id) return { ...o, lab_name: null, lab_code: null };
        const labRow = await db.select({ name: labs.name, code: labs.code, type: labs.type })
          .from(labs).where(eq(labs.id, o.lab_id)).get();
        return { ...o, lab_name: labRow?.name, lab_code: labRow?.code, lab_type: labRow?.type };
      }));

      return { ...z, outbreaks: outbreaksWithLab };
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "DB Error" }, { status: 500 });
  }
}
