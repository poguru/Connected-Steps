import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken, USER_SESSION_COOKIE } from "@/lib/admin-auth";
import { requiredParticipantCount, type CategoryType } from "@/lib/it-run-category-rules";
import { getRefundedAmountPaise, paidAmountPaise } from "@/lib/it-run-refunds";
import { checkRefundReason } from "@/lib/it-run-refund-reason";
import { participantChangesOpen, participantChangesClosedBody } from "@/lib/it-run-participant-cutoff";

// POST /api/it-run/registrations/[id]/downgrade   { categoryId, reason }
//
// Asks to move a paid registration to a cheaper category and have the difference refunded.
// This creates a REQUEST only. Nothing is refunded, and the registration's category does not change,
// until an admin approves the request and the refund is processed (see the admin refund route).
//
// The amount is computed here from the stored registration price and the category's stored price.
// The browser never supplies a price or an amount.
//
// Refused: coupon registrations (support), a target that is not cheaper, a free target, a group size
// that does not fit the target, a full target, and anything that would refund the whole payment
// (that is a full refund request, not a downgrade).

const SUPPORT = "info@connectedsteps.in";
const NO_STORE = { "Cache-Control": "private, no-store" };

type Reg = {
  id: string; event_id: string; registration_code: string; category_id: string;
  final_price: number; amount_paid_paise: number | null; payment_status: string; registration_status: string;
  participant_count: number; coupon_id: string | null; linked_user_email: string | null;
};
type Target = {
  id: string; name: string; category_type: CategoryType; price_rupees: number;
  max_participants: number | null; current_participants: number;
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const email = verifyUserToken(req.cookies.get(USER_SESSION_COOKIE)?.value ?? "");
  if (!email) return NextResponse.json({ error: "Please sign in.", code: "AUTH_REQUIRED" }, { status: 401, headers: NO_STORE });
  if (!participantChangesOpen()) {
    return NextResponse.json(participantChangesClosedBody(), { status: 403, headers: NO_STORE });
  }

  let body: { categoryId?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: NO_STORE });
  }
  const categoryId = typeof body.categoryId === "string" ? body.categoryId : "";
  if (!categoryId) return NextResponse.json({ error: "Choose a category." }, { status: 400, headers: NO_STORE });
  const reasonCheck = checkRefundReason(body.reason);
  if (!reasonCheck.ok) {
    return NextResponse.json({ error: reasonCheck.message }, { status: 400, headers: NO_STORE });
  }
  const reason = reasonCheck.value;

  const db = getSupabaseServer();

  // Same response for "missing" and "not yours", so ids cannot be enumerated
  const { data: reg, error: regErr } = await db
    .from("it_run_registrations")
    .select("id, event_id, registration_code, category_id, final_price, amount_paid_paise, payment_status, registration_status, participant_count, coupon_id, linked_user_email")
    .eq("id", id)
    .maybeSingle<Reg>();
  if (regErr) return NextResponse.json({ error: "We couldn't load this registration. Please try again." }, { status: 500, headers: NO_STORE });
  if (!reg || !reg.linked_user_email || reg.linked_user_email.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json({ error: "We couldn't find this registration." }, { status: 404, headers: NO_STORE });
  }

  if (reg.registration_status !== "active") {
    return NextResponse.json({ error: "This registration is no longer active." }, { status: 422, headers: NO_STORE });
  }
  if (reg.payment_status !== "paid" || reg.final_price <= 0) {
    return NextResponse.json({ error: "Only a paid registration can be downgraded." }, { status: 422, headers: NO_STORE });
  }
  if (reg.coupon_id) {
    return NextResponse.json({ error: `This registration used a discount code, so a downgrade can't be requested online. Email ${SUPPORT}.` }, { status: 422, headers: NO_STORE });
  }
  if (categoryId === reg.category_id) {
    return NextResponse.json({ error: "You are already in this category." }, { status: 422, headers: NO_STORE });
  }

  const { data: target, error: tErr } = await db
    .from("it_run_categories")
    .select("id, name, category_type, price_rupees, max_participants, current_participants")
    .eq("id", categoryId)
    .eq("event_id", reg.event_id)
    .eq("is_active", true)
    .maybeSingle<Target>();
  if (tErr) return NextResponse.json({ error: "We couldn't load the category. Please try again." }, { status: 500, headers: NO_STORE });
  if (!target) return NextResponse.json({ error: "That category is not available." }, { status: 422, headers: NO_STORE });

  if (target.price_rupees <= 0) {
    return NextResponse.json({ error: `A free category is not a downgrade. Email ${SUPPORT} for a full refund request.` }, { status: 422, headers: NO_STORE });
  }
  if (target.price_rupees >= reg.final_price) {
    return NextResponse.json({ error: "That category costs the same or more. Use the category change instead." }, { status: 422, headers: NO_STORE });
  }
  if (requiredParticipantCount(target.category_type) !== reg.participant_count) {
    return NextResponse.json({ error: `${target.name} needs a different group size than this registration.` }, { status: 422, headers: NO_STORE });
  }

  // Advisory only: the category is checked again when the refund is processed
  if (target.max_participants !== null && target.current_participants >= target.max_participants) {
    return NextResponse.json({ error: `${target.name} is full.` }, { status: 409, headers: NO_STORE });
  }

  const amountPaise = (reg.final_price - target.price_rupees) * 100;
  const refundedPaise = await getRefundedAmountPaise(db, reg.id);
  const remainingPaise = paidAmountPaise(reg) - refundedPaise;
  if (amountPaise > remainingPaise) {
    return NextResponse.json({ error: "There is not enough left on this payment to refund that difference." }, { status: 422, headers: NO_STORE });
  }

  // One open request per registration (partial unique index). The registration itself is not changed here.
  const { data: created, error: insErr } = await db
    .from("it_run_refund_requests")
    .insert({
      event_id: reg.event_id,
      registration_id: reg.id,
      requested_by_email: email,
      request_reason: reason,
      status: "requested",
      request_kind: "downgrade",
      requested_amount_paise: amountPaise,
      target_category_id: target.id,
    })
    .select("id, status, created_at")
    .maybeSingle<{ id: string; status: string; created_at: string }>();

  if (insErr?.code === "23505") {
    return NextResponse.json({ error: "A request is already open for this registration." }, { status: 409, headers: NO_STORE });
  }
  if (insErr || !created) {
    console.error("[it-run/downgrade] insert failed:", insErr?.code ?? "unknown");
    return NextResponse.json({ error: "We couldn't submit the request. Please try again." }, { status: 500, headers: NO_STORE });
  }

  const rupees = amountPaise / 100;
  return NextResponse.json({
    ok: true,
    request: { id: created.id, status: created.status, created_at: created.created_at, to_category: target.name, refund_rupees: rupees },
    message: `Your request to move to ${target.name} and receive a refund of ₹${rupees.toLocaleString("en-IN")} has been submitted. Nothing has changed yet: the category and the refund happen only after our team approves the request.`,
  }, { status: 201, headers: NO_STORE });
}
