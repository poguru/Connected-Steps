import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";

type Params = { params: Promise<{ code: string }> };

// GET /api/my-events/[code]
// Returns full hub data for a single registration (participant-authenticated).
// The registration_code is the :code URL segment.
export async function GET(req: NextRequest, { params }: Params) {
  const token = req.headers.get("x-user-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userEmail = await verifyUserToken(token);
  if (!userEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { code } = await params;
  const db = getSupabaseServer();

  // Fetch registration — must belong to the authenticated user
  const { data: reg, error: regErr } = await db
    .from("event_registrations")
    .select(`
      id, registration_code, event_id, user_email, user_name, phone,
      gender, date_of_birth, blood_group, distance_category,
      payment_status, status, original_price, coupon_discount, final_price,
      coupon_code, qr_token, checked_in_at, bib_number, bib_collected_at,
      certificate_url, certificate_generated_at, participant_count, created_at,
      razorpay_payment_id
    `)
    .eq("registration_code", code.toUpperCase())
    .eq("user_email", userEmail.toLowerCase())
    .single();

  if (regErr || !reg) return NextResponse.json({ error: "Registration not found" }, { status: 404 });

  // Fetch related data in parallel
  const [eventRes, participantsRes, invoiceRes, bib_slotRes, resultRes] = await Promise.all([
    db.from("events")
      .select(`
        id, title, event_type, cover_image, banner_image,
        start_date, start_time, end_date, end_time,
        location, share_slug, whatsapp_community_url,
        route_map_url, route_map_type, tshirt_size_chart_url,
        distance_categories, registration_closes_at,
        faqs, highlights,
        collect_tshirt
      `)
      .eq("id", reg.event_id)
      .single(),

    db.from("event_participants")
      .select(`
        id, first_name, last_name, email, mobile,
        distance_category, tshirt_size, bib_number, wave,
        qr_token, checked_in_at, tshirt_issued, breakfast_availed,
        medal_issued, bib_collected_at, certificate_url, certificate_generated_at,
        status
      `)
      .eq("registration_id", reg.id)
      .order("created_at", { ascending: true }),

    db.from("invoices")
      .select("invoice_number, total_amount, invoice_status, created_at")
      .eq("registration_id", reg.id)
      .maybeSingle(),

    db.from("bib_slot_bookings")
      .select("id, status, booked_at, bib_collection_slots(slot_date, start_time, end_time, bib_collection_centers(name, address, maps_url))")
      .eq("registration_id", reg.id)
      .maybeSingle(),

    db.from("event_results")
      .select("finish_time, gun_time_secs, chip_time_secs, overall_position, category_position, status, pace")
      .eq("registration_id", reg.id)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    registration: {
      ...reg,
      invoice:      invoiceRes.data ?? null,
      bib_slot:     bib_slotRes.data ?? null,
      result:       resultRes.data ?? null,
    },
    event:        eventRes.data ?? null,
    participants: participantsRes.data ?? [],
  });
}
