/**
 * Job handler implementations.
 *
 * Rules for every handler:
 *   • MUST be idempotent — safe to call more than once with the same payload
 *   • MUST throw on transient failures so the worker retries the job
 *   • MUST return cleanly (not throw) when the work was already done
 */

import { createAndSendInvoice }                       from "@/lib/invoice-service";
import { signEventQR }                                from "@/lib/event-qr";
import { sendEmail, eventRegistrationEmailHTML,
         paymentEmailHTML }                           from "@/lib/notify";
import { processReferral }                            from "@/lib/referrals";
import { getSupabaseServer }                          from "@/lib/supabase-server";
import type { JobPayloads }                           from "@/lib/job-queue";

// ── invoice_generate ──────────────────────────────────────────────────────────
// createAndSendInvoice() is already idempotent: it returns the existing invoice
// when paymentId / registrationId already has one.

export async function handleInvoiceGenerate(p: JobPayloads["invoice_generate"]): Promise<void> {
  const invoice = await createAndSendInvoice({
    userEmail:       p.userEmail,
    userName:        p.userName,
    userPhone:       p.userPhone,
    productName:     p.productName,
    productType:     p.productType,
    totalPaidRupees: p.totalPaidRupees,
    paymentId:       p.paymentId,
    orderId:         p.orderId,
    registrationId:  p.registrationId,
    membershipId:    p.membershipId,
    eventId:         p.eventId,
    eventDate:       p.eventDate,
    eventVenue:      p.eventVenue,
  });
  // null means a transient failure (storage upload, SES error, etc.) — retry
  if (!invoice) throw new Error("createAndSendInvoice returned null — transient failure");
}

// ── event_qr_email ────────────────────────────────────────────────────────────
// Idempotency: confirmation_email_sent_at column. If already set → skip.
// QR token: reuse if already written to the row.

export async function handleEventQrEmail(p: JobPayloads["event_qr_email"]): Promise<void> {
  const db = getSupabaseServer();

  const { data: reg } = await db
    .from("event_registrations")
    .select("qr_token, confirmation_email_sent_at")
    .eq("id", p.registrationId)
    .maybeSingle();

  if (reg?.confirmation_email_sent_at) return;  // already delivered — nothing to do

  // Reuse existing QR token or sign a new one
  let qrToken = (reg?.qr_token as string | null) ?? null;
  if (!qrToken) {
    qrToken = signEventQR(p.registrationCode, p.eventId);
    await db
      .from("event_registrations")
      .update({ qr_token: qrToken })
      .eq("id", p.registrationId);
  }

  const html = eventRegistrationEmailHTML({
    name:             p.userName,
    eventTitle:       p.eventTitle,
    startDate:        p.startDate,
    startTime:        p.startTime,
    location:         p.location,
    registrationCode: p.registrationCode,
    distanceCategory: p.distanceCategory,
    qrToken,
  });

  const result = await sendEmail(
    p.userEmail, p.userName,
    `Event Registration Confirmed – ${p.eventTitle}`,
    html,
    false, true,  // isOtp=false, isTransactional=true — never suppressed
  );

  if (!result.ok) throw new Error(`SES delivery failed: ${result.error ?? "unknown"}`);

  // Mark as sent — prevents re-delivery on retry
  await db
    .from("event_registrations")
    .update({ confirmation_email_sent_at: new Date().toISOString(), email_status: "sent" })
    .eq("id", p.registrationId);
}

// ── membership_email ──────────────────────────────────────────────────────────
// The idempotency_key on the job row prevents this job from being created
// twice, so double-delivery only happens if SES acks but completeJob() fails —
// an extremely rare edge case that produces one harmless duplicate email.

export async function handleMembershipEmail(p: JobPayloads["membership_email"]): Promise<void> {
  const result = await sendEmail(
    p.userEmail, p.userName,
    "Membership Confirmed – Connected Steps",
    paymentEmailHTML(p.userName, p.planLabel, p.amountINR, p.expiresAt),
    false, true,  // isTransactional
  );
  if (!result.ok) throw new Error(`Membership email failed: ${result.error ?? "unknown"}`);
}

// ── referral_reward ───────────────────────────────────────────────────────────
// processReferral() is idempotent via the UNIQUE(referred_email) constraint on
// the referrals table — a duplicate insert returns code 23505 and is skipped.

export async function handleReferralReward(p: JobPayloads["referral_reward"]): Promise<void> {
  await processReferral(p.referralCode, p.referredEmail, p.referredFirstName);
}

// ── weekly_digest_email ───────────────────────────────────────────────────────
// Stub — the weekly-digest cron already handles batching and personalisation.
// This handler enables targeted re-delivery of one user's digest via the queue.
// Full implementation: pass pre-rendered HTML in the payload.

export async function handleWeeklyDigestEmail(p: JobPayloads["weekly_digest_email"]): Promise<void> {
  console.log(`[job-worker] weekly_digest_email stub — user=${p.userEmail}`);
}

// ── bulk_email ────────────────────────────────────────────────────────────────
// One email per job. Idempotency_key = bulk_email:{campaignId}:{to} ensures
// each recipient gets exactly one email per campaign even if backfill reruns.

export async function handleBulkEmail(p: JobPayloads["bulk_email"]): Promise<void> {
  const result = await sendEmail(p.to, p.toName, p.subject, p.html, false, false);
  if (!result.ok) throw new Error(`Bulk email to ${p.to} failed: ${result.error ?? "unknown"}`);
}

// ── bulk_invoice ──────────────────────────────────────────────────────────────
// One invoice per job. createAndSendInvoice() is idempotent by paymentId /
// registrationId — safe if the admin re-runs the backfill.

export async function handleBulkInvoice(p: JobPayloads["bulk_invoice"]): Promise<void> {
  const invoice = await createAndSendInvoice({
    userEmail:       p.userEmail,
    userName:        p.userName,
    productName:     p.productName,
    productType:     p.productType,
    totalPaidRupees: p.totalPaidRupees,
    paymentId:       p.paymentId,
    orderId:         p.orderId,
    registrationId:  p.registrationId,
    eventId:         p.eventId,
    eventDate:       p.eventDate,
    eventVenue:      p.eventVenue,
  });
  if (!invoice) throw new Error("Bulk invoice generation returned null — transient failure");
}

// ── certificate_generate ──────────────────────────────────────────────────────
// Not yet implemented. Handler is a clean no-op so the job completes without
// filling the dead-letter queue.

export async function handleCertificateGenerate(p: JobPayloads["certificate_generate"]): Promise<void> {
  console.log(`[job-worker] certificate_generate not yet implemented — user=${p.userEmail} event=${p.eventId}`);
}
