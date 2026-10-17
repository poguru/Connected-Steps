import { getSupabaseServer } from "@/lib/supabase-server";
import { paymentCoversRegistrations } from "@/lib/it-run-checkout";

/**
 * Confirms a captured Razorpay payment for every registration on its order. Used by the client verify route and by
 * the Razorpay webhook, so both behave the same way, including when they race or repeat.
 *
 *  - Each payment id is recorded once (it_run_payments). A repeat returns "already".
 *  - Only registrations still payable move to paid (pending, payment in progress, or failed). Paid and free ones
 *    never change.
 *  - When the webhook supplies the captured amount, it must equal what the registrations owe. A mismatch is
 *    refused and nothing is changed. The client verify route has the order's amount from our own record, and the
 *    Razorpay signature binds the payment to that order.
 */

export interface ConfirmedRegistration {
  id: string;
  registration_code: string;
  lead_email: string;
  qr_token: string | null;
}

export type ConfirmResult =
  | { kind: "confirmed"; registrations: ConfirmedRegistration[]; skipped: string[] }
  | { kind: "already" }
  | { kind: "not_found" }
  | { kind: "amount_mismatch" }
  /** Money was captured, but the payment window had closed and the seats were released. Nothing is confirmed. */
  | { kind: "lapsed"; registrationCodes: string[] }


type Db = ReturnType<typeof getSupabaseServer>;

export async function confirmCheckoutPayment(
  db: Db,
  args: { orderId: string; paymentId: string; capturedAmountPaise: number | null; actor: string },
): Promise<ConfirmResult> {
  const { data: regs, error } = await db
    .from("it_run_registrations")
    .select("id, registration_code, lead_email, final_price, payment_status, razorpay_payment_id, qr_token, event_id")
    .eq("razorpay_order_id", args.orderId)
    .returns<Array<ConfirmedRegistration & { final_price: number; payment_status: string; razorpay_payment_id: string | null; event_id: string }>>();
  if (error) throw new Error(`Failed to read registrations for order: ${error.message}`);
  if (!regs || regs.length === 0) return { kind: "not_found" };

  // Already recorded: this payment was confirmed before (by verify or by the webhook)
  const { data: recorded } = await db
    .from("it_run_payments")
    .select("id")
    .eq("razorpay_payment_id", args.paymentId)
    .maybeSingle<{ id: string }>();
  if (recorded) return { kind: "already" };

  if (args.capturedAmountPaise !== null && !paymentCoversRegistrations(args.capturedAmountPaise, regs)) {
    return { kind: "amount_mismatch" };
  }

  const payable = regs.filter(r => ["pending", "payment_attempted", "failed"].includes(r.payment_status));
  // An expired registration has released its seats. Money was captured for it, so it is never reported as success:
  // it is logged for review (refund or renewal by an admin), and nothing is confirmed here.
  const lapsed = regs.filter(r => r.payment_status === "expired");
  if (payable.length === 0 && lapsed.length > 0) {
    await db.from("it_run_audit_logs").insert({
      event_id: lapsed[0].event_id,
      actor_email: args.actor, actor_role: "system",
      action: "payment_for_lapsed_registration",
      entity_type: "registration", entity_id: lapsed[0].id,
      detail: { payment_id: args.paymentId, order_id: args.orderId, registration_codes: lapsed.map(r => r.registration_code) },
    }).then(() => {}, () => {});
    return { kind: "lapsed", registrationCodes: lapsed.map(r => r.registration_code) };
  }
  if (payable.length === 0) return { kind: "already" };

  // Move the payable registrations to paid. The status guard makes this a single transition per registration.
  const { data: updated, error: updErr } = await db
    .from("it_run_registrations")
    .update({ payment_status: "paid", razorpay_payment_id: args.paymentId })
    .in("id", payable.map(r => r.id))
    .in("payment_status", ["pending", "payment_attempted", "failed"])
    .select("id");
  if (updErr) throw new Error(`Failed to confirm registrations: ${updErr.message}`);

  const confirmedIds = new Set((updated ?? []).map(r => (r as { id: string }).id));
  if (confirmedIds.size === 0) return { kind: "already" };

  // Record the payment. A concurrent confirmation may have just recorded it; that is fine.
  const { error: payErr } = await db.from("it_run_payments").insert({
    razorpay_payment_id: args.paymentId,
    razorpay_order_id: args.orderId,
    amount_paise: regs.reduce((sum, r) => sum + r.final_price * 100, 0),
  });
  if (payErr && payErr.code !== "23505") {
    console.error(JSON.stringify({ src: "it-run-checkout", stage: "record_payment", outcome: "error", dbCode: payErr.code ?? "unknown", actor: args.actor }));
  }

  const confirmed = regs
    .filter(r => confirmedIds.has(r.id))
    .map(r => ({ id: r.id, registration_code: r.registration_code, lead_email: r.lead_email, qr_token: r.qr_token }));
  // Registrations that changed under us are reported, not silently dropped
  const skipped = payable.filter(r => !confirmedIds.has(r.id)).map(r => r.registration_code);
  return { kind: "confirmed", registrations: confirmed, skipped };
}
