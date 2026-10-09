/**
 * Applies a captured payment for a category upgrade. Called from the participant's verify route and
 * from the Razorpay webhook. Both paths can run for the same payment, so this is idempotent: the
 * change moves only once, and the old seat is freed only once.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type ApplyCategoryChangeResult =
  | { kind: "applied"; registrationCode: string }
  | { kind: "already_applied" }
  | { kind: "not_pending" }
  | { kind: "amount_mismatch" }
  | { kind: "needs_review"; reason: string };

export async function applyPaidCategoryChange(
  db: SupabaseClient,
  input: { changeId: string; orderId: string; paymentId: string; amountPaise: number; actor: string },
): Promise<ApplyCategoryChangeResult> {
  const { data: change } = await db
    .from("it_run_category_changes")
    .select("id, registration_id, from_category_id, to_category_id, amount_paise, razorpay_order_id, status")
    .eq("id", input.changeId)
    .maybeSingle<{
      id: string; registration_id: string; from_category_id: string; to_category_id: string;
      amount_paise: number; razorpay_order_id: string | null; status: string;
    }>();
  if (!change || change.razorpay_order_id !== input.orderId) {
    return { kind: "needs_review", reason: "No category change matches this order" };
  }
  if (change.status === "paid") return { kind: "already_applied" };
  if (change.status !== "pending") return { kind: "not_pending" };
  if (input.amountPaise !== change.amount_paise) return { kind: "amount_mismatch" };

  const { data: reg } = await db
    .from("it_run_registrations")
    .select("registration_code, participant_count")
    .eq("id", change.registration_id)
    .maybeSingle<{ registration_code: string; participant_count: number }>();
  if (!reg) return { kind: "needs_review", reason: "Registration not found" };

  // Move only if the registration is still on the original category
  const { data: moved } = await db
    .from("it_run_registrations")
    .update({ category_id: change.to_category_id })
    .eq("id", change.registration_id)
    .eq("category_id", change.from_category_id)
    .select("id")
    .maybeSingle<{ id: string }>();
  if (!moved) {
    await db.from("it_run_audit_logs").insert({
      actor_email: input.actor, actor_role: "system", action: "category_change_needs_review",
      entity_type: "registration", entity_id: change.registration_id,
      detail: { change_id: change.id, payment_id: input.paymentId, reason: "registration moved elsewhere" },
    }).then(() => {}, () => {});
    return { kind: "needs_review", reason: "The registration changed category while the payment was pending" };
  }

  // Mark paid only once, then free the old seat exactly once
  const { data: marked } = await db
    .from("it_run_category_changes")
    .update({ status: "paid", razorpay_payment_id: input.paymentId, completed_at: new Date().toISOString() })
    .eq("id", change.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle<{ id: string }>();
  if (marked) {
    await db.rpc("itr_release_capacity", { p_category_id: change.from_category_id, p_count: reg.participant_count });
  }

  await db.from("it_run_audit_logs").insert({
    actor_email: input.actor, actor_role: "system", action: "category_changed",
    entity_type: "registration", entity_id: change.registration_id,
    detail: {
      registration_code: reg.registration_code,
      from_category_id: change.from_category_id,
      to_category_id: change.to_category_id,
      amount_paise: change.amount_paise,
      payment_id: input.paymentId,
      payment_change: "paid_difference",
    },
  }).then(() => {}, () => {});

  await sendCategoryChangeEmail(db, change.registration_id, change.to_category_id);
  return { kind: "applied", registrationCode: reg.registration_code };
}

/**
 * Confirmation email after a category change. Sent after the change is committed. A delivery failure is
 * logged and never reverses the change. The email states the unchanged registration ID.
 */
export async function sendCategoryChangeEmail(
  db: SupabaseClient,
  registrationId: string,
  toCategoryId: string,
): Promise<void> {
  try {
    const { sendEmail } = await import("@/lib/notify");
    const [{ data: reg }, { data: cat }] = await Promise.all([
      db.from("it_run_registrations")
        .select("registration_code, lead_email")
        .eq("id", registrationId)
        .maybeSingle<{ registration_code: string; lead_email: string }>(),
      db.from("it_run_categories")
        .select("name, price_rupees")
        .eq("id", toCategoryId)
        .maybeSingle<{ name: string; price_rupees: number }>(),
    ]);
    if (!reg?.lead_email || !cat) return;

    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#222">
      <h2 style="margin:0 0 12px">Your category has been updated</h2>
      <p style="margin:0 0 12px;line-height:1.6">Your registration for The IT Run Sprint-2 is now in the <strong>${escapeText(cat.name)}</strong> category (₹${cat.price_rupees}).</p>
      <p style="margin:0 0 12px;line-height:1.6">Registration ID: <strong>${escapeText(reg.registration_code)}</strong>. Your QR code is unchanged.</p>
      <p style="margin:0;color:#666;font-size:13px">Questions? Email info@connectedsteps.in</p>
    </div>`;
    await sendEmail(reg.lead_email, "Participant", "Your IT Run category has been updated", html, false, true);
  } catch (e) {
    console.error("[it-run/category] confirmation email failed:", (e as Error).name);
  }
}

function escapeText(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c] as string));
}
