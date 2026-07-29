import crypto from "crypto";
import type { NextRequest } from "next/server";

function SECRET(): string {
  const s = process.env.COACH_TOKEN_SECRET ?? process.env.ADMIN_PASSWORD;
  if (!s) throw new Error("COACH_TOKEN_SECRET or ADMIN_PASSWORD must be set");
  return s;
}

export const OPS_SESSION_COOKIE = "ops_session";
const OPS_SESSION_TTL = 12 * 60 * 60; // 12 hours

export type OpsRole =
  | "event_admin"
  | "registration_desk"
  | "checkin"
  | "tshirt"
  | "breakfast"
  | "bib"
  | "medal"
  | "certificate"
  | "support"
  | "medical"
  | "photography"
  | "sponsor";

export interface OpsSessionData {
  uid: string;   // event_portal_users.id
  eid: string;   // events.id
  role: OpsRole;
  em: string;    // volunteer email
  nm: string;    // volunteer name
}

interface OpsTokenPayload extends OpsSessionData {
  v: 1;
  exp: number;
}

export function signOpsSession(data: OpsSessionData): string {
  const exp = Math.floor(Date.now() / 1000) + OPS_SESSION_TTL;
  const payload: OpsTokenPayload = { v: 1, ...data, exp };
  const b64  = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const hmac = crypto.createHmac("sha256", SECRET()).update(b64).digest("hex");
  return `${b64}.${hmac}`;
}

export function verifyOpsSession(token: string): OpsTokenPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const b64  = token.slice(0, dot);
  const hmac = token.slice(dot + 1);
  try {
    const expected = crypto.createHmac("sha256", SECRET()).update(b64).digest("hex");
    if (expected.length !== hmac.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hmac))) return null;
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as OpsTokenPayload;
    if (payload.v !== 1) return null;
    if (!Number.isFinite(payload.exp) || Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getOpsSession(req: NextRequest): OpsTokenPayload | null {
  const token = req.cookies.get(OPS_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyOpsSession(token);
}

// Human-readable label for each role (used in UI headers + audit logs)
export const OPS_ROLE_LABELS: Record<OpsRole, string> = {
  event_admin:       "Event Admin",
  registration_desk: "Registration Desk",
  checkin:           "Check-In",
  tshirt:            "T-Shirt Distribution",
  breakfast:         "Breakfast",
  bib:               "BIB Collection",
  medal:             "Medal",
  certificate:       "Certificate",
  support:           "Support Desk",
  medical:           "Medical",
  photography:       "Photography",
  sponsor:           "Sponsor",
};

// Default module each role lands on after login
export const ROLE_DEFAULT_MODULE: Record<OpsRole, string> = {
  event_admin:       "dashboard",
  registration_desk: "registrations",
  checkin:           "checkin",
  tshirt:            "tshirt",
  breakfast:         "breakfast",
  bib:               "bib",
  medal:             "medal",
  certificate:       "certificate",
  support:           "registrations",
  medical:           "checkin",
  photography:       "dashboard",
  sponsor:           "sponsor",
};

// Priority order for role selection when a user has multiple assignments
export const ROLE_PRIORITY: OpsRole[] = [
  "event_admin", "registration_desk", "checkin", "tshirt",
  "breakfast", "bib", "medal", "certificate", "support", "medical", "photography",
  "sponsor",
];
