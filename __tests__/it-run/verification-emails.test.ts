/**
 * Company ID verification: decision validation and participant-facing email content.
 */

import {
  validateReviewDecision,
  buildCompanyVerificationRejectionEmail,
  buildCompanyVerificationClarificationEmail,
  buildCompanyVerificationApprovedEmail,
  VERIFICATION_REASON_CODES,
  REJECTION_REASON_LABELS,
} from "@/lib/it-run-verification";

const DASHBOARD = "https://www.connectedsteps.in/it-run/my-registrations";
const BIB_LOCATIONS = [
  { name: "Main BIB Counter", address: "HITEC City, Hyderabad", date: "Aug 15, 10 AM - 6 PM" },
  { name: "Secondary Counter", address: "Tech Park, Hyderabad", date: "Aug 16, 10 AM - 4 PM" },
];

function rejection(reason: Parameters<typeof buildCompanyVerificationRejectionEmail>[1], custom: string | null = null) {
  return buildCompanyVerificationRejectionEmail("Asha", reason, custom, {
    eventTitle: "The IT Run Sprint-2",
    bibLocations: BIB_LOCATIONS,
    dashboardUrl: DASHBOARD,
  });
}

describe("validateReviewDecision", () => {
  it("does not require a reason for verification", () => {
    expect(validateReviewDecision({ status: "verified" })).toEqual({ ok: true, reason: null, explanation: null });
  });

  it("requires a reason for rejection and clarification", () => {
    expect(validateReviewDecision({ status: "rejected" }).ok).toBe(false);
    expect(validateReviewDecision({ status: "need_clarification", reason: "" }).ok).toBe(false);
  });

  it("rejects unknown reason codes such as the old INVALID ID", () => {
    expect(validateReviewDecision({ status: "rejected", reason: "INVALID ID" }).ok).toBe(false);
  });

  it("accepts every defined reason code", () => {
    for (const code of VERIFICATION_REASON_CODES) {
      const result = validateReviewDecision({ status: "rejected", reason: code, adminExplanation: code === "custom" ? "Details" : "" });
      expect(result.ok).toBe(true);
    }
  });

  it("requires an explanation for the custom reason", () => {
    expect(validateReviewDecision({ status: "rejected", reason: "custom", adminExplanation: "   " }).ok).toBe(false);
    const ok = validateReviewDecision({ status: "rejected", reason: "custom", adminExplanation: " Photo cropped " });
    expect(ok).toEqual({ ok: true, reason: "custom", explanation: "Photo cropped" });
  });

  it("caps the explanation at 1000 characters", () => {
    const tooLong = "x".repeat(1001);
    expect(validateReviewDecision({ status: "rejected", reason: "unreadable_id", adminExplanation: tooLong }).ok).toBe(false);
  });
});

describe("rejection email", () => {
  it.each(VERIFICATION_REASON_CODES)("never shows the internal code %s to the participant", code => {
    const html = rejection(code, code === "custom" ? "Custom note" : null);
    expect(html).not.toContain("INVALID ID");
    expect(html).not.toContain(code);
  });

  it("uses the participant-facing label text, not the internal code", () => {
    const html = rejection("unreadable_id");
    expect(html).toContain("The company ID image is not clear enough to verify");
  });

  it("shows physical verification and BIB counters only for physical_verification_required", () => {
    const physical = rejection("physical_verification_required");
    expect(physical).toContain("original company ID");
    expect(physical).toContain("HITEC City, Hyderabad");
    expect(physical).toContain("BIB Collection Counters");

    const unreadable = rejection("unreadable_id");
    expect(unreadable).not.toContain("original company ID");
    expect(unreadable).not.toContain("HITEC City, Hyderabad");
    expect(unreadable).toContain(DASHBOARD);
  });

  it("includes the event name, support contact, and refund-request explanation", () => {
    const html = rejection("details_mismatch");
    expect(html).toContain("The IT Run Sprint-2");
    expect(html).toContain("info@connectedsteps.in");
    expect(html).toContain("Refunds are never issued automatically");
  });

  it("escapes admin-provided text so it cannot inject markup", () => {
    const html = rejection("custom", "<script>alert(1)</script>");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("has a non-empty label for every reason", () => {
    for (const code of VERIFICATION_REASON_CODES) {
      expect(REJECTION_REASON_LABELS[code].length).toBeGreaterThan(0);
    }
  });
});

describe("clarification and approval emails", () => {
  it("clarification email shows the admin text and a dashboard link", () => {
    const html = buildCompanyVerificationClarificationEmail("Ravi", "Please send the back side of the ID.", {
      eventTitle: "The IT Run Sprint-2",
      dashboardUrl: DASHBOARD,
    });
    expect(html).toContain("Please send the back side of the ID.");
    expect(html).toContain(DASHBOARD);
    expect(html).not.toContain("INVALID ID");
  });

  it("escapes the participant name in the approval email", () => {
    const html = buildCompanyVerificationApprovedEmail("<img src=x>", {
      eventTitle: "The IT Run Sprint-2",
      eventDate: "August 15-16, 2026",
    });
    expect(html).not.toContain("<img src=x>");
    expect(html).toContain("&lt;img src=x&gt;");
  });
});
