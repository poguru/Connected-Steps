import { NextRequest } from "next/server";
import crypto from "crypto";

// ── Session structure ──────────────────────────────────────────────────────────

export interface StaffSession {
  staffId: string;
  email: string;
  fullName: string;
  eventId: string;
  role: string;
  permissions: string[];
  status: string;
  exp: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STAFF_SESSION_COOKIE = "it_run_staff_session";

function STAFF_SECRET(): string {
  const secret = process.env.STAFF_SESSION_SECRET || process.env.COACH_TOKEN_SECRET || process.env.ADMIN_PASSWORD;
  if (!secret) throw new Error("STAFF_SESSION_SECRET env var is required");
  return `it_run_staff:${secret}`;
}

// ── Password hashing ───────────────────────────────────────────────────────────

export function hashPassword(password: string): { hash: string; salt: Buffer } {
  const salt = crypto.randomBytes(16);
  const hash = crypto
    .createHmac("sha256", salt)
    .update(password)
    .digest("hex");
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: Buffer): boolean {
  const computed = crypto
    .createHmac("sha256", salt)
    .update(password)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
}

// ── Session encoding/verification ─────────────────────────────────────────────

// The session carries the event and the role's permissions, so route checks can read them without a database
// lookup. The payload is JSON (base64url) so permission names and emails never collide with a separator.
export function encodeStaffSession(session: StaffSession): string {
  const body = Buffer.from(JSON.stringify({
    staffId: session.staffId,
    email: session.email,
    role: session.role,
    eventId: session.eventId,
    permissions: session.permissions,
    exp: session.exp,
  })).toString("base64url");
  const sig = crypto
    .createHmac("sha256", STAFF_SECRET())
    .update(body)
    .digest("hex");
  return `${body}.${sig}`;
}

export function verifyStaffSession(encoded: string): StaffSession | null {
  try {
    const [body, sig] = encoded.split(".");
    if (!body || !sig) return null;

    const expectedSig = crypto
      .createHmac("sha256", STAFF_SECRET())
      .update(body)
      .digest("hex");

    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<StaffSession>;
    const exp = Number(data.exp);

    if (!Number.isFinite(exp) || Date.now() > exp * 1000) {
      return null; // Expired
    }
    if (typeof data.staffId !== "string" || typeof data.role !== "string" || typeof data.eventId !== "string") {
      return null;
    }
    const permissions = Array.isArray(data.permissions) ? data.permissions.filter((p): p is string => typeof p === "string") : [];

    return {
      staffId: data.staffId,
      email: typeof data.email === "string" ? data.email : "",
      fullName: "",
      eventId: data.eventId,
      role: data.role,
      permissions,
      status: "active",
      exp,
    };
  } catch {
    return null;
  }
}

// ── Request helpers ───────────────────────────────────────────────────────────

export function getStaffSession(req: NextRequest): StaffSession | null {
  const cookie = req.cookies.get(STAFF_SESSION_COOKIE)?.value;
  if (!cookie) return null;
  return verifyStaffSession(cookie);
}

export function requireStaffRole(
  req: NextRequest,
  allowedRoles: string[] | string,
): StaffSession | null {
  const session = getStaffSession(req);
  if (!session) return null;
  if (session.status !== "active") return null;

  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  if (!roles.includes(session.role) && session.role !== "super_admin") {
    return null;
  }

  return session;
}

export function requireStaffPermission(
  session: StaffSession | null,
  permission: string,
): boolean {
  if (!session) return false;
  if (session.role === "super_admin") return true;
  return session.permissions.includes(permission);
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

export function createStaffSessionCookie(session: StaffSession): string {
  const encoded = encodeStaffSession(session);
  const maxAge = (session.exp * 1000 - Date.now()) / 1000;
  return `${STAFF_SESSION_COOKIE}=${encoded}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearStaffSessionCookie(): string {
  return `${STAFF_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

// ── Utilities ──────────────────────────────────────────────────────────────────

export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}
