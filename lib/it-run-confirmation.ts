/**
 * Two-stage confirmation for The IT Run Sprint-2.
 *
 * 1. Payment. The registration is held as `pending_verification` (it keeps its seats).
 * 2. ID verification. An admin verifies the ID of every adult. Children are verified on creation.
 *
 * The registration becomes `active` (confirmed) only when it is paid or free AND every participant is verified.
 * The confirmation email is sent at that moment, never at payment. The BIB email (numbers, QR codes and the slot link)
 * waits until an admin allocates BIBs after registration closes.
 */

import { getSupabaseServer } from "@/lib/supabase-server";
import { sendItRunConfirmationEmail, sendItRunBibInviteEmail, sendItRunPaymentReceivedEmail } from "@/lib/it-run-email";
import { runAfterResponse } from "@/lib/after-response";
import { sendItRunWhatsApp } from "@/lib/it-run-whatsapp";
import { FEATURED_EVENT } from "@/lib/it-run-featured";

export const PENDING_VERIFICATION = "pending_verification";
export const CONFIRMED = "active";

type Db = ReturnType<typeof getSupabaseServer>;

export type ConfirmOutcome = "confirmed" | "waiting" | "already" | "not_found";

/** True when every participant's ID is verified. Children are recorded as verified when they are registered. */
export function allVerified(participants: ReadonlyArray<{ verification_status: string }>): boolean {
  return participants.length > 0 && participants.every(p => p.verification_status === "verified");
}

/** Whether the payment is in place for a registration. */
export function paymentInPlace(paymentStatus: string): boolean {
  return paymentStatus === "paid" || paymentStatus === "free" || paymentStatus === "partially_refunded";
}

/**
 * Confirms a registration if it is ready. The change is guarded on the pending status, so two checks at the same
 * time confirm it once, and the second one reports `already`.
 */
export async function confirmIfVerified(db: Db, registrationId: string): Promise<ConfirmOutcome> {
  const { data: reg } = await db
    .from("it_run_registrations")
    .select("id, payment_status, registration_status")
    .eq("id", registrationId)
    .maybeSingle<{ id: string; payment_status: string; registration_status: string }>();
  if (!reg) return "not_found";
  if (reg.registration_status === CONFIRMED) return "already";
  if (reg.registration_status !== PENDING_VERIFICATION) return "waiting";
  if (!paymentInPlace(reg.payment_status)) return "waiting";

  const { data: parts } = await db
    .from("it_run_participants")
    .select("verification_status")
    .eq("registration_id", registrationId)
    // A runner whose category was cancelled after a rejected ID is not part of the confirmation
    .is("cancelled_at", null)
    .returns<Array<{ verification_status: string }>>();
  if (!allVerified(parts ?? [])) return "waiting";

  const { data: claimed } = await db
    .from("it_run_registrations")
    .update({ registration_status: CONFIRMED })
    .eq("id", registrationId)
    .eq("registration_status", PENDING_VERIFICATION)
    .select("id");
  if (!claimed?.length) return "already";
  return "confirmed";
}

/**
 * The confirmation email for a registration that has just been confirmed. The BIB email is sent here only when the
 * BIB numbers already exist (BIBs allocated after closing, then this registration was confirmed). Otherwise the
 * admin's "Allocate BIBs and send" sends it. No slot-link email goes out at confirmation.
 */
export async function sendConfirmedNotices(registrationId: string): Promise<void> {
  const db = getSupabaseServer();
  const { data: reg } = await db
    .from("it_run_registrations")
    .select("registration_code, lead_email")
    .eq("id", registrationId)
    .maybeSingle<{ registration_code: string; lead_email: string }>();
  if (!reg) return;
  await sendItRunConfirmationEmail(registrationId, reg.registration_code, reg.lead_email, "");
  await sendItRunBibInviteEmail(registrationId, reg.lead_email);

  // WhatsApp, only when the MSG91 provider is on. The message points to email for the QR code and details.
  const { data: lead } = await db
    .from("it_run_participants")
    .select("first_name, mobile")
    .eq("registration_id", registrationId)
    .order("created_at")
    .limit(1)
    .maybeSingle<{ first_name: string; mobile: string | null }>();
  if (lead?.mobile) {
    await sendItRunWhatsApp("registration_confirmed", lead.mobile, {
      name: lead.first_name,
      code: reg.registration_code,
      event: `${FEATURED_EVENT.name} ${FEATURED_EVENT.edition}`,
    });
  }
}

/**
 * After a payment: each registration is confirmed if its IDs are already verified, otherwise it gets the
 * payment-received email and waits for verification.
 */
export function noticesAfterPayment(db: Db, registrationIds: string[]): void {
  for (const id of registrationIds) {
    runAfterResponse("payment_notice", async () => {
      const outcome = await confirmIfVerified(db, id);
      if (outcome === "confirmed") await sendConfirmedNotices(id);
      else if (outcome === "waiting") await sendItRunPaymentReceivedEmail(id);
    });
  }
}
