import crypto from "crypto";
import type { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

const SECRET = process.env.COACH_TOKEN_SECRET ?? process.env.ADMIN_PASSWORD ?? "cs-coach-fallback";

// ── Token helpers ─────────────────────────────────────────────────────────────

export function signCoachToken(email: string): string {
  const hmac = crypto.createHmac("sha256", SECRET).update(email.toLowerCase()).digest("hex");
  return `${Buffer.from(email.toLowerCase()).toString("base64url")}.${hmac}`;
}

export function verifyCoachToken(token: string): string | null {
  const [emailB64, hmac] = token.split(".");
  if (!emailB64 || !hmac) return null;
  try {
    const email    = Buffer.from(emailB64, "base64url").toString("utf8");
    const expected = crypto.createHmac("sha256", SECRET).update(email).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hmac))) return null;
    return email;
  } catch {
    return null;
  }
}

export const COOKIE_NAME = "cs_coach_session";

// ── Unified admin auth ────────────────────────────────────────────────────────
// Returns true for:
//   1. x-admin-password header matching ADMIN_PASSWORD  (super-admin)
//   2. x-coach-token header with a valid signed token    (coach on mobile)
//   3. cs_coach_session cookie with a valid signed token (coach on web)

export async function isAdminOrCoach(req: NextRequest): Promise<boolean> {
  // 1. Super-admin password
  const pw = req.headers.get("x-admin-password");
  if (pw && pw === process.env.ADMIN_PASSWORD) return true;

  // 2. Coach token (mobile)
  const token = req.headers.get("x-coach-token") ?? req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return false;

  const email = verifyCoachToken(token);
  if (!email) return false;

  // Verify the email is still in the coaches table
  const db = getSupabaseServer();
  const { data } = await db.from("coaches").select("id").eq("email", email).eq("is_active", true).single();
  return !!data;
}
