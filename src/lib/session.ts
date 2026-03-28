/**
 * PathoPulse Session Token System
 * Simple signed token using HMAC-SHA256 — no external JWT library needed.
 * Token format: base64(payload).base64(signature)
 */

const SECRET = process.env.SESSION_SECRET || "pathopulse-jk-secret-2025";

async function hmac(data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Buffer.from(sig).toString("base64url");
}

export interface SessionPayload {
  worker_id: string;
  worker_db_id: number;
  name: string;
  role: string;  // field_worker | lab_operator | admin
  exp: number;   // Unix timestamp
}

export async function signToken(payload: SessionPayload): Promise<string> {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = await hmac(body);
  return `${body}.${sig}`;
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;
    const expected = await hmac(body);
    if (expected !== sig) return null;
    const payload: SessionPayload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (payload.exp < Date.now()) return null; // expired
    return payload;
  } catch {
    return null;
  }
}

/** Extract and validate the Bearer token from an Authorization header */
export async function getSessionFromRequest(request: Request): Promise<SessionPayload | null> {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  return verifyToken(token);
}
