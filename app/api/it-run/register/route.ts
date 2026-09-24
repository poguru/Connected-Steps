import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { generateRegistrationCode, signItRunQR } from "@/lib/it-run-auth";

interface ParticipantInput {
  type: string; firstName: string; lastName: string;
  gender: string; dob: string; email: string; mobile: string;
  bloodGroup: string; emergencyName: string; emergencyPhone: string;
  companyName: string; employeeId: string; companyIdUrl: string;
  tshirtSize: string; medicalConditions: string; foodPreference: string;
}

// POST /api/it-run/register
// Creates a new registration + participant records.
// Payment is handled separately via /api/it-run/payment/create-order.
export async function POST(req: NextRequest) {
  try {
    const { categoryId, couponId, participants } = await req.json() as {
      categoryId:   string;
      couponId:     string | null;
      participants: ParticipantInput[];
    };

    if (!categoryId || !Array.isArray(participants) || participants.length === 0) {
      return NextResponse.json({ error: "categoryId and participants are required" }, { status: 400 });
    }

    const db = getSupabaseServer();

    // Fetch category + event
    const { data: cat } = await db
      .from("it_run_categories")
      .select("id,event_id,name,category_type,price_rupees,max_participants,is_active")
      .eq("id", categoryId)
      .single();

    if (!cat || !cat.is_active) {
      return NextResponse.json({ error: "Category not found or inactive" }, { status: 404 });
    }

    // Validate participant count
    const expectedCount = cat.category_type === "solo" ? 1 : 2;
    if (participants.length !== expectedCount) {
      return NextResponse.json({ error: `Expected ${expectedCount} participant(s) for ${cat.category_type} category` }, { status: 400 });
    }

    // Validate child age (for kid category)
    if (cat.category_type === "kid") {
      const child = participants.find(p => p.type === "child");
      if (child?.dob) {
        const ageDays = (Date.now() - new Date(child.dob).getTime()) / 86400000;
        if (ageDays > 11 * 365) {
          return NextResponse.json({ error: "Child participant must be 10 years or younger" }, { status: 400 });
        }
      }
    }

    const basePrice = cat.price_rupees;

    // Atomically validate and claim one coupon use.
    // The DB function acquires a FOR UPDATE lock on the coupon row so concurrent
    // uses serialize — the 101st use of a 100-use coupon is impossible.
    // Returns the discount amount in rupees, or NULL if the coupon is invalid,
    // inactive, expired, exhausted, or the order is below the minimum amount.
    let discountAmt    = 0;
    let couponReserved = false;

    if (couponId) {
      const { data: couponDiscount, error: couponErr } = await db.rpc("itr_use_coupon", {
        p_coupon_id:  couponId,
        p_event_id:   cat.event_id,
        p_base_price: basePrice,
      });

      if (couponErr) {
        console.error("[it-run/register] coupon RPC error:", couponErr.message);
        return NextResponse.json({ error: "Coupon validation failed" }, { status: 500 });
      }

      if (couponDiscount === null) {
        return NextResponse.json({ error: "Coupon is invalid or no longer available" }, { status: 409 });
      }

      discountAmt    = couponDiscount as number;
      couponReserved = true;
    }

    const finalPrice = Math.max(0, basePrice - discountAmt);
    const regCode    = generateRegistrationCode();

    // Atomically reserve capacity.
    // The DB function acquires a FOR UPDATE row lock on it_run_categories so
    // two simultaneous requests for the final slot serialize here — only one
    // can increment the counter past max_participants.
    // It also expires stale pending registrations (> 15 min without payment)
    // so abandoned attempts don't permanently consume capacity.
    const { data: reserveStatus, error: reserveErr } = await db.rpc(
      "itr_reserve_capacity",
      { p_category_id: categoryId, p_increment: participants.length, p_payment_ttl_mins: 15 },
    );

    if (reserveErr) {
      console.error("[it-run/register] capacity RPC error:", reserveErr.message);
      if (couponReserved) void db.rpc("itr_release_coupon", { p_coupon_id: couponId });
      return NextResponse.json({ error: "Capacity check failed" }, { status: 500 });
    }
    if (reserveStatus === "full") {
      if (couponReserved) void db.rpc("itr_release_coupon", { p_coupon_id: couponId });
      return NextResponse.json({ error: "This category is fully booked" }, { status: 409 });
    }
    if (reserveStatus === "unavailable") {
      if (couponReserved) void db.rpc("itr_release_coupon", { p_coupon_id: couponId });
      return NextResponse.json({ error: "Category not found or inactive" }, { status: 404 });
    }

    // Insert registration
    const { data: reg, error: regErr } = await db
      .from("it_run_registrations")
      .insert({
        event_id:         cat.event_id,
        category_id:      categoryId,
        registration_code: regCode,
        lead_email:       participants[0]?.email?.toLowerCase()?.trim() ?? "",
        participant_count: participants.length,
        base_price:       basePrice,
        discount_amount:  discountAmt,
        final_price:      finalPrice,
        coupon_id:        couponId ?? null,
        payment_status:   finalPrice === 0 ? "free" : "pending",
      })
      .select("id")
      .single();

    if (regErr || !reg) {
      console.error("[it-run/register] reg insert error:", regErr?.message);
      void db.rpc("itr_release_capacity", { p_category_id: categoryId, p_count: participants.length });
      if (couponReserved) void db.rpc("itr_release_coupon", { p_coupon_id: couponId });
      return NextResponse.json({ error: "Failed to create registration" }, { status: 500 });
    }

    // Insert participants
    const partInserts = participants.map(p => ({
      registration_id:    reg.id,
      event_id:           cat.event_id,
      participant_type:   p.type,
      first_name:         p.firstName.trim(),
      last_name:          p.lastName.trim(),
      gender:             p.gender,
      dob:                p.dob || null,
      email:              p.email?.toLowerCase()?.trim() || null,
      mobile:             p.mobile.trim(),
      blood_group:        p.bloodGroup || null,
      emergency_name:     p.emergencyName?.trim() || null,
      emergency_phone:    p.emergencyPhone?.trim() || null,
      company_name:       p.companyName?.trim() || null,
      employee_id:        p.employeeId?.trim() || null,
      company_id_url:     p.companyIdUrl || null,
      tshirt_size:        p.tshirtSize || null,
      medical_conditions: p.medicalConditions?.trim() || null,
      food_preference:    p.foodPreference || null,
      verification_status: p.companyIdUrl ? "pending" : "need_clarification",
    }));

    const { data: parts, error: partErr } = await db
      .from("it_run_participants")
      .insert(partInserts)
      .select("id");

    if (partErr || !parts) {
      console.error("[it-run/register] participant insert error:", partErr?.message);
      await db.from("it_run_registrations").delete().eq("id", reg.id);
      void db.rpc("itr_release_capacity", { p_category_id: categoryId, p_count: participants.length });
      if (couponReserved) void db.rpc("itr_release_coupon", { p_coupon_id: couponId });
      return NextResponse.json({ error: "Failed to create participant records" }, { status: 500 });
    }

    // Generate a unique QR token per participant.
    // Each token encodes (registrationCode:participantId) so scanning at check-in
    // resolves the correct individual regardless of how many participants share
    // this registration.
    const participantQRs = parts.map(part => ({
      id:       part.id,
      qr_token: signItRunQR(regCode, part.id),
    }));

    await Promise.all(
      participantQRs.map(({ id, qr_token }) =>
        db.from("it_run_participants").update({ qr_token }).eq("id", id)
      )
    );

    // Keep primary participant's token on the registration row for backward
    // compatibility with existing dashboard, webhook, and email code.
    await db
      .from("it_run_registrations")
      .update({ qr_token: participantQRs[0].qr_token })
      .eq("id", reg.id);

    // Record coupon use for audit trail.
    // use_count was already incremented atomically by itr_use_coupon above.
    if (couponId && discountAmt > 0) {
      const { error: useErr } = await db
        .from("it_run_coupon_uses")
        .insert({
          coupon_id:       couponId,
          registration_id: reg.id,
          used_by_email:   participants[0]?.email?.toLowerCase()?.trim() ?? "",
        });
      if (useErr) {
        console.error("[it-run/register] coupon_uses insert error:", useErr.message);
      }
    }

    return NextResponse.json({
      registrationId:   reg.id,
      registrationCode: regCode,
      finalPrice,
      participantIds: parts.map(p => p.id),
    });
  } catch (e: unknown) {
    console.error("[it-run/register] error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
