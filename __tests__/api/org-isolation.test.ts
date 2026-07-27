/**
 * Organization isolation tests
 *
 * Tests verify:
 * - Org creation and CRUD
 * - Data isolation: org members cannot access other orgs' data
 * - Role-based permission enforcement
 * - Cross-org access prevention
 * - Plan limit enforcement
 * - Feature flag evaluation
 */

process.env.COACH_TOKEN_SECRET = "test-secret-for-org-isolation-tests";
process.env.ADMIN_PASSWORD     = "test-secret-for-org-isolation-tests";
process.env.NEXT_PUBLIC_SUPABASE_URL      = "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY     = "test-service-role-key";

import { NextRequest } from "next/server";

// ── Helpers ────────────────────────────────────────────────────────────────────

import {
  signOrgMemberSession, verifyOrgMemberSession,
  canDo, withinLimit, getLimitFor, PLAN_LIMITS,
  canAccessOrg, FEATURE_KEYS, DEFAULT_ORG_ID,
  type OrgRole, type OrgContext,
} from "@/lib/org-auth";
import { signAdminSession, ADMIN_SESSION_COOKIE } from "@/lib/admin-auth";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";

function makeOrgCtx(email: string, org_id: string, role: OrgRole): OrgContext {
  return { type: "org_member", email, org_id, role };
}
function makeSuperAdminCtx(): OrgContext {
  return { type: "super_admin", email: null, org_id: null, role: null };
}

// ── Session token tests ────────────────────────────────────────────────────────

describe("OrgMemberSession", () => {
  it("signs and verifies a valid session", () => {
    const token = signOrgMemberSession("alice@a.com", ORG_A, "admin");
    const session = verifyOrgMemberSession(token);
    expect(session).not.toBeNull();
    expect(session?.email).toBe("alice@a.com");
    expect(session?.org_id).toBe(ORG_A);
    expect(session?.role).toBe("admin");
  });

  it("normalises email to lowercase", () => {
    const token = signOrgMemberSession("ALICE@A.COM", ORG_A, "owner");
    const session = verifyOrgMemberSession(token);
    expect(session?.email).toBe("alice@a.com");
  });

  it("rejects a tampered token", () => {
    const token = signOrgMemberSession("alice@a.com", ORG_A, "owner");
    const tampered = token.slice(0, -4) + "xxxx";
    expect(verifyOrgMemberSession(tampered)).toBeNull();
  });

  it("rejects a token with wrong format", () => {
    expect(verifyOrgMemberSession("not.a.valid.org.token.at.all")).toBeNull();
    expect(verifyOrgMemberSession("")).toBeNull();
  });
});

// ── Permission matrix tests ────────────────────────────────────────────────────

describe("canDo — permission matrix", () => {
  it("owner can do everything", () => {
    const owner: OrgRole = "owner";
    expect(canDo(owner, "events:create")).toBe(true);
    expect(canDo(owner, "events:delete")).toBe(true);
    expect(canDo(owner, "billing:edit")).toBe(true);
    expect(canDo(owner, "members:remove")).toBe(true);
    expect(canDo(owner, "features:edit")).toBe(true);
    expect(canDo(owner, "refunds:issue")).toBe(true);
  });

  it("read_only can only read, not write", () => {
    const ro: OrgRole = "read_only";
    expect(canDo(ro, "events:read")).toBe(true);
    expect(canDo(ro, "registrations:read")).toBe(true);
    expect(canDo(ro, "analytics:read")).toBe(true);
    expect(canDo(ro, "events:create")).toBe(false);
    expect(canDo(ro, "events:delete")).toBe(false);
    expect(canDo(ro, "comms:send")).toBe(false);
    expect(canDo(ro, "refunds:issue")).toBe(false);
    expect(canDo(ro, "billing:edit")).toBe(false);
    expect(canDo(ro, "members:remove")).toBe(false);
  });

  it("finance can read finance but not create events", () => {
    const fin: OrgRole = "finance";
    expect(canDo(fin, "finance:read")).toBe(true);
    expect(canDo(fin, "finance:export")).toBe(true);
    expect(canDo(fin, "refunds:issue")).toBe(true);
    expect(canDo(fin, "events:create")).toBe(false);
    expect(canDo(fin, "comms:send")).toBe(false);
    expect(canDo(fin, "features:edit")).toBe(false);
  });

  it("communications can send messages but not manage events", () => {
    const comms: OrgRole = "communications";
    expect(canDo(comms, "comms:send")).toBe(true);
    expect(canDo(comms, "comms:templates")).toBe(true);
    expect(canDo(comms, "events:delete")).toBe(false);
    expect(canDo(comms, "billing:edit")).toBe(false);
  });

  it("volunteer_manager can manage volunteers but not finance", () => {
    const vm: OrgRole = "volunteer_manager";
    expect(canDo(vm, "volunteers:manage")).toBe(true);
    expect(canDo(vm, "registrations:read")).toBe(true);
    expect(canDo(vm, "finance:export")).toBe(false);
    expect(canDo(vm, "refunds:issue")).toBe(false);
    expect(canDo(vm, "comms:send")).toBe(false);
  });

  it("support can read registrations but not send comms", () => {
    const sup: OrgRole = "support";
    expect(canDo(sup, "registrations:read")).toBe(true);
    expect(canDo(sup, "invoices:read")).toBe(true);
    expect(canDo(sup, "comms:send")).toBe(false);
    expect(canDo(sup, "events:create")).toBe(false);
    expect(canDo(sup, "billing:read")).toBe(false);
  });
});

