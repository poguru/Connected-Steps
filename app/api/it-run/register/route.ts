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
      .select("id,event_id,name,category_type,price_rupees,max_participants,current_participants,is_active")
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

    // Check capacity
    if (cat.max_participants !== null && cat.current_participants >= cat.max_participants) {
      return NextResponse.json({ error: "This category is fully booked" }, { status: 409 });
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

    // Calculate price
    let basePrice    = cat.price_rupees;
    let discountAmt  = 0;

    if (couponId) {
      const { data: coupon } = await db
        .from("it_run_coupons")
        .select("id,discount_type,discount_value,max_uses,use_count,min_amount,expires_at,is_active")
        .eq("id", couponId)
        .eq("event_id", cat.event_id)
        .single();

      if (coupon && coupon.is_active && (!coupon.expires_at || new Date(coupon.expires_at) > new Date())) {
        if (!coupon.max_uses || coupon.use_count < coupon.max_uses) {
          if (!coupon.min_amount || basePrice >= coupon.min_amount) {
            discountAmt = coupon.discount_type === "flat"
              ? Math.min(coupon.discount_value, basePrice)
              : Math.round(basePrice * coupon.discount_value / 100);
          }
        }
      }
    }

    const finalPrice = Math.max(0, basePrice - discountAmt);
    const regCode    = generateRegistrationCode();

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
      // Rollback registration
      await db.from("it_run_registrations").delete().eq("id", reg.id);
      return NextResponse.json({ error: "Failed to create participant records" }, { status: 500 });
    }

    // Generate QR token for primary participant
    const primaryPartId = parts[0].id;
    const qrToken = signItRunQR(regCode, primaryPartId);

    await db
      .from("it_run_registrations")
      .update({ qr_token: qrToken })
      .eq("id", reg.id);

    // Record coupon use
    if (couponId && discountAmt > 0) {
      await db
        .from("it_run_coupon_uses")
        .insert({
          coupon_id:       couponId,
          registration_id: reg.id,
          used_by_email:   participants[0]?.email?.toLowerCase()?.trim() ?? "",
        })
        .then(() =>
          db.from("it_run_coupons")
            .update({ use_count: (db as unknown as { rpc: (...a: unknown[]) => unknown }) && 0 })
            .eq("id", couponId)
        );
      // Increment coupon use count (best-effort, non-blocking)
      void db.from("it_run_coupons").select("use_count").eq("id", couponId).single()
        .then(({ data }: { data: { use_count: number } | null }) => {
          if (data) void db.from("it_run_coupons").update({ use_count: (data.use_count ?? 0) + 1 }).eq("id", couponId);
        });
    }

    // Increment category participant count
    await db
      .from("it_run_categories")
      .update({ current_participants: cat.current_participants + participants.length })
      .eq("id", categoryId);

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
