import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken, USER_SESSION_COOKIE } from "@/lib/admin-auth";
import { getClientIp } from "@/lib/rate-limit";
import { requiredParticipantCount, type CategoryType } from "@/lib/it-run-category-rules";

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
      else if (change !== "same") note = `Online ${change}s are not available yet. Email ${SUPPORT} to request one.`;
      return {
        id: c.id, name: c.name, distanceKm: c.distance_km, priceRupees: c.price_rupees,
        change, availability: availability(c), allowed: !blocked && !full && change === "same", note,
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

  // Prices are the server's, never the client's. Only the same-price change is applied here.
  if (target.price_rupees !== current.price_rupees) {
    return NextResponse.json({
      error: target.price_rupees > current.price_rupees
        ? `Upgrades that need a payment difference are not available online yet. Email ${SUPPORT}.`
        : `Downgrade refunds are not available online yet. Email ${SUPPORT}.`,
      code: "PRICE_CHANGE_NOT_SUPPORTED",
    }, { status: 409 });
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
