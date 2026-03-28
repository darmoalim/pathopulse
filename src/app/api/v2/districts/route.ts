import { NextResponse } from "next/server";
import { db } from "@/db";
import { districts, zones, outbreaks, labs } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";

// GET /api/v2/districts — list all districts with aggregate threat summary
export async function GET() {
  try {
    const allDistricts = await db.select().from(districts);

    // For each district compute outbreak summary
    const result = await Promise.all(allDistricts.map(async (d) => {
      const districtOutbreaks = await db
        .select()
        .from(outbreaks)
        .where(eq(outbreaks.district_id, d.id))
        .all();

      const activeOutbreaks = districtOutbreaks.filter(o => o.status === "active");
      const totalCases = districtOutbreaks.reduce((s, o) => s + (o.total_cases ?? 0), 0);
      const totalDeaths = districtOutbreaks.reduce((s, o) => s + (o.deaths ?? 0), 0);
      const maxScore = activeOutbreaks.reduce((s, o) => Math.max(s, o.priority_score ?? 0), 0);
      const hasBlindspot = activeOutbreaks.some(o => !o.sequenced);
      const uniqueDiseases = [...new Set(activeOutbreaks.map(o => o.disease))];

      return {
        ...d,
        outbreak_count: activeOutbreaks.length,
        total_cases: totalCases,
        total_deaths: totalDeaths,
        max_score: maxScore,
        has_blindspot: hasBlindspot,
        diseases: uniqueDiseases,
      };
    }));

    // Sort by max_score descending
    result.sort((a, b) => b.max_score - a.max_score);
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "DB Error" }, { status: 500 });
  }
}
