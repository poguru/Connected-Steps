/**
 * Participant dashboard links.
 *
 * The link in confirmation emails and on the registration success page is /it-run/dashboard/<token>.
 * The token is an AES-256-GCM encrypted, expiring envelope around the registration code, so the
 * code never appears in the URL. It is tamper-evident and valid for 90 days, which covers the
 * period up to and after the event.
 *
 * The token authorizes read access to one registration. It does not sign anyone in and it does not
 * change any registration, payment, BIB, or QR state. Opening the link is read-only.
 *
 * Plain registration codes in the URL (older links) are accepted only from a signed-in account that
 * owns the registration. See app/api/it-run/dashboard/[code]/route.ts.
 */

import crypto from "crypto";
import { itRunActionKey } from "@/lib/it-run-auth";

export const DASHBOARD_LINK_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const PURPOSE = "dashboard-access";
const PATH = "/it-run/dashboard";

export type DashboardTokenResult =
  | { ok: true; registrationCode: string }
  | { ok: false; reason: "invalid" | "expired" };

export function issueDashboardToken(registrationCode: string, now: number = Date.now()): string {
  const plain = JSON.stringify({ g: registrationCode, e: now + DASHBOARD_LINK_TTL_MS });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", itRunActionKey(PURPOSE), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

export function verifyDashboardToken(token: string, now: number = Date.now()): DashboardTokenResult {
  // Registration codes and anything not shaped like a token are rejected here, so the caller can
  // treat them as plain codes that need a signed-in owner.
  if (typeof token !== "string" || token.length < 60 || token.length > 512) {
    return { ok: false, reason: "invalid" };
  }
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return { ok: false, reason: "invalid" };

  const raw = Buffer.from(token, "base64url");
  if (raw.length < 12 + 16 + 1) return { ok: false, reason: "invalid" };

  let plain: string;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", itRunActionKey(PURPOSE), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    plain = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return { ok: false, reason: "invalid" };
  }

  let payload: { g?: unknown; e?: unknown };
  try {
    payload = JSON.parse(plain) as { g?: unknown; e?: unknown };
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (typeof payload.g !== "string" || payload.g.length === 0 || typeof payload.e !== "number") {
    return { ok: false, reason: "invalid" };
  }
  if (payload.e <= now) return { ok: false, reason: "expired" };
  return { ok: true, registrationCode: payload.g };
}

/** The one place that builds dashboard links. Every email and the registration page use it. */
export function buildDashboardUrl(registrationCode: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";
  return `${base}${PATH}/${issueDashboardToken(registrationCode)}`;
}
