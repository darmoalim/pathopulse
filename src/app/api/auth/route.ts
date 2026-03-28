import { NextResponse } from "next/server";

// In a real system this would be hashed and stored in the DB / env
const OPERATOR_CODE = process.env.OPERATOR_PIN || "PP-ADMIN-2025";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body.pin === OPERATOR_CODE) {
      return NextResponse.json({ role: "operator", ok: true });
    }
    return NextResponse.json({ error: "Invalid operator code" }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
