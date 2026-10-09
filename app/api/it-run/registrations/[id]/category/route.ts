import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken, USER_SESSION_COOKIE } from "@/lib/admin-auth";
import { getClientIp } from "@/lib/rate-limit";
import { requiredParticipantCount, type CategoryType } from "@/lib/it-run-category-rules";
import { getRazorpaySDK } from "@/lib/razorpay-client";
import { sendCategoryChangeEmail } from "@/lib/it-run-category-change";

// Participant category change for an existing registration.
//
// GET  /api/it-run/registrations/[id]/category   eligible categories with server-side prices
// POST /api/it-run/registrations/[id]/category   { categoryId }
//
// Scope in this version: a change to a category with the SAME price is applied directly.
// Upgrades (payment for the difference) and downgrades (refund of the difference) are not yet
// available online and are refused with a clear message.
//
// Never changed by a category change: registration ID, registration code, participant rows,
// QR tokens, BIB allocations, payment records, attendance.

type Reg = {
  id: string; event_id: string; registration_code: string; category_id: string;
  final_price: number; payment_status: string; registration_status: string;
  participant_count: number; coupon_id: string | null; linked_user_email: string | null;
};
type Cat = {
  id: string; slug: string; name: string; category_type: CategoryType; price_rupees: number;
  distance_km: number; is_active: boolean; max_participants: number | null; current_participants: number;
};

const SUPPORT = "info@connectedsteps.in";

async function ownedRegistration(req: NextRequest, id: string): Promise<{ reg: Reg; email: string } | { error: NextResponse }> {
  const email = verifyUserToken(req.cookies.get(USER_SESSION_COOKIE)?.value ?? "");
  if (!email) return { error: NextResponse.json({ error: "Please sign in.", code: "AUTH_REQUIRED" }, { status: 401 }) };

  const db = getSupabaseServer();
  const { data: reg, error } = await db
    .from("it_run_registrations")
    .select("id, event_id, registration_code, category_id, final_price, payment_status, registration_status, participant_count, coupon_id, linked_user_email")
    .eq("id", id)
    .maybeSingle<Reg>();
  if (error) return { error: NextResponse.json({ error: "We couldn't load this registration. Please try again.", code: "SERVER_ERROR" }, { status: 500 }) };
  // Same response whether the registration is missing or belongs to someone else
  if (!reg || !reg.linked_user_email || reg.linked_user_email.toLowerCase() !== email.toLowerCase()) {
    return { error: NextResponse.json({ error: "We couldn't find this registration.", code: "NOT_FOUND" }, { status: 404 }) };
  }
  return { reg, email };
}

function availability(c: Cat): "available" | "full" {
  return c.max_participants === null || c.current_participants < c.max_participants ? "available" : "full";
}

