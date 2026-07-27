/**
 * Unit tests for API key generation, hashing, and scope checking.
 *
 * Does NOT hit the database — all DB calls are mocked.
 */

import crypto from "crypto";

// ── Minimal key utilities (extracted inline to avoid DB deps) ──────────────────

function generateApiKey(type: "live" | "test" = "live") {
  const raw    = crypto.randomBytes(24).toString("hex"); // 48 hex chars
  const prefix = `cs_${type}_${raw}`.slice(0, 12);
  const hash   = crypto.createHash("sha256").update(`cs_${type}_${raw}`).digest("hex");
  return { rawKey: `cs_${type}_${raw}`, prefix, hash };
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function hashKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("generateApiKey", () => {
  it("generates a cs_live_ prefixed key", () => {
    const { rawKey } = generateApiKey("live");
    expect(rawKey).toMatch(/^cs_live_[0-9a-f]{48}$/);
  });

  it("generates a cs_test_ prefixed key", () => {
    const { rawKey } = generateApiKey("test");
    expect(rawKey).toMatch(/^cs_test_[0-9a-f]{48}$/);
  });

  it("generates unique keys on each call", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.rawKey).not.toBe(b.rawKey);
    expect(a.hash).not.toBe(b.hash);
  });

  it("prefix is first 12 chars of raw key", () => {
    const { rawKey, prefix } = generateApiKey();
    expect(prefix).toBe(rawKey.slice(0, 12));
  });

  it("hash is a 64-char hex sha256", () => {
    const { hash } = generateApiKey();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rawKey and prefix are different (prefix is shorter)", () => {
    const { rawKey, prefix } = generateApiKey();
    expect(prefix.length).toBeLessThan(rawKey.length);
  });
});

describe("hash verification", () => {
  it("same key produces same hash", () => {
    const key = "cs_live_abc123def456";
    expect(hashKey(key)).toBe(hashKey(key));
  });

  it("different keys produce different hashes", () => {
    expect(hashKey("cs_live_aaa")).not.toBe(hashKey("cs_live_bbb"));
  });

  it("timingSafeEqual returns true for equal strings", () => {
    const h = hashKey("cs_live_test");
    expect(timingSafeEqual(h, h)).toBe(true);
  });

  it("timingSafeEqual returns false for different strings", () => {
    expect(timingSafeEqual(hashKey("a"), hashKey("b"))).toBe(false);
  });

  it("timingSafeEqual returns false for strings of different lengths", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});

describe("scope checking", () => {
  const ALL_SCOPES = [
    "events:read","events:write","registrations:read","registrations:write",
    "participants:read","participants:write","memberships:read","merchandise:read",
    "merchandise:write","finance:read","communications:read","communications:write",
    "webhooks:read","webhooks:write","import:write",
  ] as const;

  function hasScope(scopes: string[], required: string): boolean {
    return scopes.includes("*") || scopes.includes(required);
  }

  it("superscope '*' grants all scopes", () => {
    for (const scope of ALL_SCOPES) {
      expect(hasScope(["*"], scope)).toBe(true);
    }
  });

  it("specific scope grants only that scope", () => {
    expect(hasScope(["events:read"], "events:read")).toBe(true);
    expect(hasScope(["events:read"], "events:write")).toBe(false);
  });

  it("multiple scopes work correctly", () => {
    const scopes = ["events:read", "registrations:read", "finance:read"];
    expect(hasScope(scopes, "events:read")).toBe(true);
    expect(hasScope(scopes, "registrations:read")).toBe(true);
    expect(hasScope(scopes, "events:write")).toBe(false);
  });

  it("empty scope array denies everything", () => {
    for (const scope of ALL_SCOPES) {
      expect(hasScope([], scope)).toBe(false);
    }
  });
});
