/**
 * Whether a runner can be handed a BIB at the collection desk, decided on the server from the recorded facts.
 *
 * Policy: a BIB is issued only once the adult's identity is company-verified. A runner who registered with a government
 * ID is company-verified at the desk after the physical check. Children are exempt from the employment check.
 */

export type CollectionState =
  | "ready"
  | "cancelled"
  | "already_collected"
  | "not_confirmed"
  | "needs_desk_verification"
  | "no_bib";

export interface CollectionFacts {
  cancelled: boolean;
  paymentStatus: string;
  participantType: string;
  verificationOutcome: string | null;
  bibNumber: string | null;
  bibCollected: boolean;
}

export interface CollectionReadiness {
  state: CollectionState;
  message: string;
}

export function collectionReadiness(f: CollectionFacts): CollectionReadiness {
  if (f.cancelled) {
    return { state: "cancelled", message: "This runner's category was cancelled after an ID was rejected. Do not issue a BIB." };
  }
  if (f.bibCollected) {
    return { state: "already_collected", message: "A BIB was already collected for this runner." };
  }
  if (f.paymentStatus !== "paid" && f.paymentStatus !== "free") {
    return { state: "not_confirmed", message: "The registration is not paid or confirmed, so no BIB can be issued." };
  }
  const isChild = f.participantType === "child";
  if (!isChild && f.verificationOutcome !== "company_verified") {
    return {
      state: "needs_desk_verification",
      message: "Company ID is not verified yet. Check the company ID at this desk. If it is valid, record Company ID Verified. If not, the runner can proceed without a BIB.",
    };
  }
  if (!f.bibNumber) {
    return { state: "no_bib", message: "The BIB number has not been allocated yet. Ask an admin to allocate BIB numbers." };
  }
  return { state: "ready", message: "Ready. Send the runner to the assigned counter." };
}

/**
 * The refund share for a runner who goes without a BIB at the desk: 90% if it happens before registration closes,
 * 50% once registration has closed. With no closing time recorded, registration is treated as still open.
 */
export function noBibRefundPercent(registrationClosesAt: string | null, now: Date): number {
  if (!registrationClosesAt) return 90;
  const closes = new Date(registrationClosesAt).getTime();
  if (!Number.isFinite(closes)) return 90;
  return now.getTime() >= closes ? 50 : 90;
}
