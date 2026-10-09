/**
 * Company ID Verification Utilities
 *
 * Maps internal rejection codes to user-facing explanations.
 * Provides structured email templates for verification outcomes.
 * Enforces meaningful rejection reasons before notifying participants.
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
  physical_verification_required: "Your company ID could not be verified online. You can bring your original company ID for physical verification at the BIB collection counter.",
  clarification_needed: "We need additional information to verify your company ID. Our team will contact you with details.",
  custom: "A custom reason has been provided by our verification team. See the message below.",
};

/**
 * Get participant-friendly rejection reason text
 */
export function getRejectionReasonText(reason: VerificationReason, customExplanation?: string | null): string {
  if (reason === "custom" && customExplanation) {
    return customExplanation;
  }
  return REJECTION_REASON_DESCRIPTIONS[reason] || "Your company ID could not be verified. Please contact info@connectedsteps.in for assistance.";
}

/**
 * Build company ID verification rejection email
 */
export function buildCompanyVerificationRejectionEmail(
  participantName: string,
  reason: VerificationReason,
  customExplanation: string | null,
  eventDetails: {
    eventTitle: string;
    bibLocations: Array<{ name: string; address: string; date: string }>;
  },
): string {
  const reasonText = getRejectionReasonText(reason, customExplanation);

  const bibLocationsHtml = eventDetails.bibLocations
    .map(loc => `
      <div style="margin-bottom: 12px;">
        <strong style="color: #fff;">${loc.name}</strong><br/>
        ${loc.address}<br/>
        <span style="color: #888; font-size: 12px;">${loc.date}</span>
      </div>
    `)
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;"><tr><td align="center">
<table width="560" style="background:#0a0a0a;border-radius:12px;overflow:hidden;">
<tr><td style="height:4px;background:#e8620a;"></td></tr>
<tr><td style="padding:28px 32px;text-align:center;">
  <div style="font-size:18px;font-weight:700;color:#fff;">Company ID Verification - Action Required</div>
  <div style="font-size:11px;color:#e8620a;letter-spacing:0.1em;text-transform:uppercase;margin-top:4px;">${eventDetails.eventTitle}</div>
</td></tr>
<tr><td style="padding:0 32px 28px;">
  <p style="color:#ccc;font-size:14px;margin:0 0 16px;">Hi <strong style="color:#fff;">${participantName}</strong>,</p>

  <div style="background:#1a1a1a;border-radius:8px;border-left:3px solid #e8620a;padding:16px;margin-bottom:20px;">
    <div style="font-size:12px;color:#e8620a;font-weight:600;margin-bottom:8px;">⚠ Verification Status</div>
    <p style="color:#ccc;font-size:13px;margin:0;line-height:1.6;">${reasonText}</p>
  </div>

  <div style="margin-bottom:20px;">
    <div style="font-size:11px;color:#888;text-transform:uppercase;margin-bottom:12px;font-weight:600;">Next Steps</div>
    <p style="color:#ccc;font-size:13px;line-height:1.7;margin:0 0 12px;">
      You can bring your <strong>original company ID</strong> to the BIB collection counter for quick physical verification. This typically takes just a few minutes.
    </p>

    <div style="font-size:12px;color:#888;margin-top:12px;">
      <strong style="color:#ccc;">BIB Collection Centers:</strong>
    </div>
    <div style="background:#161616;border-radius:6px;padding:12px;margin-top:8px;">
      ${bibLocationsHtml}
    </div>
  </div>

  <div style="background:#0f3a0f;border-radius:8px;padding:14px;margin-bottom:20px;border-left:3px solid #10b981;">
    <div style="font-size:11px;color:#10b981;text-transform:uppercase;margin-bottom:8px;font-weight:600;">Refund Option</div>
    <p style="color:#ccc;font-size:12px;margin:0;line-height:1.6;">
      If you cannot attend, you can request a refund. Please visit your registration dashboard or contact <strong>info@connectedsteps.in</strong> with your registration code.
    </p>
  </div>

  <p style="color:#888;font-size:12px;margin:0;line-height:1.6;">
    Questions? Reach out to <a href="mailto:info@connectedsteps.in" style="color:#e8620a;text-decoration:none;">info@connectedsteps.in</a>
  </p>
</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #222;text-align:center;">
  <p style="margin:0;font-size:11px;color:#555;">Connected Steps &mdash; info@connectedsteps.in</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
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
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;"><tr><td align="center">
<table width="560" style="background:#0a0a0a;border-radius:12px;overflow:hidden;">
<tr><td style="height:4px;background:#10b981;"></td></tr>
<tr><td style="padding:28px 32px;text-align:center;">
  <div style="font-size:18px;font-weight:700;color:#fff;">✓ Company ID Verified</div>
  <div style="font-size:11px;color:#10b981;letter-spacing:0.1em;text-transform:uppercase;margin-top:4px;">${eventDetails.eventTitle}</div>
</td></tr>
<tr><td style="padding:0 32px 28px;">
  <p style="color:#ccc;font-size:14px;margin:0 0 16px;">Hi <strong style="color:#fff;">${participantName}</strong>,</p>

  <div style="background:#1a1a1a;border-radius:8px;border-left:3px solid #10b981;padding:16px;margin-bottom:20px;">
    <p style="color:#10b981;font-size:13px;margin:0;font-weight:600;">Your company ID has been verified. You're all set for the event!</p>
  </div>

  <div style="margin-bottom:20px;">
    <div style="font-size:11px;color:#888;text-transform:uppercase;margin-bottom:8px;font-weight:600;">Event Details</div>
    <div style="background:#161616;border-radius:6px;padding:12px;">
      <div style="color:#ccc;font-size:13px;margin-bottom:8px;">
        <strong style="color:#fff;">${eventDetails.eventTitle}</strong>
      </div>
      <div style="color:#888;font-size:12px;">
        ${eventDetails.eventDate}
      </div>
    </div>
  </div>

  <p style="color:#888;font-size:12px;margin:0;line-height:1.6;">
    Check your email for your registration confirmation with QR code and BIB collection details. See you at the event!
  </p>
</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #222;text-align:center;">
  <p style="margin:0;font-size:11px;color:#555;">Connected Steps &mdash; info@connectedsteps.in</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/**
 * Build company ID clarification needed email
 */
export function buildCompanyVerificationClarificationEmail(
  participantName: string,
  clarificationDetails: string,
  eventDetails: {
    eventTitle: string;
  },
): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;"><tr><td align="center">
<table width="560" style="background:#0a0a0a;border-radius:12px;overflow:hidden;">
<tr><td style="height:4px;background:#f59e0b;"></td></tr>
<tr><td style="padding:28px 32px;text-align:center;">
  <div style="font-size:18px;font-weight:700;color:#fff;">Company ID - Clarification Needed</div>
  <div style="font-size:11px;color:#f59e0b;letter-spacing:0.1em;text-transform:uppercase;margin-top:4px;">${eventDetails.eventTitle}</div>
</td></tr>
<tr><td style="padding:0 32px 28px;">
  <p style="color:#ccc;font-size:14px;margin:0 0 16px;">Hi <strong style="color:#fff;">${participantName}</strong>,</p>

  <div style="background:#1a1a1a;border-radius:8px;border-left:3px solid #f59e0b;padding:16px;margin-bottom:20px;">
    <div style="font-size:12px;color:#f59e0b;font-weight:600;margin-bottom:8px;">⏳ Additional Information Needed</div>
    <p style="color:#ccc;font-size:13px;margin:0;line-height:1.6;">${clarificationDetails}</p>
  </div>

  <p style="color:#888;font-size:12px;margin:0;line-height:1.6;">
    Please reply to this email or contact <a href="mailto:info@connectedsteps.in" style="color:#e8620a;text-decoration:none;">info@connectedsteps.in</a> with the required information.
  </p>
</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #222;text-align:center;">
  <p style="margin:0;font-size:11px;color:#555;">Connected Steps &mdash; info@connectedsteps.in</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
