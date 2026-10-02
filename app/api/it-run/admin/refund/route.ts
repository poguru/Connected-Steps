import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";
import { createRefund } from "@/lib/razorpay-client";

// POST /api/it-run/admin/refund
// Admin-initiated refund for an IT Run registration.
// Creates the Razorpay refund then cancels the registration and releases capacity + coupon.
// Roles: super_admin, event_admin only (deliberately narrow — refunds are irreversible).
export async function POST(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { registration_id: string; reason?: string; amount_paise?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { registration_id, reason, amount_paise } = body;
  if (!registration_id) {
    return NextResponse.json({ error: "registration_id is required" }, { status: 400 });
  }

  const db = getSupabaseServer();

  // Load registration — must be paid and not already cancelled/refunded
  const { data: reg } = await db
    .from("it_run_registrations")
    .select("id, registration_code, razorpay_payment_id, final_price, payment_status, registration_status, category_id, participant_count, coupon_id, discount_amount")
    .eq("id", registration_id)
    .maybeSingle<{
      id:                  string;
      registration_code:   string;
      razorpay_payment_id: string | null;
      final_price:         number;
      payment_status:      string;
      registration_status: string;
      category_id:         string;
      participant_count:   number;
      coupon_id:           string | null;
      discount_amount:     number;
    }>();

  if (!reg) {
    return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  }
  if (reg.payment_status !== "paid") {
    return NextResponse.json({ error: "Registration is not in paid state — cannot refund" }, { status: 422 });
  }
  if (reg.registration_status === "cancelled") {
    return NextResponse.json({ error: "Registration is already cancelled" }, { status: 422 });
  }
  if (!reg.razorpay_payment_id) {
    return NextResponse.json({ error: "No Razorpay payment ID on record — cannot initiate refund" }, { status: 422 });
  }

  // ── Step 1: Atomically cancel the registration (optimistic lock) ─────────────
  // This prevents a double-refund race: if two admin requests arrive simultaneously
  // both check "not cancelled" (non-atomically), then BOTH call Razorpay. By cancelling
  // first with a guard, only the request that wins the DB race proceeds to Razorpay.
  const { data: cancelledRows } = await db
    .from("it_run_registrations")
    .update({ registration_status: "cancelled" })
    .eq("id", reg.id)
    .eq("payment_status", "paid")
    .neq("registration_status", "cancelled")
    .select("id");

  if (!cancelledRows?.length) {
    return NextResponse.json(
      { error: "Registration is already cancelled or its state changed — no refund issued" },
      { status: 409 },
    );
  }

  // ── Step 2: Create Razorpay refund ───────────────────────────────────────────
  // Registration is now cancelled (locked). If Razorpay fails we restore the status.
  let rzpRefund: { id: string; amount: number };
  try {
    rzpRefund = await createRefund(reg.razorpay_payment_id, {
      amount: amount_paise,
      speed:  "optimum",
      notes:  { reason: reason ?? "Admin-initiated refund", initiated_by: session.email },
    });
  } catch (e) {
    console.error("[it-run/admin/refund] Razorpay createRefund failed:", e);
    // Restore registration status — the admin can retry
    await db
      .from("it_run_registrations")
      .update({ registration_status: "active" })
      .eq("id", reg.id);
    return NextResponse.json({ error: "Razorpay refund failed — registration status restored" }, { status: 502 });
  }

  // ── Step 3: Release capacity and coupon ──────────────────────────────────────
  await db.rpc("itr_release_capacity", {
    p_category_id: reg.category_id,
    p_count:       reg.participant_count,
  });

  if (reg.coupon_id && reg.discount_amount > 0) {
    await db.rpc("itr_release_coupon", { p_coupon_id: reg.coupon_id });
  }

  console.log(
    `[it-run/admin/refund] ✅ Refund ${rzpRefund.id} (${rzpRefund.amount} paise) issued for` +
    ` ${reg.registration_code} by ${session.email}` +
    (reason ? ` — reason: ${reason}` : ""),
  );

  return NextResponse.json({
    ok:             true,
    refund_id:      rzpRefund.id,
    refund_amount:  rzpRefund.amount,
    registration_code: reg.registration_code,
  });
}
