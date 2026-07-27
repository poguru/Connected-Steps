import crypto from "crypto";
import type { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/admin-auth";

// ── Constants ─────────────────────────────────────────────────────────────────

export const ORG_SESSION_COOKIE = "cs_org_session";
const ORG_SESSION_TTL            = 30 * 24 * 60 * 60; // 30 days

export const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

// ── Roles ─────────────────────────────────────────────────────────────────────

export const ORG_ROLES = [
  "owner",
  "admin",
  "finance",
  "operations",
  "volunteer_manager",
  "communications",
  "support",
  "read_only",
] as const;

export type OrgRole = (typeof ORG_ROLES)[number];

// ── Permission matrix ─────────────────────────────────────────────────────────
// Maps permission key → roles that hold it by default

const PM = {
  // Events
  "events:read":         ["owner","admin","finance","operations","volunteer_manager","communications","support","read_only"],
  "events:create":       ["owner","admin","operations"],
  "events:edit":         ["owner","admin","operations"],
  "events:delete":       ["owner","admin"],
  "events:publish":      ["owner","admin"],

  // Registrations
  "registrations:read":   ["owner","admin","finance","operations","volunteer_manager","support","read_only"],
  "registrations:manage": ["owner","admin","operations","support"],
  "registrations:export": ["owner","admin","finance","operations"],

  // Volunteers
  "volunteers:read":   ["owner","admin","operations","volunteer_manager","read_only"],
  "volunteers:manage": ["owner","admin","volunteer_manager"],

  // Communications
  "comms:read":      ["owner","admin","communications","support","read_only"],
  "comms:send":      ["owner","admin","communications"],
  "comms:templates": ["owner","admin","communications"],

  // Finance
  "finance:read":   ["owner","admin","finance","read_only"],
  "finance:export": ["owner","admin","finance"],
  "refunds:issue":  ["owner","admin","finance"],

  // Org members
  "members:read":   ["owner","admin","read_only"],
  "members:invite": ["owner","admin"],
  "members:remove": ["owner"],

  // Settings
  "settings:read":  ["owner","admin","read_only"],
  "settings:edit":  ["owner","admin"],
  "features:edit":  ["owner"],
  "billing:read":   ["owner","admin"],
  "billing:edit":   ["owner"],

  // Sponsors
  "sponsors:manage": ["owner","admin","operations"],

  // Certificates / invoices
  "certificates:manage": ["owner","admin","operations"],
  "invoices:read":       ["owner","admin","finance","support"],

  // Analytics
  "analytics:read": ["owner","admin","finance","operations","read_only"],

  // Audit
  "audit:read": ["owner","admin"],
} as const;

export type Permission = keyof typeof PM;

export function canDo(role: OrgRole, permission: Permission): boolean {
  const allowed = PM[permission] as readonly string[];
  return allowed.includes(role);
}

// ── Plan limits ───────────────────────────────────────────────────────────────

export const PLAN_LIMITS = {
  free: {
    max_events:                  3,
    max_members:                 2,
    max_registrations_per_event: 100,
    max_comm_templates:          5,
  },
  professional: {
    max_events:                  50,
    max_members:                 10,
    max_registrations_per_event: 5000,
    max_comm_templates:          50,
  },
  enterprise: {
    max_events:                  -1,
    max_members:                 -1,
    max_registrations_per_event: -1,
    max_comm_templates:          -1,
  },
} as const;

export type Plan = keyof typeof PLAN_LIMITS;

export function getLimitFor(plan: string, key: keyof (typeof PLAN_LIMITS)["free"]): number {
  const p = plan as Plan;
  return (PLAN_LIMITS[p] ?? PLAN_LIMITS.free)[key];
}

/** Returns true when the org is within the limit (-1 = unlimited). */
export function withinLimit(plan: string, key: keyof (typeof PLAN_LIMITS)["free"], current: number): boolean {
  const limit = getLimitFor(plan, key);
  return limit === -1 || current < limit;
}

// ── Feature flag defaults ─────────────────────────────────────────────────────
// All features ON by default (preserves existing behaviour for the default org).

export const FEATURE_KEYS = [
  "corporate_wellness",
  "memberships",
  "donations",
  "merchandise",
  "certificates",
  "achievements",
  "push_notifications",
  "whatsapp_comms",
  "email_comms",
  "referrals",
  "leaderboard",
  "waitlist",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

// ── Session token (org member) ─────────────────────────────────────────────────
// Token format: base64url(JSON payload) . HMAC-SHA256

export interface OrgMemberSession {
  email:  string;
  org_id: string;
  role:   OrgRole;
  exp:    number;
}

function getSecret(): string {
  const s = process.env.COACH_TOKEN_SECRET ?? process.env.ADMIN_PASSWORD;
  if (!s) throw new Error("COACH_TOKEN_SECRET must be set");
  return s;
}

export function signOrgMemberSession(email: string, org_id: string, role: OrgRole): string {
  const exp     = Math.floor(Date.now() / 1000) + ORG_SESSION_TTL;
  const payload = JSON.stringify({ email: email.toLowerCase(), org_id, role, exp });
  const b64     = Buffer.from(payload).toString("base64url");
  const hmac    = crypto.createHmac("sha256", getSecret()).update(b64).digest("hex");
  return `${b64}.${hmac}`;
}

export function verifyOrgMemberSession(token: string): OrgMemberSession | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const b64  = token.slice(0, dot);
  const hmac = token.slice(dot + 1);
  try {
    const expected = crypto.createHmac("sha256", getSecret()).update(b64).digest("hex");
    if (
      expected.length !== hmac.length ||
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hmac))
    ) return null;
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as OrgMemberSession;
    if (Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── Request context ───────────────────────────────────────────────────────────

export interface OrgContext {
  /** "super_admin" = existing cs_admin_session (no per-org scope restriction). */
  type:   "super_admin" | "org_member";
  email:  string | null;
  org_id: string | null;
  role:   OrgRole | null;
}

/**
 * Resolves the org context from the incoming request.
 * Priority: cs_admin_session (super-admin) → cs_org_session / x-org-token (org member).
 * Returns null when the request carries no valid credential.
 */
export async function getOrgContext(req: NextRequest): Promise<OrgContext | null> {
  // 1. Existing super-admin cookie (backward-compatible — no changes to current admin flow)
  const adminSession = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (adminSession && verifyAdminSession(adminSession)) {
    return { type: "super_admin", email: null, org_id: null, role: null };
  }

  // 2. Org-member session cookie or header
  const orgToken =
    req.cookies.get(ORG_SESSION_COOKIE)?.value ??
    req.headers.get("x-org-token") ??
    null;

  if (!orgToken) return null;

  const session = verifyOrgMemberSession(orgToken);
  if (!session) return null;

  // Verify membership is still active in DB
  const db = getSupabaseServer();
  const { data } = await db
    .from("organization_members")
    .select("role, is_active")
    .eq("organization_id", session.org_id)
    .eq("user_email", session.email)
    .single();

  if (!data?.is_active) return null;

  return {
    type:   "org_member",
    email:  session.email,
    org_id: session.org_id,
    role:   (data.role as OrgRole) ?? session.role,
  };
}

/**
 * Returns true when the context may access the requested org.
 * Super admins can access any org; org members are restricted to their own.
 */
export function canAccessOrg(ctx: OrgContext, org_id: string): boolean {
  if (ctx.type === "super_admin") return true;
  return ctx.org_id === org_id;
}

// ── Audit log helper ──────────────────────────────────────────────────────────

export async function writeOrgAudit(params: {
  organization_id: string;
  action:          string;
  actor_email:     string;
  resource_type?:  string;
  resource_id?:    string;
  detail?:         Record<string, unknown>;
  ip?:             string;
}): Promise<void> {
  try {
    const db = getSupabaseServer();
    await db.from("organization_audit_logs").insert({
      organization_id: params.organization_id,
      action:          params.action,
      actor_email:     params.actor_email,
      resource_type:   params.resource_type ?? null,
      resource_id:     params.resource_id   ?? null,
      detail:          params.detail        ?? null,
      ip:              params.ip            ?? null,
    });
  } catch {
    // Audit log failure must never break the main request
  }
}

// ── Utility: resolve actor email from context ─────────────────────────────────

export function actorEmail(ctx: OrgContext): string {
  return ctx.email ?? "admin";
}
