/**
 * The email to a runner whose ID was rejected: their category is cancelled, the refund is stated, and the deduction for an
 * ID verification failure is written out. No correction link is offered for a rejected ID.
 */

import { emailWrapper, emailHeader, emailFooter } from "@/lib/email/layout";
import { escapeHtml } from "@/lib/it-run-verification";

export function buildCategoryCancelledEmail(args: {
  firstName: string;
  eventTitle: string;
  categoryName: string;
  refundPaise: number;
  refundPercent: number;
  otherRunnersKept: boolean;
  /** A free registration: no payment was taken, so there is no refund to state. */
  free?: boolean;
}): string {
  const refund = (args.refundPaise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const deductionPercent = 100 - args.refundPercent;
  const paymentLine = args.free
    ? `<p style="margin:0 0 14px;">This registration was free, so no payment was taken and no refund applies.</p>`
    : `<p style="margin:0 0 14px;">
      A refund of <strong>Rs. ${escapeHtml(refund)}</strong> will be processed to your original payment method. This is
      ${args.refundPercent}% of the category price. A ${deductionPercent}% deduction applies because the ID verification failed.
    </p>`;
  const body = `
    <p style="margin:0 0 14px;">Hi ${escapeHtml(args.firstName)},</p>
    <p style="margin:0 0 14px;">
      We could not verify the company or government ID you submitted for <strong>${escapeHtml(args.eventTitle)}</strong>.
      Your registration for <strong>${escapeHtml(args.categoryName)}</strong> has therefore been cancelled.
    </p>
    ${paymentLine}
    ${args.otherRunnersKept
      ? `<p style="margin:0 0 14px;">Any other runners in your registration are not affected and keep their registration.</p>`
      : ""}
    <p style="margin:0;">If you have questions, reply to this email or write to info@connectedsteps.in.</p>`;
  return emailWrapper(
    emailHeader() +
    `<tr><td style="padding:32px 40px;font-size:15px;color:#222;line-height:1.6;">${body}</td></tr>` +
    emailFooter(),
  );
}

/**
 * The email to a runner who could not be verified at the BIB desk and chose to go without a BIB. The refund share is
 * stated as it was applied: 90% before registration closed, 50% after. A free registration has no refund to state.
 */
export function buildNoBibCancellationEmail(args: {
  firstName: string;
  eventTitle: string;
  categoryName: string;
  refundPaise: number;
  refundPercent: number;
  free: boolean;
}): string {
  const refund = (args.refundPaise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const deductionPercent = 100 - args.refundPercent;
  const paymentLine = args.free
    ? `<p style="margin:0 0 14px;">This registration was free, so no payment was taken and no refund applies.</p>`
    : `<p style="margin:0 0 14px;">
      A refund of <strong>Rs. ${escapeHtml(refund)}</strong> will be processed to your original payment method. This is
      ${args.refundPercent}% of the category price. A ${deductionPercent}% deduction applies because we could not complete
      the ID verification at the BIB collection desk.
    </p>`;
  const body = `
    <p style="margin:0 0 14px;">Hi ${escapeHtml(args.firstName)},</p>
    <p style="margin:0 0 14px;">
      We could not complete the company ID verification for <strong>${escapeHtml(args.eventTitle)}</strong> at the BIB
      collection desk, and you chose not to continue without a BIB. Your registration for
      <strong>${escapeHtml(args.categoryName)}</strong> has therefore been cancelled.
    </p>
    ${paymentLine}
    <p style="margin:0;">If you have questions, reply to this email or write to info@connectedsteps.in.</p>`;
  return emailWrapper(
    emailHeader() +
    `<tr><td style="padding:32px 40px;font-size:15px;color:#222;line-height:1.6;">${body}</td></tr>` +
    emailFooter(),
  );
}
