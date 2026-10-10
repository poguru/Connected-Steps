/**
 * The refund reason rule, shared by the participant panel, the downgrade request and the refund-request API.
 *
 * Required. Trimmed before the length check. At least 10 characters after trimming, and at most 1000,
 * which matches the database constraint on it_run_refund_requests.request_reason. Length is counted in
 * characters (code points), the same way PostgreSQL counts char_length, so a reason the browser accepts
 * is never rejected by the database.
 */

export const REFUND_REASON_MIN = 10;
export const REFUND_REASON_MAX = 1000;

export const REFUND_REASON_MESSAGES = {
  required: "Refund reason is required.",
  blank: "Please enter a valid refund reason.",
  tooShort: `Please describe the reason in at least ${REFUND_REASON_MIN} characters.`,
  tooLong: `Please keep the reason to ${REFUND_REASON_MAX} characters or fewer.`,
} as const;

export type RefundReasonCheck =
  | { ok: true; value: string }
  | { ok: false; message: string };

/** Validates a reason from any source. Non-strings are treated as missing. */
export function checkRefundReason(input: unknown): RefundReasonCheck {
  if (typeof input !== "string" || input.length === 0) {
    return { ok: false, message: REFUND_REASON_MESSAGES.required };
  }
  const value = input.trim();
  if (value.length === 0) {
    return { ok: false, message: REFUND_REASON_MESSAGES.blank };
  }
  const chars = Array.from(value).length;
  if (chars < REFUND_REASON_MIN) {
    return { ok: false, message: REFUND_REASON_MESSAGES.tooShort };
  }
  if (chars > REFUND_REASON_MAX) {
    return { ok: false, message: REFUND_REASON_MESSAGES.tooLong };
  }
  return { ok: true, value };
}
