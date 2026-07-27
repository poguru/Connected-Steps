/**
 * Tests for webhook payload signing and verification.
 * Mirrors the logic in lib/webhook-dispatch.ts — no DB interaction.
 */

import crypto from "crypto";

// ── Signing utilities (mirrored from webhook-dispatch.ts) ─────────────────────

function signWebhookPayload(body: string, secret: string, ts?: number): string {
  const timestamp  = ts ?? Date.now();
  const toSign     = `${timestamp}.${body}`;
  const signature  = crypto.createHmac("sha256", secret).update(toSign).digest("hex");
  return `t=${timestamp},sha256=${signature}`;
}

function verifyWebhookSignature(
  body:         string,
  header:       string,
  secret:       string,
  toleranceMs = 300_000,
): boolean {
  const parts   = Object.fromEntries(header.split(",").map(p => p.split("=") as [string, string]));
  const ts      = parseInt(parts["t"] ?? "0", 10);
  const sig     = parts["sha256"] ?? "";
  if (!ts || !sig) return false;
  if (Math.abs(Date.now() - ts) > toleranceMs) return false;

  const toSign   = `${ts}.${body}`;
  const expected = crypto.createHmac("sha256", secret).update(toSign).digest("hex");
  const expBuf   = Buffer.from(expected, "utf8");
  const sigBuf   = Buffer.from(sig,      "utf8");
  if (expBuf.length !== sigBuf.length) return false;
  return crypto.timingSafeEqual(expBuf, sigBuf);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const SECRET  = crypto.randomBytes(32).toString("hex");
const BODY    = JSON.stringify({ event: "payment.succeeded", data: { amount: 1000 } });

describe("signWebhookPayload", () => {
  it("produces a t=...,sha256=... header", () => {
    const header = signWebhookPayload(BODY, SECRET);
    expect(header).toMatch(/^t=\d+,sha256=[0-9a-f]{64}$/);
  });

  it("includes a timestamp close to now", () => {
    const before = Date.now();
    const header = signWebhookPayload(BODY, SECRET);
    const after  = Date.now();
    const ts     = parseInt(header.split(",")[0].split("=")[1], 10);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("same inputs produce the same signature", () => {
    const ts  = Date.now();
    const h1  = signWebhookPayload(BODY, SECRET, ts);
    const h2  = signWebhookPayload(BODY, SECRET, ts);
    expect(h1).toBe(h2);
  });

  it("different secrets produce different signatures", () => {
    const ts    = Date.now();
    const h1    = signWebhookPayload(BODY, SECRET, ts);
    const h2    = signWebhookPayload(BODY, crypto.randomBytes(32).toString("hex"), ts);
    expect(h1).not.toBe(h2);
  });

  it("different bodies produce different signatures", () => {
    const ts  = Date.now();
    const h1  = signWebhookPayload(BODY, SECRET, ts);
    const h2  = signWebhookPayload(JSON.stringify({ event: "different" }), SECRET, ts);
    expect(h1).not.toBe(h2);
  });
});

describe("verifyWebhookSignature", () => {
  it("verifies a correctly signed payload", () => {
    const header = signWebhookPayload(BODY, SECRET);
    expect(verifyWebhookSignature(BODY, header, SECRET)).toBe(true);
  });

  it("rejects a payload signed with a different secret", () => {
    const wrongSecret = crypto.randomBytes(32).toString("hex");
    const header      = signWebhookPayload(BODY, wrongSecret);
    expect(verifyWebhookSignature(BODY, header, SECRET)).toBe(false);
  });

  it("rejects a tampered body", () => {
    const header  = signWebhookPayload(BODY, SECRET);
    const tampered = JSON.stringify({ event: "payment.succeeded", data: { amount: 9999 } });
    expect(verifyWebhookSignature(tampered, header, SECRET)).toBe(false);
  });

  it("rejects an expired timestamp (outside tolerance)", () => {
    const oldTs  = Date.now() - 400_000; // 400 seconds ago
    const header = signWebhookPayload(BODY, SECRET, oldTs);
    expect(verifyWebhookSignature(BODY, header, SECRET, 300_000)).toBe(false);
  });

  it("accepts a timestamp within tolerance", () => {
    const recentTs = Date.now() - 60_000; // 1 minute ago
    const header   = signWebhookPayload(BODY, SECRET, recentTs);
    expect(verifyWebhookSignature(BODY, header, SECRET, 300_000)).toBe(true);
  });

  it("rejects a malformed header (no t= field)", () => {
    expect(verifyWebhookSignature(BODY, "sha256=abc", SECRET)).toBe(false);
  });

  it("rejects a malformed header (no sha256= field)", () => {
    expect(verifyWebhookSignature(BODY, `t=${Date.now()}`, SECRET)).toBe(false);
  });

  it("rejects an empty header", () => {
    expect(verifyWebhookSignature(BODY, "", SECRET)).toBe(false);
  });
});
