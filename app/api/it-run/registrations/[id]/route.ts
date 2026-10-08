import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken, USER_SESSION_COOKIE } from "@/lib/admin-auth";

// GET /api/it-run/registrations/[id]
// Returns a single registration with full details (participants, payment, BIB, QR, etc.)
// Requires authentication + ownership verification (IDOR protection)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userEmail = verifyUserToken(req.cookies.get(USER_SESSION_COOKIE)?.value ?? "");

  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getSupabaseServer();

  // Fetch registration with ownership verification
  // User can only view their own registration (linked_user_email must match)
  const { data: reg, error: regErr } = await db
    .from("it_run_registrations")
    .select(`
      id, event_id, category_id, registration_code,
      lead_email, participant_count, base_price, discount_amount, final_price,
      payment_status, razorpay_order_id, razorpay_payment_id,
      created_at, updated_at,
      it_run_categories (
        id, slug, name, distance_km, category_type,
        includes_bib, includes_timing, includes_medal, includes_tshirt, includes_certificate
      ),
      it_run_events (
        id, slug, title, event_date, report_time, flag_off_time,
        venue_name, venue_address, city
      ),
      it_run_participants (
        id, participant_type, first_name, last_name, bib_name,
        gender, dob, email, mobile,
        blood_group, emergency_name, emergency_phone,
        company_name, employee_id, tshirt_size,
        bib_number, wave, verification_status,
        created_at
      )
    `)
    .eq("id", id)
    .eq("linked_user_email", userEmail)
    .single();

  if (regErr || !reg) {
    // Return 404 whether registration doesn't exist or user doesn't own it
    // Don't leak whether registration exists
    return NextResponse.json(
      { error: "Registration not found" },
      { status: 404 }
    );
  }

  // Fetch payment details if available
  let paymentDetails = null;
  if (reg.razorpay_payment_id) {
    // Note: In production, you might want to fetch this from Razorpay
    // For now, just return what we have
    paymentDetails = {
      razorpay_payment_id: reg.razorpay_payment_id,
      razorpay_order_id: reg.razorpay_order_id,
      amount: reg.final_price,
      status: reg.payment_status,
    };
  }

  // Fetch BIB collection status if available
  const { data: bibCollections } = await db
    .from("it_run_bib_collections")
    .select("participant_id, collected_at, counter_number, volunteer_email")
    .eq("participant_id", reg.it_run_participants?.[0]?.id ?? "");

  // Build response
  return NextResponse.json({
    registration: {
      id: reg.id,
      code: reg.registration_code,
      status: "confirmed", // Could derive from payment_status + created_at
      event: reg.it_run_events,
      category: reg.it_run_categories,
      booking: {
        email: reg.lead_email,
        created_at: reg.created_at,
      },
      pricing: {
        base: reg.base_price,
        discount: reg.discount_amount,
        final: reg.final_price,
      },
      payment: {
        status: reg.payment_status,
        razorpay_order_id: reg.razorpay_order_id,
        razorpay_payment_id: reg.razorpay_payment_id,
      },
      participants: (reg.it_run_participants ?? []).map((p: any) => ({
        id: p.id,
        name: `${p.first_name} ${p.last_name}`.trim(),
        bib_name: p.bib_name,
        type: p.participant_type,
        dob: p.dob,
        gender: p.gender,
        email: p.email,
        mobile: p.mobile,
        blood_group: p.blood_group,
        emergency: {
          name: p.emergency_name,
          phone: p.emergency_phone,
        },
        company: {
          name: p.company_name,
          employee_id: p.employee_id,
        },
        tshirt_size: p.tshirt_size,
        verification_status: p.verification_status,
        bib: {
          number: p.bib_number,
          collected_at: bibCollections?.[0]?.collected_at,
        },
        created_at: p.created_at,
      })),
    },
  });
}
