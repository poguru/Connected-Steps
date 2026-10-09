/**
 * Company ID Verification Utilities
 *
 * Maps internal rejection codes to user-facing explanations.
 * Provides structured email templates for verification outcomes.
 * Enforces meaningful rejection reasons before notifying participants.
 *
 * Internal status/reason codes (e.g. "unreadable_id") are stored in the database
 * and in the audit log. They are never rendered to participants: every participant-
 * facing string comes from the label/description tables below.
 */

export type VerificationReason =
  | "unreadable_id"
  | "missing_employee_id"
  | "details_mismatch"
  | "invalid_document"
  | "physical_verification_required"
  | "clarification_needed"
  | "custom";

export const REJECTION_REASON_LABELS: Record<VerificationReason, string> = {
  unreadable_id: "Company ID is unreadable or blurry",
  missing_employee_id: "Employee ID is missing",
  details_mismatch: "Company details do not match our records",
  invalid_document: "Submitted document is not a valid company ID",
  physical_verification_required: "Physical verification at BIB collection required",
  clarification_needed: "Additional information needed",
  custom: "Custom reason provided by administrator",
};

export const REJECTION_REASON_DESCRIPTIONS: Record<VerificationReason, string> = {
  unreadable_id: "The company ID image is not clear enough to verify. Please provide a clear photo with all text legible.",
  missing_employee_id: "Your employee ID number is missing from the submitted document. Please resubmit with the ID clearly visible.",
  details_mismatch: "The company name or employee details in your submission do not match our records. Please verify and resubmit.",
  invalid_document: "The submitted document does not appear to be a valid company ID. Please check and resubmit an official company identification document.",
  physical_verification_required: "Your company ID could not be verified online. Please bring your original company ID for physical verification at the BIB collection counter.",
  clarification_needed: "We need additional information to verify your company ID. Our team will contact you with details.",
  custom: "Our verification team has reviewed your submission. See the details below.",
};

export const VERIFICATION_REASON_CODES = Object.keys(REJECTION_REASON_LABELS) as VerificationReason[];

export const SUPPORT_EMAIL = "info@connectedsteps.in";
export const MAX_ADMIN_EXPLANATION_LENGTH = 1000;

