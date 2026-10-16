/**
 * Cancelling one category of a booking when a runner's ID is rejected. Only that category's runners are cancelled, their
 * seats are released, and a refund request for the category is recorded. The refund itself is executed by an admin from
 * the refund page (the same executor as every other refund). The rest of the booking is not changed.
 *
 * A free registration has nothing to refund: its category is cancelled and no refund request is made.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { bookingPrice, type CategoryType } from "@/lib/it-run-category-rules";

/** The share of a category's price that is refunded when its ID is rejected. The rest is kept as the charge. */
export const CATEGORY_REFUND_PERCENT = 90;

/**
 * The refund for one category, in paise. The category's share of the booking is its price, less the same share of
 * any discount (the discount is spread across the booking in proportion to the price). Rounded down to the paisa.
 */
export function categoryRefundPaise(args: { lineBaseRupees: number; bookingBaseRupees: number; bookingDiscountRupees: number }): number {
  const { lineBaseRupees, bookingBaseRupees, bookingDiscountRupees } = args;
  if (lineBaseRupees <= 0 || bookingBaseRupees <= 0) return 0;
  const share = lineBaseRupees / bookingBaseRupees;
  const discountShare = bookingDiscountRupees * share;
  const paidRupees = lineBaseRupees - discountShare;
  const paidPaise = Math.round(paidRupees * 100);
  return Math.floor((paidPaise * CATEGORY_REFUND_PERCENT) / 100);
}

export type CancelOutcome =
  | { status: "cancelled"; refundRequestId: string | null; refundPaise: number; runners: number; categoryName: string; free: boolean }
  | { status: "already_cancelled" }
  | { status: "not_paid" }
  | { status: "refund_already_open" }
  | { status: "error"; message: string };

interface ParticipantRow {
  id: string;
  registration_id: string;
  category_id: string | null;
  cancelled_at: string | null;
}

/**
 * Cancels the category of one runner in their booking, and records its refund request when one is owed. Order matters:
 * the refund request is created first, so if another refund is already open for the booking nothing is cancelled.
 */
export async function cancelRunnerCategory(
  db: SupabaseClient,
  args: { participantId: string; reason: string; actorEmail: string },
): Promise<CancelOutcome> {
  const { data: part } = await db
    .from("it_run_participants")
    .select("id, registration_id, category_id, cancelled_at")
    .eq("id", args.participantId)
    .maybeSingle<ParticipantRow>();
  if (!part) return { status: "error", message: "Runner not found" };
  if (part.cancelled_at) return { status: "already_cancelled" };

  const { data: reg } = await db
    .from("it_run_registrations")
    .select("id, event_id, category_id, payment_status, final_price, base_price, discount_amount, registration_status")
    .eq("id", part.registration_id)
    .maybeSingle<{
      id: string; event_id: string; category_id: string; payment_status: string; final_price: number;
      base_price: number; discount_amount: number; registration_status: string;
    }>();
  if (!reg) return { status: "error", message: "Registration not found" };

  // A paid booking gets a refund request. A free booking is cancelled without one. A booking not yet paid is not
  // confirmed, so nothing is cancelled for it.
  const paid = ["paid", "partially_refunded"].includes(reg.payment_status) && reg.final_price > 0;
  const free = reg.payment_status === "free";
  if (!paid && !free) return { status: "not_paid" };

  const categoryId = part.category_id ?? reg.category_id;
  const { data: category } = await db
    .from("it_run_categories")
    .select("id, name, category_type, price_rupees")
    .eq("id", categoryId)
    .maybeSingle<{ id: string; name: string; category_type: CategoryType; price_rupees: number }>();
  if (!category) return { status: "error", message: "Category not found" };

  // The runners in this category that are still active: the rejected runner and any others in the same category
  const { data: siblings } = await db
    .from("it_run_participants")
    .select("id, registration_id, category_id, cancelled_at")
    .eq("registration_id", reg.id)
    .is("cancelled_at", null)
    .returns<ParticipantRow[]>();
  const inCategory = (siblings ?? []).filter(p => (p.category_id ?? reg.category_id) === categoryId);
  const runners = inCategory.length;
  if (runners === 0) return { status: "already_cancelled" };

  let refundPaise = 0;
  let refundRequestId: string | null = null;
  if (paid) {
    const lineBase = bookingPrice(category.category_type, category.price_rupees, runners);
    refundPaise = categoryRefundPaise({
      lineBaseRupees: lineBase,
      bookingBaseRupees: reg.base_price,
      bookingDiscountRupees: reg.discount_amount,
    });
    if (refundPaise <= 0) return { status: "error", message: "The refund for this category is zero. Nothing was cancelled." };

    // 1. The refund request, first: a second open refund for the booking is refused before anything changes
    const { data: request, error: reqErr } = await db
      .from("it_run_refund_requests")
      .insert({
        event_id: reg.event_id,
        registration_id: reg.id,
        requested_by_email: args.actorEmail,
        request_reason: args.reason,
        status: "requested",
        request_kind: "category_cancel",
        requested_amount_paise: refundPaise,
        target_category_id: categoryId,
      })
      .select("id")
      .maybeSingle<{ id: string }>();
    if (reqErr?.code === "23505") return { status: "refund_already_open" };
    if (reqErr || !request) return { status: "error", message: "The refund request could not be recorded. Nothing was cancelled." };
    refundRequestId = request.id;
  }

  // 2. Cancel this category's runners and give back their seats
  const now = new Date().toISOString();
  const ids = inCategory.map(p => p.id);
  const { error: cancelErr } = await db
    .from("it_run_participants")
    .update({ cancelled_at: now, cancelled_reason: args.reason.slice(0, 500) })
    .in("id", ids)
    .is("cancelled_at", null);
  if (cancelErr) {
    // The refund request exists but the runners are not cancelled. The admin sees the request and can handle it.
    console.error("[it-run/category-cancel] cancel failed after the refund request was recorded:", cancelErr.code ?? "unknown");
    return { status: "error", message: "The runners could not be cancelled. The refund request was recorded; check it before executing." };
  }
  await db.rpc("itr_release_capacity", { p_category_id: categoryId, p_count: runners });

  // 3. Record it for the admins (no addresses or amounts beyond the amount itself)
  await db.from("it_run_audit_logs").insert({
    event_id: reg.event_id,
    actor_email: args.actorEmail,
    actor_role: "event_admin",
    action: "category_cancelled_for_id_rejection",
    entity_type: "registration",
    entity_id: reg.id,
    detail: { category_id: categoryId, runners, refund_request_id: refundRequestId, refund_paise: refundPaise, free },
  }).then(() => {}, () => {});

  return { status: "cancelled", refundRequestId, refundPaise, runners, categoryName: category.name, free };
}
