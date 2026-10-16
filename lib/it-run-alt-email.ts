/**
 * The optional alternative email for an IT Run participant, and who receives each message.
 *
 * Policy: every message goes to the primary address and, when one is given, to the alternative address too. The same
 * address is never sent twice, however it was typed. A participant without an alternative address is unchanged.
 */

import { isValidEmail } from "@/lib/it-run-validation";

/** The stored form of an alternative email: trimmed, or null when left empty. Invalid values are reported, not stored. */
export function normalizeAltEmail(input: unknown): { ok: true; value: string | null } | { ok: false; message: string } {
  if (input === undefined || input === null) return { ok: true, value: null };
  if (typeof input !== "string") return { ok: false, message: "Enter a valid alternative email address." };
  const value = input.trim();
  if (value.length === 0) return { ok: true, value: null };
  if (!isValidEmail(value)) return { ok: false, message: "Enter a valid alternative email address." };
  return { ok: true, value };
}

/**
 * The addresses a message is sent to: the primary and alternative addresses of each person in the booking, with blanks
 * and duplicates (ignoring case and spaces) removed. The first spelling seen is kept.
 */
export function recipientsFor(addresses: Array<string | null | undefined>): string[] {
  const seen = new Map<string, string>();
  for (const raw of addresses) {
    const value = (raw ?? "").trim();
    if (value && !seen.has(value.toLowerCase())) seen.set(value.toLowerCase(), value);
  }
  return Array.from(seen.values());
}

/** The value to store for a validated alternative email: the trimmed address, or null when none was given. */
export function altEmailOrNull(input: unknown): string | null {
  const r = normalizeAltEmail(input);
  return r.ok ? r.value : null;
}
