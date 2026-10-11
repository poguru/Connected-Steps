/**
 * Refund for a participant whose ID could not be verified (The IT Run Sprint-2).
 *
 *   Company ID, not produced or not valid at registration or after a clarification request:
 *     refund everything except the 4% platform charge. Registration cancelled.
 *   Government ID, IT employment not verified on BIB collection day:
 *     refund 80%. Charges cannot be refunded, so 20% is kept. Registration cancelled.
 *     (The alternative, running without a timing chip, is a BIB decision and is not a refund.)
 *
 * Any other combination has no rule yet and is refused. Amounts are in paise, rounded down.
 */

export const COMPANY_ID_PLATFORM_CHARGE_PERCENT = 4;
export const GOVERNMENT_ID_BIB_REFUND_PERCENT = 80;

export type IdFailureStage = "verification" | "bib_collection";

export const ID_FAILURE_STAGES: readonly IdFailureStage[] = ["verification", "bib_collection"];

export type IdFailureRefund =
  | { ok: true; refundPaise: number; retainedPaise: number }
  | { ok: false; message: string };

export function idFailureRefundPaise(
  paidPaise: number,
  documentType: string | null,
  stage: string,
): IdFailureRefund {
  if (!Number.isInteger(paidPaise) || paidPaise <= 0) {
    return { ok: false, message: "There is no paid amount to refund." };
  }

  let refundPaise: number | null = null;
  if (documentType === "company" && stage === "verification") {
    refundPaise = Math.floor((paidPaise * (100 - COMPANY_ID_PLATFORM_CHARGE_PERCENT)) / 100);
  } else if (documentType === "government" && stage === "bib_collection") {
    refundPaise = Math.floor((paidPaise * GOVERNMENT_ID_BIB_REFUND_PERCENT) / 100);
  }

  if (refundPaise === null) {
    return { ok: false, message: "No refund rule applies to this ID and stage. Nothing has been refunded." };
  }
  return { ok: true, refundPaise, retainedPaise: paidPaise - refundPaise };
}
