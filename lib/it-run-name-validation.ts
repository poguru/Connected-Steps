/**
 * Participant name validation for The IT Run Sprint-2. One policy, used by the registration form,
 * the registration API (create and edit), and the admin participant editor.
 *
 * Allowed: letters in any script (\p{L}), combining marks such as Indian vowel signs (\p{M}),
 * single spaces between words, a hyphen (-), and an apostrophe (' or ’).
 * Not allowed: digits, emojis, symbols (@ / # $ & . , etc.), or names with only spaces.
 *
 * Not for company names or other fields with their own rules.
 */

export const PERSON_NAME_MAX = 60;
export const BIB_NAME_MAX = 50;

const NAME_CHARS = /^[\p{L}\p{M} \-'’]+$/u;
// Starts with a letter. Ends with a letter or a combining vowel sign (common in Indian scripts).
const EDGE_IS_LETTER = /^\p{L}[\s\S]*[\p{L}\p{M}]$|^\p{L}$/u;
const SEPARATOR_NEXT_TO_SPACE = /[\-'’] | [\-'’]/;
const DOUBLE_SEPARATOR = /[\-'’]{2}/;

export type NameCheck =
  | { ok: true; value: string }
  | { ok: false; message: string };

/** Trims, collapses repeated spaces, and keeps every other character exactly as typed. */
export function normalizeName(value: string): string {
  return value.replace(/ +/g, " ").trim();
}

function codePointLength(value: string): number {
  return [...value].length;
}

const CHARACTER_MESSAGE =
  "Use letters only. Spaces, hyphens (-) and apostrophes (') are allowed. Numbers, symbols and emojis are not.";

/** Checks a person's name (first name, last name, emergency contact). */
export function checkPersonName(input: unknown, label = "name"): NameCheck {
  if (typeof input !== "string") return { ok: false, message: `Enter your ${label}.` };
  const value = normalizeName(input);
  if (value.length === 0) return { ok: false, message: `Enter your ${label}.` };
  if (codePointLength(value) > PERSON_NAME_MAX) {
    return { ok: false, message: `Keep the ${label} under ${PERSON_NAME_MAX} characters.` };
  }
  if (!NAME_CHARS.test(value)) return { ok: false, message: CHARACTER_MESSAGE };
  if (!EDGE_IS_LETTER.test(value)) {
    return { ok: false, message: "A name must start and end with a letter." };
  }
  if (DOUBLE_SEPARATOR.test(value) || SEPARATOR_NEXT_TO_SPACE.test(value)) {
    return { ok: false, message: "Use one hyphen or apostrophe at a time, with no space next to it." };
  }
  return { ok: true, value };
}

/**
 * Checks the BIB name. The same character rules apply, with a shorter limit for printing.
 * The message says this is the name printed on the BIB.
 */
export function checkBibName(input: unknown): NameCheck {
  if (typeof input !== "string") return { ok: false, message: "Enter the name to print on your BIB." };
  const value = normalizeName(input);
  if (value.length === 0) return { ok: false, message: "Enter the name to print on your BIB." };
  if (codePointLength(value) > BIB_NAME_MAX) {
    return { ok: false, message: `The BIB name must be ${BIB_NAME_MAX} characters or fewer.` };
  }
  if (!NAME_CHARS.test(value)) {
    return { ok: false, message: `This name is printed on your BIB. ${CHARACTER_MESSAGE}` };
  }
  if (!EDGE_IS_LETTER.test(value)) {
    return { ok: false, message: "A BIB name must start and end with a letter." };
  }
  if (DOUBLE_SEPARATOR.test(value) || SEPARATOR_NEXT_TO_SPACE.test(value)) {
    return { ok: false, message: "Use one hyphen or apostrophe at a time, with no space next to it." };
  }
  return { ok: true, value };
}

/** Live hint under the BIB field: what will be printed, or why it cannot be. */
export function bibNameHint(input: string): { tone: "ok" | "error"; text: string } {
  const r = checkBibName(input);
  return r.ok
    ? { tone: "ok", text: `This name will be printed on your BIB: ${r.value}` }
    : { tone: "error", text: r.message };
}
