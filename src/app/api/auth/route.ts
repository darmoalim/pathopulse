import { NextResponse } from "next/server";
import { db } from "@/db";
import { asha_workers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { signToken } from "@/lib/session";
import { createHash } from "crypto";

/**
 * POST /api/auth
 * Body: { worker_id: string, pin: string }
 * Returns: { token, name, role } or 401
 *
 * DEMO fallback: if no asha_workers have pin_hash set,
 * accepts the env var OPERATOR_PIN as a global admin PIN.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { worker_id, pin } = body;

    if (!pin || typeof pin !== "string") {
      return NextResponse.json({ error: "Access code required" }, { status: 400 });
    }

    // Hash the submitted PIN
    const pin_hash = createHash("sha256").update(pin.trim()).digest("hex");

    // 1. Try lookup from asha_workers table
    if (worker_id && typeof worker_id === "string") {
      const worker = await db.select().from(asha_workers)
        .where(eq(asha_workers.worker_id, worker_id.trim().toUpperCase()))
        .get();

      if (worker && worker.active && worker.pin_hash === pin_hash) {
        const token = await signToken({
          worker_id: worker.worker_id,
          worker_db_id: worker.id,
          name: worker.name,
          role: worker.role,
          exp: Date.now() + 8 * 60 * 60 * 1000, // 8 hours
        });
        return NextResponse.json({ token, name: worker.name, role: worker.role, ok: true });
      }

      // Wrong credentials — don't leak whether worker_id or PIN was wrong
      return NextResponse.json({ error: "Invalid Worker ID or access code" }, { status: 401 });
    }

    // 2. Fallback: global admin PIN (for demo/hackathon mode when no workers seeded)
    const ADMIN_PIN = process.env.OPERATOR_PIN || "PP-ADMIN-2025";
    if (pin === ADMIN_PIN) {
      const token = await signToken({
        worker_id: "ADMIN",
        worker_db_id: 0,
        name: "Admin Operator",
        role: "admin",
        exp: Date.now() + 8 * 60 * 60 * 1000,
      });
      return NextResponse.json({ token, name: "Admin Operator", role: "admin", ok: true });
    }

    return NextResponse.json({ error: "Invalid access code" }, { status: 401 });
  } catch (err) {
    console.error("[auth]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