function blockReason(reg: Reg): string | null {
  if (reg.registration_status !== "active") return "This registration is no longer active.";
  if (reg.payment_status !== "paid" && reg.payment_status !== "free") {
    return "Complete your payment before changing category.";
  }
  if (reg.coupon_id) return `This registration used a discount code, so the category can't be changed online. Email ${SUPPORT}.`;
  return null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owned = await ownedRegistration(req, id);
  if ("error" in owned) return owned.error;
  const { reg } = owned;

  const db = getSupabaseServer();
  const { data: cats, error } = await db
    .from("it_run_categories")
    .select("id, slug, name, category_type, price_rupees, distance_km, is_active, max_participants, current_participants")
    .eq("event_id", reg.event_id)
    .eq("is_active", true)
    .returns<Cat[]>();
  if (error) return NextResponse.json({ error: "We couldn't load categories right now. Please try again.", code: "SERVER_ERROR" }, { status: 500 });

  const current = (cats ?? []).find(c => c.id === reg.category_id);
  const blocked = blockReason(reg);
  const options = (cats ?? [])
    .filter(c => c.id !== reg.category_id && requiredParticipantCount(c.category_type) === reg.participant_count)
    .map(c => {
      const samePrice = c.price_rupees === (current?.price_rupees ?? -1);
      const change = samePrice ? "same" : c.price_rupees > (current?.price_rupees ?? 0) ? "upgrade" : "downgrade";
      const full = availability(c) === "full";
      let note: string | null = null;
      if (blocked) note = blocked;
      else if (full) note = "This category is full.";
      else if (change === "upgrade") note = `Pay the difference of ₹${c.price_rupees - (current?.price_rupees ?? 0)} to switch.`;
      else if (change === "downgrade") note = `Downgrades are not available online yet. Email ${SUPPORT} to request one.`;
      return {
        id: c.id, name: c.name, distanceKm: c.distance_km, priceRupees: c.price_rupees,
        change, availability: availability(c), allowed: !blocked && !full && change !== "downgrade", note,
      };
    });

  return NextResponse.json({
    registrationCode: reg.registration_code,
    current: current ? { id: current.id, name: current.name, priceRupees: current.price_rupees, distanceKm: current.distance_km } : null,
    options,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owned = await ownedRegistration(req, id);
  if ("error" in owned) return owned.error;
  const { reg, email } = owned;

  let body: { categoryId?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request.", code: "INVALID_REQUEST" }, { status: 400 }); }
  if (typeof body.categoryId !== "string" || !body.categoryId) {
    return NextResponse.json({ error: "Choose a category.", code: "INVALID_REQUEST" }, { status: 400 });
  }
  if (body.categoryId === reg.category_id) {
    return NextResponse.json({ error: "This is already your category.", code: "SAME_CATEGORY" }, { status: 400 });
  }

  const blocked = blockReason(reg);
  if (blocked) return NextResponse.json({ error: blocked, code: "NOT_ELIGIBLE" }, { status: 409 });

  const db = getSupabaseServer();
  const [{ data: target }, { data: current }] = await Promise.all([
    db.from("it_run_categories")
      .select("id, slug, name, category_type, price_rupees, distance_km, is_active, max_participants, current_participants")
      .eq("id", body.categoryId).eq("event_id", reg.event_id).maybeSingle<Cat>(),
    db.from("it_run_categories")
      .select("id, price_rupees").eq("id", reg.category_id).maybeSingle<{ id: string; price_rupees: number }>(),
  ]);
  if (!target || !target.is_active) return NextResponse.json({ error: "That category is not available.", code: "CATEGORY_UNAVAILABLE" }, { status: 409 });
  if (requiredParticipantCount(target.category_type) !== reg.participant_count) {
    return NextResponse.json({ error: "That category needs a different number of participants.", code: "PARTICIPANT_COUNT" }, { status: 409 });
  }
  if (!current) return NextResponse.json({ error: "We couldn't load your current category.", code: "SERVER_ERROR" }, { status: 500 });

  // Prices are the server's, never the client's.
  if (target.price_rupees < current.price_rupees) {
    return NextResponse.json({
      error: `Downgrade refunds are not available online yet. Email ${SUPPORT}.`,
      code: "PRICE_CHANGE_NOT_SUPPORTED",
    }, { status: 409 });
  }
  if (target.price_rupees > current.price_rupees) {
    return startUpgrade(req, reg, email, current, target);
  }

  // Reserve the seats in the target category first (row-locked in the database)
  const { data: reserved, error: resErr } = await db.rpc("itr_reserve_capacity", {
    p_category_id: target.id, p_increment: reg.participant_count,
  });
  // The function returns 'confirmed' on success, 'full' or 'unavailable' otherwise
  if (resErr || reserved !== "confirmed") {
    return NextResponse.json({ error: "That category is full now. Please choose another.", code: "CATEGORY_FULL" }, { status: 409 });
  }

  // Move the registration only if it is still in the state we checked (guards against a double submit)
  const { data: moved, error: updErr } = await db
    .from("it_run_registrations")
    .update({ category_id: target.id })
    .eq("id", reg.id)
    .eq("category_id", reg.category_id)
    .eq("payment_status", reg.payment_status)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (updErr || !moved) {
    await db.rpc("itr_release_capacity", { p_category_id: target.id, p_count: reg.participant_count });
    return NextResponse.json({ error: "This registration changed while you were editing. Reload and try again.", code: "CONFLICT" }, { status: 409 });
  }

  // Free the seats in the old category exactly once, after the move succeeded
  await db.rpc("itr_release_capacity", { p_category_id: reg.category_id, p_count: reg.participant_count });

  await sendCategoryChangeEmail(db, reg.id, target.id);

  await db.from("it_run_audit_logs").insert({
    event_id: reg.event_id,
    actor_email: email.toLowerCase(),
    actor_role: "participant",
    action: "category_changed",
    entity_type: "registration",
    entity_id: reg.id,
    ip: getClientIp(req),
    detail: {
      registration_code: reg.registration_code,
      from_category_id: reg.category_id,
      to_category_id: target.id,
      price_rupees: target.price_rupees,
      payment_change: "none",
    },
  }).then(() => {}, () => {});

  return NextResponse.json({
    ok: true,
    registrationCode: reg.registration_code,
    category: { id: target.id, name: target.name, priceRupees: target.price_rupees, distanceKm: target.distance_km },
  });
}

// Upgrade: holds the seat, creates a Razorpay order for the exact difference, records the attempt.
// The registration keeps its original category until the payment is verified (see ./verify).
const HOLD_MINUTES = 20;

async function startUpgrade(
  req: NextRequest, reg: Reg, email: string,
  current: { id: string; price_rupees: number }, target: Cat,
): Promise<NextResponse> {
  const db = getSupabaseServer();
  const amountPaise = (target.price_rupees - current.price_rupees) * 100;
  if (amountPaise <= 0) {
    return NextResponse.json({ error: "This change does not need a payment.", code: "NO_PAYMENT_NEEDED" }, { status: 400 });
  }

  // Release holds that were never paid. A stale hold would block seats for everyone else.
  const { data: stale } = await db
    .from("it_run_category_changes")
    .select("id, to_category_id")
    .eq("registration_id", reg.id)
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());
  for (const s of (stale ?? []) as Array<{ id: string; to_category_id: string }>) {
    const { data: freed } = await db.from("it_run_category_changes")
      .update({ status: "cancelled" }).eq("id", s.id).eq("status", "pending").select("id").maybeSingle();
    if (freed) await db.rpc("itr_release_capacity", { p_category_id: s.to_category_id, p_count: reg.participant_count });
  }

  // Hold the seats (row-locked in the database)
  const { data: reserved, error: resErr } = await db.rpc("itr_reserve_capacity", {
    p_category_id: target.id, p_increment: reg.participant_count, p_payment_ttl_mins: HOLD_MINUTES,
  });
  if (resErr || reserved !== "confirmed") {
    return NextResponse.json({ error: "That category is full now. Please choose another.", code: "CATEGORY_FULL" }, { status: 409 });
  }

  // One open change per registration (unique index). Insert before creating the order.
  const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000).toISOString();
  const { data: change, error: insErr } = await db
    .from("it_run_category_changes")
    .insert({
      registration_id: reg.id,
      from_category_id: current.id,
      to_category_id: target.id,
      amount_paise: amountPaise,
      requested_by_email: email.toLowerCase(),
      status: "pending",
      expires_at: expiresAt,
    })
    .select("id")
    .maybeSingle<{ id: string }>();
  if (insErr || !change) {
    await db.rpc("itr_release_capacity", { p_category_id: target.id, p_count: reg.participant_count });
    if (insErr?.code === "23505") {
      return NextResponse.json({ error: "A category change is already in progress for this registration.", code: "CHANGE_IN_PROGRESS" }, { status: 409 });
    }
    return NextResponse.json({ error: "We couldn't start the change. Please try again.", code: "SERVER_ERROR" }, { status: 500 });
  }

  let orderId: string;
  try {
    const order = await getRazorpaySDK().orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `itrcat_${reg.registration_code}_${Date.now()}`,
      // Not it_run_reg_id / type "it_run": the registration webhooks must not treat this as a registration payment
      notes: { type: "it_run_category_change", it_run_change_id: change.id, it_run_reg_code: reg.registration_code },
    });
    orderId = order.id;
  } catch (e) {
    console.error("[it-run/category] order creation failed:", (e as Error).name);
    await db.from("it_run_category_changes").update({ status: "cancelled" }).eq("id", change.id);
    await db.rpc("itr_release_capacity", { p_category_id: target.id, p_count: reg.participant_count });
    return NextResponse.json({ error: "We couldn't start the payment. Please try again.", code: "PAYMENT_UNAVAILABLE" }, { status: 502 });
  }

  await db.from("it_run_category_changes").update({ razorpay_order_id: orderId }).eq("id", change.id);

  return NextResponse.json({
    kind: "payment",
    changeId: change.id,
    orderId,
    amount: amountPaise,
    currency: "INR",
    key: process.env.RAZORPAY_KEY_ID,
    toCategory: { id: target.id, name: target.name },
    expiresAt,
  });
}
