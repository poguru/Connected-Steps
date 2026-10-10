import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken, USER_SESSION_COOKIE } from "@/lib/admin-auth";
import { verifyDashboardToken } from "@/lib/it-run-dashboard-link";

// GET /api/it-run/dashboard/[code]
// [code] is either a signed dashboard token (from the email or registration page) or a plain
// registration code. Access:
//   - Valid token: read access to that one registration, no sign-in needed.
//   - Plain code: only from a signed-in account that owns the registration (linked_user_email).
// Read-only: nothing here changes registration, payment, BIB, or QR state.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  if (!code) return NextResponse.json({ error: "Code required" }, { status: 400 });

  const token = verifyDashboardToken(code);
  if (!token.ok && token.reason === "expired") {
    return NextResponse.json({
      error: "This link has expired. Please sign in to view your registration.",
      code: "EXPIRED_LINK",
    }, { status: 410 });
  }
  const viaToken = token.ok;
  const lookupCode = token.ok ? token.registrationCode : code;

  const db = getSupabaseServer();

  // Fetch registration. maybeSingle: zero rows = not found; a query error is a server failure (500), not a 404.
  const { data: reg, error: regErr } = await db
    .from("it_run_registrations")
    .select(`
      id, registration_code, lead_email, participant_count,
      base_price, discount_amount, final_price, payment_status, registration_status,
      cancelled_reason, cancelled_at, coupon_id, early_bird_offer_id, created_at, qr_token, linked_user_email,
      it_run_categories ( id, slug, name, distance_km, category_type, color, includes_timing, includes_medal ),
      it_run_events ( id, title, event_date, report_time, flag_off_time, venue_name, venue_address, city )
    `)
    .eq("registration_code", lookupCode)
    .maybeSingle<{
      id: string; registration_code: string; lead_email: string;
      participant_count: number; base_price: number; discount_amount: number;
      final_price: number; payment_status: string; registration_status: string;
      cancelled_reason: string | null; cancelled_at: string | null;
      coupon_id: string | null; early_bird_offer_id: string | null; created_at: string; qr_token: string | null;
      linked_user_email: string | null;
      it_run_categories: { id: string; slug: string; name: string; distance_km: number; category_type: string; color: string; includes_timing: boolean; includes_medal: boolean } | null;
      it_run_events: { id: string; title: string; event_date: string; report_time: string | null; flag_off_time: string | null; venue_name: string | null; venue_address: string | null; city: string | null } | null;
    }>();

  if (regErr) {
    console.error("[it-run/dashboard] registration query failed:", regErr.code ?? "unknown");
    return NextResponse.json({ error: "We couldn't load your dashboard right now.", code: "SERVER_ERROR" }, { status: 500 });
  }
  if (!reg) return NextResponse.json({ error: "We couldn't find a registration associated with this link.", code: "NOT_FOUND" }, { status: 404 });

  // Plain registration codes need a signed-in owner. Tokens already proved access above.
  if (!viaToken) {
    const sessionEmail = verifyUserToken(req.cookies.get(USER_SESSION_COOKIE)?.value ?? "");
    const owns = !!sessionEmail && !!reg.linked_user_email &&
      sessionEmail.toLowerCase() === reg.linked_user_email.toLowerCase();
    if (!owns) {
      return NextResponse.json({
        error: "Please sign in to view your registration.",
        code: "AUTH_REQUIRED",
      }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
    }
  }
  // The linked account email and the offer id are internal; only the offer's name is sent.
  const { linked_user_email: _linkedEmail, early_bird_offer_id: offerId, ...regPublic } = reg;
  void _linkedEmail;

  // Name of the discount applied at registration, for the price breakdown. A failed lookup falls back to "Early bird".
  let discountLabel: string | null = null;
  if (reg.discount_amount > 0) {
    if (offerId) {
      const { data: offer, error: offerErr } = await db
        .from("it_run_early_bird_offers")
        .select("name")
        .eq("id", offerId)
        .maybeSingle<{ name: string }>();
      if (offerErr) console.error("[it-run/dashboard] offer name lookup failed:", offerErr.code ?? "unknown");
      discountLabel = offer?.name ?? "Early bird";
    } else {
      discountLabel = "Discount code";
    }
  }

  // Fetch participants
  const { data: participants, error: participantsErr } = await db
    .from("it_run_participants")
    .select(`
      id, participant_type, qr_token, first_name, last_name, gender, email, mobile,
      blood_group, company_name, tshirt_size,
      bib_number, wave, collection_counter, verification_status,
      it_run_bib_bookings ( id, status, it_run_bib_slots ( id, location_name, location_address, slot_date, start_time, end_time ) ),
      it_run_bib_collections ( id, collected_at ),
      it_run_checkins ( id, checked_in_at )
    `)
    .eq("registration_id", reg.id);

  if (participantsErr || !participants) {
    console.error("[it-run/dashboard] participant query failed:", participantsErr?.code ?? "no rows array");
    return NextResponse.json({ error: "We couldn't load your dashboard right now.", code: "SERVER_ERROR" }, { status: 500 });
  }

  // Available BIB slots (for booking)
  const { data: bibSlots, error: bibSlotsErr } = await db
    .from("it_run_bib_slots")
    .select("id,location_name,location_address,slot_date,start_time,end_time,capacity,booked_count")
    .eq("event_id", reg.it_run_events?.id ?? "")
    .eq("is_active", true)
    .order("slot_date")
    .order("start_time");

  if (bibSlotsErr || !bibSlots) {
    console.error("[it-run/dashboard] bib slot query failed:", bibSlotsErr?.code ?? "no rows array");
    return NextResponse.json({ error: "We couldn't load your dashboard right now.", code: "SERVER_ERROR" }, { status: 500 });
  }

  // Normalize nested to-many relations: PostgREST returns null (not []) when
  // a participant has no related bib bookings / collections / check-ins.
  // The dashboard UI accesses .length on these arrays, so null crashes with
  // "Cannot read properties of null (reading 'length')".
  const normalizedParticipants = participants.map(p => ({
    ...p,
    it_run_bib_bookings:    (p.it_run_bib_bookings    as unknown[] | null) ?? [],
    it_run_bib_collections: (p.it_run_bib_collections as unknown[] | null) ?? [],
    it_run_checkins:        (p.it_run_checkins        as unknown[] | null) ?? [],
  }));

  return NextResponse.json(
    { reg: { ...regPublic, discount_label: discountLabel }, participants: normalizedParticipants, bibSlots },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
