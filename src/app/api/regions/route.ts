import { NextResponse } from "next/server";
import { db } from "@/db";
import { regions } from "@/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  try {
    const allRegions = await db.select().from(regions).orderBy(desc(regions.priority_score));
    return NextResponse.json(allRegions);
  } catch {
    return NextResponse.json({ error: "DB Error" }, { status: 500 });
  }
}
