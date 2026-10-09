/**
 * Company ID correction links.
 *
 * A link carries an encrypted, expiring token (AES-256-GCM, so it is both hidden and tamper-evident).
 * The token holds:
 *   p  participant ID        (encrypted; never readable from the URL)
 *   d  fingerprint of the company ID document the link was issued for
 *   e  expiry time (ms since epoch)
 *
 * The fingerprint makes a link go stale as soon as a newer document is submitted, so an old email
 * cannot overwrite a newer submission. Every email path builds its link with buildCompanyIdCorrectionUrl.
 */

import crypto from "crypto";
import { itRunActionKey } from "@/lib/it-run-auth";

export const COMPANY_ID_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const PURPOSE = "company-id-correction";
const PATH = "/it-run/company-id";

export interface CorrectionTokenPayload {
  participantId: string;
  documentFingerprint: string;
  expiresAt: number;
}

export type CorrectionTokenResult =
  | { ok: true; payload: CorrectionTokenPayload }
  | { ok: false; reason: "invalid" | "expired" };

/** Fingerprint of the stored document path. Used so a token is valid only for that document. */
export function documentFingerprint(companyIdUrl: string): string {
  return crypto.createHash("sha256").update(companyIdUrl).digest("hex").slice(0, 32);
}

export function issueCorrectionToken(
  participantId: string,
  companyIdUrl: string,
  now: number = Date.now(),
): string {
  const payload: CorrectionTokenPayload = {
    participantId,
    documentFingerprint: documentFingerprint(companyIdUrl),
    expiresAt: now + COMPANY_ID_LINK_TTL_MS,
  };
  const key = itRunActionKey(PURPOSE);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

export function verifyCorrectionToken(token: string, now: number = Date.now()): CorrectionTokenResult {
  if (typeof token !== "string" || token.length < 40 || token.length > 1024) {
    return { ok: false, reason: "invalid" };
  }
  let raw: Buffer;
  try {
    raw = Buffer.from(token, "base64url");
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (raw.length < 12 + 16 + 1) return { ok: false, reason: "invalid" };

  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);

  let plain: string;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", itRunActionKey(PURPOSE), iv);
    decipher.setAuthTag(tag);
    plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // Wrong key, altered bytes, or a token from another purpose all fail authentication here
    return { ok: false, reason: "invalid" };
  }

  let payload: CorrectionTokenPayload;
  try {
    payload = JSON.parse(plain) as CorrectionTokenPayload;
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (
    typeof payload.participantId !== "string" ||
    typeof payload.documentFingerprint !== "string" ||
    typeof payload.expiresAt !== "number"
  ) {
    return { ok: false, reason: "invalid" };
  }
  if (payload.expiresAt <= now) return { ok: false, reason: "expired" };
  return { ok: true, payload };
}

/** The one place that builds correction links. Used by every verification email path. */
export function buildCompanyIdCorrectionUrl(participantId: string, companyIdUrl: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";
  return `${base}${PATH}?t=${encodeURIComponent(issueCorrectionToken(participantId, companyIdUrl))}`;
}
