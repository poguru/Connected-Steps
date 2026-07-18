import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// GET /api/it-run/dashboard/[code]
// Returns full registration + participant + bib + checkin data for the participant dashboard.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  if (!code) return NextResponse.json({ error: "Code required" }, { status: 400 });

  const db = getSupabaseServer();

  // Fetch registration
  const { data: reg } = await db
    .from("it_run_registrations")
    .select(`
      id, registration_code, lead_email, participant_count,
      base_price, discount_amount, final_price, payment_status,
      coupon_id, created_at, qr_token,
      it_run_categories ( id, slug, name, distance_km, category_type, color, includes_timing, includes_medal ),
      it_run_events ( id, title, event_date, report_time, flag_off_time, venue_name, venue_address, city )
    `)
    .eq("registration_code", code)
    .single<{
      id: string; registration_code: string; lead_email: string;
      participant_count: number; base_price: number; discount_amount: number;
      final_price: number; payment_status: string; coupon_id: string | null;
      created_at: string; qr_token: string | null;
      it_run_categories: { id: string; slug: string; name: string; distance_km: number; category_type: string; color: string; includes_timing: boolean; includes_medal: boolean } | null;
      it_run_events: { id: string; title: string; event_date: string; report_time: string | null; flag_off_time: string | null; venue_name: string | null; venue_address: string | null; city: string | null } | null;
    }>();

  if (!reg) return NextResponse.json({ error: "Registration not found" }, { status: 404 });

  // Fetch participants
  const { data: participants } = await db
    .from("it_run_participants")
    .select(`
      id, participant_type, first_name, last_name, gender, email, mobile,
      blood_group, company_name, tshirt_size,
      bib_number, wave, collection_counter, verification_status,
      it_run_bib_bookings ( id, status, it_run_bib_slots ( id, location_name, location_address, slot_date, start_time, end_time ) ),
      it_run_bib_collections ( id, collected_at ),
      it_run_checkins ( id, checked_in_at )
    `)
    .eq("registration_id", reg.id);

  // Available BIB slots (for booking)
  const { data: bibSlots } = await db
    .from("it_run_bib_slots")
    .select("id,location_name,location_address,slot_date,start_time,end_time,capacity,booked_count")
    .eq("event_id", reg.it_run_events?.id ?? "")
    .eq("is_active", true)
    .order("slot_date")
    .order("start_time");

  return NextResponse.json({ reg, participants: participants ?? [], bibSlots: bibSlots ?? [] });
}
