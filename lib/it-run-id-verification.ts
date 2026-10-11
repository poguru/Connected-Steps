/**
 * Company ID choice and identity-verification status for The IT Run Sprint-2.
 *
 * Every adult uploads a company ID or a government-issued photo ID to register. The ID is verified by an admin, and
 * the registration is confirmed only after that verification (payment comes first).
 *
 * Identity verification is a separate state from payment. Values:
 *   not_provided       no document on file (legacy registrations made before the upload was required)
 *   pending            document uploaded, waiting for admin review
 *   verified           admin approved the document
 *   rejected           admin rejected the document; the participant can resubmit
 *   need_clarification admin asked for more information
 * Children in a kid category are exempt from document checks and are recorded as verified.
 */

export type IdVerificationStatus = "not_provided" | "pending" | "verified" | "rejected" | "need_clarification";

// Upload route: `${Date.now()}-${random}.${ext}`. Correction route: `resubmit-${Date.now()}-${uuid}.${ext}`.
const UPLOAD_PATH_RE = /^\d{10,}-[a-z0-9]+\.(jpg|jpeg|png|webp|pdf)$/;
const RESUBMIT_PATH_RE = /^resubmit-\d{10,}-[0-9a-f-]{36}\.(jpg|jpeg|png|webp|pdf)$/i;

/**
 * True only for a storage path that our upload routes produce. Anything else (a URL, a path with
 * directories, a sentinel string) is not a document reference and is never stored as one.
 */
export function isStoredDocumentPath(value: unknown): value is string {
  return typeof value === "string" && value.length <= 200 && (UPLOAD_PATH_RE.test(value) || RESUBMIT_PATH_RE.test(value));
}

/** The verification status a new registration starts with. Decided on the server from the stored document. */
export function initialVerificationStatus(isChild: boolean, companyIdUrl: unknown): IdVerificationStatus {
  if (isChild) return "verified";
  return isStoredDocumentPath(companyIdUrl) ? "pending" : "not_provided";
}

/**
 * Every adult must upload a company ID or a government-issued photo ID before the registration can be made.
 * Children are exempt. The admin verifies the document before the registration is confirmed.
 * Returns an error message, or null when the step can continue.
 */
export function idUploadError(companyIdUrl: unknown, isChild: boolean): string | null {
  if (isChild) return null;
  if (!isStoredDocumentPath(companyIdUrl)) return "Upload a company ID or a government-issued photo ID to continue.";
  return null;
}

/** The kind of ID a participant uploaded. Null when no document was uploaded. Government ID is recorded separately. */
export type IdDocumentType = "company" | "government";

export function idDocumentTypeFor(companyIdUrl: unknown, requested: unknown): IdDocumentType | null {
  if (!isStoredDocumentPath(companyIdUrl)) return null;
  return requested === "government" ? "government" : "company";
}
