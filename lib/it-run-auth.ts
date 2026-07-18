import crypto from "crypto";
import { NextRequest } from "next/server";

// ── Constants ─────────────────────────────────────────────────────────────────

export const PORTAL_SESSION_COOKIE = "it_run_portal_session";

export const PORTAL_ROLES = [
  "event_admin",
  "verification_team",
  "bib_collection",
  "checkin_team",
  "support_desk",
] as const;

export type PortalRole = typeof PORTAL_ROLES[number];

// Role display names
export const ROLE_LABELS: Record<PortalRole, string> = {
  event_admin:       "Event Admin",
  verification_team: "Verification Team",
  bib_collection:    "BIB Collection",
  checkin_team:      "Check-in Team",
  support_desk:      "Support Desk",
};

// Pages each role can access (whitelist)
export const ROLE_PERMISSIONS: Record<PortalRole, string[]> = {
  event_admin:       ["dashboard","registrations","participants","verification","bibs","bib-slots","checkins","coupons","reports","broadcasts","settings"],
  verification_team: ["verification","participants"],
  bib_collection:    ["bib-collection","bibs"],
  checkin_team:      ["checkin"],
  support_desk:      ["participants","registrations"],
};

// TTL: 8 hours for admin, 12 hours for field teams
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

// ── Signing helpers ────────────────────────────────────────────────────────────

function SECRET(): string {
  const s = process.env.COACH_TOKEN_SECRET ?? process.env.ADMIN_PASSWORD;
  if (!s) throw new Error("COACH_TOKEN_SECRET or ADMIN_PASSWORD must be set");
  return `it_run:${s}`;
}

// Token format: base64url(email:role:exp).hmac
// Completely separate namespace from CS admin sessions via the 'it_run:' prefix.
export function signPortalSession(email: string, role: PortalRole): string {
  const exp     = Date.now() + SESSION_TTL_MS;
  const payload = `${email}:${role}:${exp}`;
  const hmac    = crypto.createHmac("sha256", SECRET()).update(payload).digest("hex");
  return `${Buffer.from(payload).toString("base64url")}.${hmac}`;
}

export interface PortalSession {
  email: string;
  role:  PortalRole;
  exp:   number;
}

export function verifyPortalSession(token: string): PortalSession | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;

  const payloadB64 = token.slice(0, dot);
  const hmac       = token.slice(dot + 1);

  try {
    const payload  = Buffer.from(payloadB64, "base64url").toString("utf8");
    const expected = crypto.createHmac("sha256", SECRET()).update(payload).digest("hex");

    if (expected.length !== hmac.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hmac))) return null;

    const parts = payload.split(":");
    if (parts.length < 3) return null;

    const email = parts[0];
    const role  = parts[1] as PortalRole;
    const exp   = parseInt(parts[2], 10);

    if (!PORTAL_ROLES.includes(role)) return null;
    if (Date.now() > exp) return null;

    return { email, role, exp };
  } catch {
    return null;
  }
}

// ── Request guard ─────────────────────────────────────────────────────────────

export function getPortalSession(req: NextRequest): PortalSession | null {
  const cookie = req.cookies.get(PORTAL_SESSION_COOKIE)?.value;
  if (!cookie) return null;
  return verifyPortalSession(cookie);
}

export function requireRole(
  req: NextRequest,
  allowedRoles: PortalRole[]
): PortalSession | null {
  const session = getPortalSession(req);
  if (!session) return null;
  if (!allowedRoles.includes(session.role)) return null;
  return session;
}

// Shorthand: any portal user
export function isPortalUser(req: NextRequest): PortalSession | null {
  return getPortalSession(req);
}

// Shorthand: event_admin only
export function isEventAdmin(req: NextRequest): PortalSession | null {
  return requireRole(req, ["event_admin"]);
}

// ── Password hashing (simple but secure for server-side) ─────────────────────

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .createHmac("sha256", SECRET())
    .update(`${salt}:${password}`)
    .digest("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = crypto
    .createHmac("sha256", SECRET())
    .update(`${salt}:${password}`)
    .digest("hex");
  if (expected.length !== hash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash));
}

// ── IT Run QR token (for participant QR codes) ────────────────────────────────

// Token encodes only registrationCode + participantId — no PII.
// Format: base64url(regCode:participantId).hmac
export function signItRunQR(registrationCode: string, participantId: string): string {
  const payload = `${registrationCode}:${participantId}`;
  const hmac    = crypto.createHmac("sha256", SECRET()).update(payload).digest("hex");
  return `${Buffer.from(payload).toString("base64url")}.${hmac}`;
}

export function verifyItRunQR(token: string): { registrationCode: string; participantId: string } | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;

  const payloadB64 = token.slice(0, dot);
  const hmac       = token.slice(dot + 1);

  try {
    const payload  = Buffer.from(payloadB64, "base64url").toString("utf8");
    const expected = crypto.createHmac("sha256", SECRET()).update(payload).digest("hex");

    if (expected.length !== hmac.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hmac))) return null;

    const colon = payload.indexOf(":");
    if (colon < 1) return null;

    const registrationCode = payload.slice(0, colon);
    const participantId    = payload.slice(colon + 1);

    if (!registrationCode || !participantId) return null;
    return { registrationCode, participantId };
  } catch {
    return null;
  }
}

// ── Registration code generator ───────────────────────────────────────────────

export function generateRegistrationCode(): string {
  const chars  = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const random = Array.from(crypto.randomBytes(8))
    .map(b => chars[b % chars.length])
    .join("");
  return `ITRUN2-${random}`;
}