// ── Org scoping tests ─────────────────────────────────────────────────────────

describe("canAccessOrg — data isolation", () => {
  it("super admin can access any org", () => {
    const ctx = makeSuperAdminCtx();
    expect(canAccessOrg(ctx, ORG_A)).toBe(true);
    expect(canAccessOrg(ctx, ORG_B)).toBe(true);
    expect(canAccessOrg(ctx, "any-random-id")).toBe(true);
  });

  it("org member can only access their own org", () => {
    const ctx = makeOrgCtx("alice@a.com", ORG_A, "admin");
    expect(canAccessOrg(ctx, ORG_A)).toBe(true);
    expect(canAccessOrg(ctx, ORG_B)).toBe(false);
  });

  it("org owner cannot access a different org", () => {
    const ctx = makeOrgCtx("bob@b.com", ORG_B, "owner");
    expect(canAccessOrg(ctx, ORG_A)).toBe(false);
    expect(canAccessOrg(ctx, ORG_B)).toBe(true);
  });

  it("cross-org access is blocked even for high-privilege roles", () => {
    const ctx = makeOrgCtx("alice@a.com", ORG_A, "owner");
    expect(canAccessOrg(ctx, ORG_B)).toBe(false);
    expect(canAccessOrg(ctx, DEFAULT_ORG_ID)).toBe(false);
  });
});

// ── Plan limit tests ──────────────────────────────────────────────────────────

describe("Plan limits", () => {
  it("free plan limits are correct", () => {
    expect(getLimitFor("free", "max_events")).toBe(3);
    expect(getLimitFor("free", "max_members")).toBe(2);
    expect(getLimitFor("free", "max_registrations_per_event")).toBe(100);
    expect(getLimitFor("free", "max_comm_templates")).toBe(5);
  });

  it("professional plan limits are correct", () => {
    expect(getLimitFor("professional", "max_events")).toBe(50);
    expect(getLimitFor("professional", "max_members")).toBe(10);
    expect(getLimitFor("professional", "max_registrations_per_event")).toBe(5000);
  });

  it("enterprise plan has no limits (-1)", () => {
    expect(getLimitFor("enterprise", "max_events")).toBe(-1);
    expect(getLimitFor("enterprise", "max_members")).toBe(-1);
    expect(getLimitFor("enterprise", "max_registrations_per_event")).toBe(-1);
  });

  it("withinLimit enforces free plan event cap", () => {
    expect(withinLimit("free", "max_events", 0)).toBe(true);   // 0 < 3
    expect(withinLimit("free", "max_events", 2)).toBe(true);   // 2 < 3
    expect(withinLimit("free", "max_events", 3)).toBe(false);  // 3 is NOT < 3
    expect(withinLimit("free", "max_events", 10)).toBe(false);
  });

  it("withinLimit enforces free plan member cap", () => {
    expect(withinLimit("free", "max_members", 1)).toBe(true);
    expect(withinLimit("free", "max_members", 2)).toBe(false);
  });

  it("withinLimit always returns true for enterprise", () => {
    expect(withinLimit("enterprise", "max_events", 10000)).toBe(true);
    expect(withinLimit("enterprise", "max_members", 99999)).toBe(true);
    expect(withinLimit("enterprise", "max_registrations_per_event", 999999)).toBe(true);
  });

  it("withinLimit uses free plan as fallback for unknown plan", () => {
    expect(withinLimit("unknown_plan", "max_events", 3)).toBe(false);
    expect(withinLimit("unknown_plan", "max_events", 2)).toBe(true);
  });
});