export function isVerificationReason(value: unknown): value is VerificationReason {
  return typeof value === "string" && (VERIFICATION_REASON_CODES as string[]).includes(value);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type ReviewDecisionInput = {
  status: string;
  reason?: unknown;
  adminExplanation?: unknown;
};

export type ReviewDecision =
  | { ok: true; reason: VerificationReason | null; explanation: string | null }
  | { ok: false; error: string };

/**
 * Validates an admin verification decision before anything is written.
 * - verified: no reason required.
 * - rejected / need_clarification: a valid reason code is mandatory.
 * - custom: an explanation is mandatory (otherwise the participant gets an empty message).
 * - explanation (any reason): trimmed, max 1000 characters.
 */
export function validateReviewDecision(input: ReviewDecisionInput): ReviewDecision {
  const { status } = input;
  if (!["verified", "rejected", "need_clarification"].includes(status)) {
    return { ok: false, error: "Invalid status" };
  }

  const explanation = typeof input.adminExplanation === "string"
    ? input.adminExplanation.trim()
    : "";

  if (explanation.length > MAX_ADMIN_EXPLANATION_LENGTH) {
    return { ok: false, error: `Admin explanation cannot exceed ${MAX_ADMIN_EXPLANATION_LENGTH} characters` };
  }

  if (status === "verified") {
    return { ok: true, reason: null, explanation: explanation || null };
  }

  if (!isVerificationReason(input.reason)) {
    return {
      ok: false,
      error: `A valid reason is required when status is ${status}. Valid reasons: ${VERIFICATION_REASON_CODES.join(", ")}`,
    };
  }

  if (input.reason === "custom" && !explanation) {
    return { ok: false, error: "An explanation is required when the reason is custom" };
  }

  return { ok: true, reason: input.reason, explanation: explanation || null };
}

/**
 * Get participant-friendly rejection reason text
 */
export function getRejectionReasonText(reason: VerificationReason, customExplanation?: string | null): string {
  if (reason === "custom" && customExplanation) {
    return customExplanation;
  }
  return REJECTION_REASON_DESCRIPTIONS[reason] || `Your company ID could not be verified. Please contact ${SUPPORT_EMAIL} for assistance.`;
}

const REFUND_NOTICE_HTML = `
  <div style="background:#0f3a0f;border-radius:8px;padding:14px;margin-bottom:20px;border-left:3px solid #10b981;">
    <div style="font-size:11px;color:#10b981;text-transform:uppercase;margin-bottom:8px;font-weight:600;">Refund Requests</div>
    <p style="color:#ccc;font-size:12px;margin:0;line-height:1.6;">
      Refunds are never issued automatically. If you cannot attend, submit a refund request from your registration dashboard with your registration code and a reason. Our team reviews every request and emails you the decision. Your registration stays active until a refund is approved and completed.
    </p>
  </div>`;

function footerHtml(): string {
  return `<tr><td style="padding:16px 32px;border-top:1px solid #222;text-align:center;">
  <p style="margin:0;font-size:11px;color:#555;">Connected Steps &mdash; ${SUPPORT_EMAIL}</p>
</td></tr>`;
}

function wrapperOpen(accentColor: string, title: string, eventTitle: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;"><tr><td align="center">
<table width="560" style="background:#0a0a0a;border-radius:12px;overflow:hidden;max-width:100%;">
<tr><td style="height:4px;background:${accentColor};"></td></tr>
<tr><td style="padding:28px 32px;text-align:center;">
  <div style="font-size:18px;font-weight:700;color:#fff;">${title}</div>
  <div style="font-size:11px;color:${accentColor};letter-spacing:0.1em;text-transform:uppercase;margin-top:4px;">${escapeHtml(eventTitle)}</div>
</td></tr>
<tr><td style="padding:0 32px 28px;">`;
}

const WRAPPER_CLOSE = `</td></tr>
${footerHtml()}
</table>
</td></tr></table>
</body></html>`;

/**
 * Build company ID verification rejection email.
 * The "next steps" block depends on the reason: physical verification instructions
 * (and BIB locations) are only shown when the reason is physical_verification_required.
 */
export function buildCompanyVerificationRejectionEmail(
  participantName: string,
  reason: VerificationReason,
  customExplanation: string | null,
  eventDetails: {
    eventTitle: string;
    bibLocations: Array<{ name: string; address: string; date: string }>;
    dashboardUrl: string;
  },
): string {
  const reasonText = escapeHtml(getRejectionReasonText(reason, customExplanation));

  let nextStepsHtml: string;
  if (reason === "physical_verification_required") {
    const bibLocationsHtml = eventDetails.bibLocations
      .map(loc => `
      <div style="margin-bottom:12px;">
        <strong style="color:#fff;">${escapeHtml(loc.name)}</strong><br/>
        ${escapeHtml(loc.address)}<br/>
        <span style="color:#888;font-size:12px;">${escapeHtml(loc.date)}</span>
      </div>`)
      .join("");

    nextStepsHtml = `
  <div style="margin-bottom:20px;">
    <div style="font-size:11px;color:#888;text-transform:uppercase;margin-bottom:12px;font-weight:600;">Next Steps</div>
    <p style="color:#ccc;font-size:13px;line-height:1.7;margin:0 0 12px;">
      Bring your <strong>original company ID</strong> to one of the BIB collection counters below. Verification takes only a few minutes. Carry this email or your registration code.
    </p>
    <div style="font-size:12px;color:#888;margin-top:12px;"><strong style="color:#ccc;">BIB Collection Counters:</strong></div>
    <div style="background:#161616;border-radius:6px;padding:12px;margin-top:8px;">${bibLocationsHtml}
    </div>
  </div>`;
  } else {
    nextStepsHtml = `
  <div style="margin-bottom:20px;">
    <div style="font-size:11px;color:#888;text-transform:uppercase;margin-bottom:12px;font-weight:600;">Next Steps</div>
    <p style="color:#ccc;font-size:13px;line-height:1.7;margin:0 0 16px;">
      Please sign in to your registration dashboard and upload a corrected company ID. Make sure the full document and your employee ID are clearly readable.
    </p>
    <a href="${escapeHtml(eventDetails.dashboardUrl)}" style="display:inline-block;background:#e8620a;color:#fff;text-decoration:none;font-weight:700;font-size:13px;padding:12px 20px;border-radius:8px;">Open my registration</a>
  </div>`;
  }

  return `${wrapperOpen("#e8620a", "Company ID Verification - Action Required", eventDetails.eventTitle)}
  <p style="color:#ccc;font-size:14px;margin:0 0 16px;">Hi <strong style="color:#fff;">${escapeHtml(participantName)}</strong>,</p>

  <div style="background:#1a1a1a;border-radius:8px;border-left:3px solid #e8620a;padding:16px;margin-bottom:20px;">
    <div style="font-size:12px;color:#e8620a;font-weight:600;margin-bottom:8px;">Verification Result: Not verified</div>
    <p style="color:#ccc;font-size:13px;margin:0;line-height:1.6;">${reasonText}</p>
  </div>

  ${nextStepsHtml}
  ${REFUND_NOTICE_HTML}

  <p style="color:#888;font-size:12px;margin:0;line-height:1.6;">
    Questions? Reach out to <a href="mailto:${SUPPORT_EMAIL}" style="color:#e8620a;text-decoration:none;">${SUPPORT_EMAIL}</a>
  </p>
${WRAPPER_CLOSE}`;
}

/**
 * Build company ID verification approved email
 */
export function buildCompanyVerificationApprovedEmail(
  participantName: string,
  eventDetails: {
    eventTitle: string;
    eventDate: string;
  },
): string {
  return `${wrapperOpen("#10b981", "Company ID Verified", eventDetails.eventTitle)}
  <p style="color:#ccc;font-size:14px;margin:0 0 16px;">Hi <strong style="color:#fff;">${escapeHtml(participantName)}</strong>,</p>

  <div style="background:#1a1a1a;border-radius:8px;border-left:3px solid #10b981;padding:16px;margin-bottom:20px;">
    <p style="color:#10b981;font-size:13px;margin:0;font-weight:600;">Your company ID has been verified. You're all set for the event!</p>
  </div>

  <div style="margin-bottom:20px;">
    <div style="font-size:11px;color:#888;text-transform:uppercase;margin-bottom:8px;font-weight:600;">Event Details</div>
    <div style="background:#161616;border-radius:6px;padding:12px;">
      <div style="color:#ccc;font-size:13px;margin-bottom:8px;">
        <strong style="color:#fff;">${escapeHtml(eventDetails.eventTitle)}</strong>
      </div>
      <div style="color:#888;font-size:12px;">${escapeHtml(eventDetails.eventDate)}</div>
    </div>
  </div>

  <p style="color:#888;font-size:12px;margin:0;line-height:1.6;">
    Check your email for your registration confirmation with QR code and BIB collection details. See you at the event!
  </p>
${WRAPPER_CLOSE}`;
}

/**
 * Build company ID clarification needed email
 */
export function buildCompanyVerificationClarificationEmail(
  participantName: string,
  clarificationDetails: string,
  eventDetails: {
    eventTitle: string;
    dashboardUrl: string;
  },
): string {
  return `${wrapperOpen("#f59e0b", "Company ID - Clarification Needed", eventDetails.eventTitle)}
  <p style="color:#ccc;font-size:14px;margin:0 0 16px;">Hi <strong style="color:#fff;">${escapeHtml(participantName)}</strong>,</p>

  <div style="background:#1a1a1a;border-radius:8px;border-left:3px solid #f59e0b;padding:16px;margin-bottom:20px;">
    <div style="font-size:12px;color:#f59e0b;font-weight:600;margin-bottom:8px;">Additional Information Needed</div>
    <p style="color:#ccc;font-size:13px;margin:0;line-height:1.6;">${escapeHtml(clarificationDetails)}</p>
  </div>

  <p style="color:#ccc;font-size:13px;line-height:1.6;margin:0 0 16px;">
    Reply to this email or open your registration dashboard to respond.
  </p>
  <a href="${escapeHtml(eventDetails.dashboardUrl)}" style="display:inline-block;background:#f59e0b;color:#0a0a0a;text-decoration:none;font-weight:700;font-size:13px;padding:12px 20px;border-radius:8px;margin-bottom:20px;">Open my registration</a>

  <p style="color:#888;font-size:12px;margin:0;line-height:1.6;">
    Questions? Contact <a href="mailto:${SUPPORT_EMAIL}" style="color:#e8620a;text-decoration:none;">${SUPPORT_EMAIL}</a>
  </p>
${WRAPPER_CLOSE}`;
}
