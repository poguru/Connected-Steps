/**
 * The identity-verification outcome, and the rules for each review decision.
 *
 * Two different facts are recorded, and they are never mixed:
 *   - government_verified: a government-issued ID was checked and accepted. It does not prove employment.
 *   - company_verified:    employment proof (a company ID) was checked and accepted, either online or by the manual desk
 *                          at BIB collection. A participant who registered with a government ID can reach this outcome
 *                          there, after the physical check.
 *
 * A rejection cancels that runner's category (not the whole booking), with the refund rule (see it-run-category-cancel).
 * Clarification is the choice when the reviewer is not sure: it cancels nothing.
 */

export type VerificationOutcome = "government_verified" | "company_verified";

export type ReviewAction = "verified" | "company_verified" | "rejected" | "need_clarification";

/**
 * The outcome to store for a decision. "verified" is the standard online check: the outcome follows the document type
 * that was checked. "company_verified" is the explicit employment check, and it applies whatever document was supplied.
 * Returns null for decisions that do not verify anyone.
 */
export function outcomeForDecision(action: ReviewAction, documentType: "company" | "government" | null): VerificationOutcome | null {
  if (action === "company_verified") return "company_verified";
  if (action === "verified") return documentType === "company" ? "company_verified" : "government_verified";
  return null;
}

/** The stored status for a decision. "company_verified" is stored as verified, with the outcome recorded beside it. */
export function storedStatusFor(action: ReviewAction): "verified" | "rejected" | "need_clarification" {
  return action === "company_verified" ? "verified" : action;
}