// ── Feature key tests ─────────────────────────────────────────────────────────

describe("Feature keys", () => {
  it("all expected feature keys are defined", () => {
    expect(FEATURE_KEYS).toContain("corporate_wellness");
    expect(FEATURE_KEYS).toContain("memberships");
    expect(FEATURE_KEYS).toContain("certificates");
    expect(FEATURE_KEYS).toContain("achievements");
    expect(FEATURE_KEYS).toContain("push_notifications");
    expect(FEATURE_KEYS).toContain("whatsapp_comms");
    expect(FEATURE_KEYS).toContain("email_comms");
    expect(FEATURE_KEYS).toContain("referrals");
    expect(FEATURE_KEYS).toContain("leaderboard");
  });
});

// ── API-level isolation tests (mock fetch) ────────────────────────────────────

import * as OrgAuthModule from "@/lib/org-auth";

// Mock DB to return controlled data
jest.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => ({
    from: jest.fn((table: string) => ({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      in:     jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
  }),
}));

describe("getOrgContext — request resolution", () => {
  it("returns super_admin context for valid cs_admin_session", async () => {
    const token  = signAdminSession();
    const req    = new NextRequest("http://localhost/api/admin/orgs", {
      headers: { cookie: `${ADMIN_SESSION_COOKIE}=${token}` },
    });
    const ctx = await OrgAuthModule.getOrgContext(req);
    expect(ctx?.type).toBe("super_admin");
    expect(ctx?.org_id).toBeNull();
    expect(ctx?.role).toBeNull();
  });

  it("returns null for expired/invalid org token", async () => {
    const req = new NextRequest("http://localhost/api/admin/orgs", {
      headers: { cookie: "cs_org_session=invalid.token" },
    });
    const ctx = await OrgAuthModule.getOrgContext(req);
    expect(ctx).toBeNull();
  });

  it("returns null when no auth token present", async () => {
    const req = new NextRequest("http://localhost/api/admin/orgs");
    const ctx = await OrgAuthModule.getOrgContext(req);
    expect(ctx).toBeNull();
  });
});

// ── Billing plan limits definition completeness ───────────────────────────────

describe("PLAN_LIMITS schema", () => {
  const plans: Array<keyof typeof PLAN_LIMITS> = ["free", "professional", "enterprise"];
  const requiredKeys: Array<keyof (typeof PLAN_LIMITS)["free"]> = [
    "max_events", "max_members", "max_registrations_per_event", "max_comm_templates",
  ];

  plans.forEach(plan => {
    requiredKeys.forEach(key => {
      it(`${plan}.${key} is defined`, () => {
        expect(PLAN_LIMITS[plan][key]).toBeDefined();
        expect(typeof PLAN_LIMITS[plan][key]).toBe("number");
      });
    });
  });

  it("enterprise plan has -1 for all limits", () => {
    requiredKeys.forEach(k => {
      expect(PLAN_LIMITS.enterprise[k]).toBe(-1);
    });
  });
});

// ── Role hierarchy sanity check ───────────────────────────────────────────────

describe("Role escalation prevention", () => {
  it("read_only cannot do anything an owner can exclusively do", () => {
    const exclusiveOwnerPerms = ["members:remove", "features:edit", "billing:edit"] as const;
    exclusiveOwnerPerms.forEach(perm => {
      expect(canDo("read_only", perm)).toBe(false);
    });
  });

  it("admin cannot change feature flags (owner-only)", () => {
    expect(canDo("admin", "features:edit")).toBe(false);
  });

  it("admin cannot remove members (owner-only)", () => {
    expect(canDo("admin", "members:remove")).toBe(false);
  });
});
