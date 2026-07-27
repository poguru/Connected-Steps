import crypto from "crypto";
import type { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// ── Secret resolution ─────────────────────────────────────────────────────────
// Lazy-initialized to avoid crash at import time when env vars are absent
// during build. Singleton cleared on first call only.
//
// Rotation support: set COACH_TOKEN_SECRET_PREV to the old secret during the
// rotation window. Verify functions accept tokens signed by either secret;
// sign functions always use the primary (COACH_TOKEN_SECRET) secret only.
// Once all old tokens have expired (90 days for user tokens, 30 days for admin
// sessions), remove COACH_TOKEN_SECRET_PREV to complete the rotation.

let _secrets: string[] | null = null;

function SECRETS(): string[] {
  if (!_secrets) {
    const primary = process.env.COACH_TOKEN_SECRET ?? process.env.ADMIN_PASSWORD;
    if (!primary) throw new Error("COACH_TOKEN_SECRET or ADMIN_PASSWORD must be set");
    const prev = process.env.COACH_TOKEN_SECRET_PREV;
    _secrets = prev ? [primary, prev] : [primary];
  }
  return _secrets;
}

function SECRET(): string { return SECRETS()[0]; }

// ── Coach token ───────────────────────────────────────────────────────────────

export function signCoachToken(email: string): string {
  const hmac = crypto.createHmac("sha256", SECRET()).update(email.toLowerCase()).digest("hex");
  return `${Buffer.from(email.toLowerCase()).toString("base64url")}.${hmac}`;
}

export function verifyCoachToken(token: string): string | null {
  const [emailB64, hmac] = token.split(".");
  if (!emailB64 || !hmac) return null;
  try {
    const email = Buffer.from(emailB64, "base64url").toString("utf8");
    for (const secret of SECRETS()) {
      const expected = crypto.createHmac("sha256", secret).update(email).digest("hex");
      if (expected.length === hmac.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hmac))) {
        return email;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export const COOKIE_NAME         = "cs_coach_session";
export const USER_SESSION_COOKIE = "cs_user_session";

// ── User token ────────────────────────────────────────────────────────────────

export const USER_TOKEN_TTL = 90 * 24 * 60 * 60; // 90 days in seconds

export function signUserToken(email: string): string {
  const exp     = Math.floor(Date.now() / 1000) + USER_TOKEN_TTL;
  const payload = `user:${email.toLowerCase()}:${exp}`;
  const hmac    = crypto.createHmac("sha256", SECRET()).update(payload).digest("hex");
  return `${Buffer.from(email.toLowerCase()).toString("base64url")}.${exp}.${hmac}`;
}

export function verifyUserToken(token: string): string | null {
  const parts = token.split(".");
  // Tokens must be 3-part (email.exp.hmac). Old 2-part tokens are rejected.
  if (parts.length !== 3) return null;
  const [emailB64, expStr, hmac] = parts;
  try {
    const email = Buffer.from(emailB64, "base64url").toString("utf8");
    const exp   = parseInt(expStr, 10);
    if (!Number.isFinite(exp) || Math.floor(Date.now() / 1000) > exp) return null;
    const payload = `user:${email.toLowerCase()}:${exp}`;
    for (const secret of SECRETS()) {
      const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
      if (expected.length === hmac.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hmac))) {
        return email;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ── Admin session token (httpOnly cookie) ─────────────────────────────────────
// Signed short-lived token so the raw admin password is never stored client-side.

export const ADMIN_SESSION_COOKIE = "cs_admin_session";
const ADMIN_SESSION_TTL = 30 * 24 * 60 * 60; // 30 days in seconds

export function signAdminSession(): string {
  const expires = Math.floor(Date.now() / 1000) + ADMIN_SESSION_TTL;
  const payload = `admin:${expires}`;
  const hmac    = crypto.createHmac("sha256", SECRET()).update(payload).digest("hex");
  return `${Buffer.from(payload).toString("base64url")}.${hmac}`;
}

export function verifyAdminSession(token: string): boolean {
  const [payloadB64, hmac] = token.split(".");
  if (!payloadB64 || !hmac) return false;
  try {
    const payload = Buffer.from(payloadB64, "base64url").toString("utf8");
    for (const secret of SECRETS()) {
      const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
      if (expected.length === hmac.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hmac))) {
        const expires = parseInt(payload.split(":")[1], 10);
        return Number.isFinite(expires) && Math.floor(Date.now() / 1000) < expires;
      }
    }
    return false;
  } catch {
    return false;
  }
}

// ── Coach email from cookie (server-side helper for coach portal routes) ──────

export function getCoachEmailFromCookie(req: NextRequest): string | null {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyCoachToken(token);
}

// ── Check whether a request carries a valid admin session ─────────────────────

export function isAdmin(req: NextRequest): boolean {
  const adminSession = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  return !!(adminSession && verifyAdminSession(adminSession));
}

// ── Unified admin / coach auth ────────────────────────────────────────────────
// Returns true for:
//   1. cs_admin_session cookie — short-lived signed admin session
//   2. x-coach-token header or cs_coach_session cookie — signed coach token

export async function isAdminOrCoach(req: NextRequest): Promise<boolean> {
  // 1. Admin session cookie (httpOnly — never readable by client JS)
  const adminSession = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (adminSession && verifyAdminSession(adminSession)) return true;

  // 2. Coach token (mobile header or web cookie)
  const token = req.headers.get("x-coach-token") ?? req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return false;

  const email = verifyCoachToken(token);
  if (!email) return false;

  const db = getSupabaseServer();
  const { data } = await db.from("coaches").select("id").eq("email", email).eq("is_active", true).single();
  return !!data;
}

/** Returns the authenticated admin's identity string for audit logging.
 *  Returns null if the request is from a coach (no email on header). */
export function getAdminEmail(req: NextRequest): string | null {
  const adminSession = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (adminSession) return "admin";
  const token = req.headers.get("x-coach-token") ?? req.cookies.get(COOKIE_NAME)?.value;
  if (token) return verifyCoachToken(token);
  return null;
}
