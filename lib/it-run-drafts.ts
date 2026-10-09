/**
 * Server-side registration drafts (save and resume) for The IT Run Sprint-2.
 *
 * A draft is in-progress form state. It is never a registration, never reserves capacity, never
 * applies a coupon, and never creates a payment order. Those happen only on the register API.
 *
 * Pure helpers live here so they can be tested without a database.
 */

import crypto from "crypto";

export const DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
export const MAX_DRAFT_PARTICIPANTS = 50;
const MAX_STRING = 200;
const MAX_KEY = 64;

const TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;

/** A new unguessable draft token. Only its hash is stored on the server. */
export function newDraftToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function isWellFormedDraftToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN_RE.test(token);
}

export function hashDraftToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export interface DraftState {
  step: number;
  participantSubIdx: number;
  selectedCatId: string;
  couponCode: string;
  participants: Array<Record<string, string | number | boolean | null>>;
}

export type DraftValidation =
  | { ok: true; state: DraftState }
  | { ok: false; message: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Accepts only the fields a draft needs. Rejects nested objects and oversized values. Drops
 * everything else, including any regId, regCode, finalPrice, or payment field, so a draft can never
 * carry registration or payment state.
 */
export function validateDraftState(input: unknown): DraftValidation {
  if (!isPlainObject(input)) return { ok: false, message: "Draft must be an object." };

  const { step, participantSubIdx, selectedCatId, couponCode, participants } = input;

  if (!Number.isInteger(step) || (step as number) < 1 || (step as number) > 6) {
    return { ok: false, message: "Draft step must be between 1 and 6." };
  }
  if (!Number.isInteger(participantSubIdx) || (participantSubIdx as number) < 0 ||
      (participantSubIdx as number) >= MAX_DRAFT_PARTICIPANTS) {
    return { ok: false, message: "Participant position is out of range." };
  }
  if (typeof selectedCatId !== "string" || selectedCatId.length === 0 || selectedCatId.length > 64) {
    return { ok: false, message: "A category must be selected to save." };
  }
  const coupon = couponCode === undefined || couponCode === null ? "" : couponCode;
  if (typeof coupon !== "string" || coupon.length > 40) {
    return { ok: false, message: "Coupon code is too long." };
  }
  if (!Array.isArray(participants) || participants.length === 0 || participants.length > MAX_DRAFT_PARTICIPANTS) {
    return { ok: false, message: `A draft needs between 1 and ${MAX_DRAFT_PARTICIPANTS} participants.` };
  }

  const cleanParticipants: DraftState["participants"] = [];
  for (const p of participants) {
    if (!isPlainObject(p)) return { ok: false, message: "Each participant must be an object." };
    const clean: Record<string, string | number | boolean | null> = {};
    for (const [key, value] of Object.entries(p)) {
      if (key.length > MAX_KEY) return { ok: false, message: "A participant field name is too long." };
      if (value === undefined) continue;
      if (value === null || typeof value === "boolean" || typeof value === "number") {
        clean[key] = value;
      } else if (typeof value === "string") {
        if (value.length > MAX_STRING) return { ok: false, message: "A participant field is too long." };
        clean[key] = value;
      }
      // Objects, arrays, and functions are dropped: participant fields are flat values
    }
    cleanParticipants.push(clean);
  }

  return {
    ok: true,
    state: {
      step: step as number,
      participantSubIdx: participantSubIdx as number,
      selectedCatId,
      couponCode: coupon,
      participants: cleanParticipants,
    },
  };
}
