/**
 * Rules for BIB collection counter labels. The counters themselves are stored in it_run_bib_counters and managed by
 * event admins through the admin API.
 */

export const COUNTER_LABEL_MAX = 40;

/**
 * A trimmed, collapsed label, or an error message. A label is printed on the staff screen, so it holds letters,
 * digits, spaces and a few punctuation marks only.
 */
export function normalizeCounterLabel(input: unknown): { ok: true; label: string } | { ok: false; message: string } {
  if (typeof input !== "string") return { ok: false, message: "Enter a counter label." };
  const label = input.replace(/\s+/g, " ").trim();
  if (label.length === 0) return { ok: false, message: "Enter a counter label." };
  if (label.length > COUNTER_LABEL_MAX) {
    return { ok: false, message: `The counter label must be ${COUNTER_LABEL_MAX} characters or fewer.` };
  }
  if (!/^[\p{L}\p{N}][\p{L}\p{N} .,&()'-]*$/u.test(label)) {
    return { ok: false, message: "Use letters, numbers, spaces and . , & ( ) ' - only." };
  }
  return { ok: true, label };
}
