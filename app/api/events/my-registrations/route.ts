import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";

// GET /api/events/my-registrations
// Header: x-user-token
// Returns registrations with nested participants + invoice_number.
export async function GET(req: NextRequest) {
  const token = req.headers.get("x-user-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userEmail = await verifyUserToken(token);
  if (!userEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();

  // ── Primary: registrations the user purchased ─────────────────────────────
  const { data: regs, error: regErr } = await db
    .from("event_registrations")
    .select("id, registration_code, payment_status, status, created_at, original_price, coupon_discount, final_price, event_id, distance_category, qr_token, checked_in_at, participant_count")
    .eq("user_email", userEmail.toLowerCase())
    .order("created_at", { ascending: false });

  if (regErr) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // ── Secondary: registrations where this user appears as a non-purchaser participant.
  // Covers group bookings where someone else paid but this user was added as a participant.
  const purchasedRegIds = new Set((regs ?? []).map(r => r.id));

  const { data: participantRows } = await db
    .from("event_participants")
    .select("registration_id")
    .eq("email", userEmail.toLowerCase())
    .neq("account_email", userEmail.toLowerCase()); // exclude rows where user is purchaser (already covered above)

  const nonPurchaserRegIds = [
    ...new Set(
      (participantRows ?? [])
        .map(p => p.registration_id)
        .filter(id => id && !purchasedRegIds.has(id))
    ),
  ] as string[];

  // Fetch the non-purchaser registrations
  let nonPurchaserRegs: typeof regs = [];
  if (nonPurchaserRegIds.length > 0) {
    const { data: npRegs } = await db
      .from("event_registrations")
      .select("id, registration_code, payment_status, status, created_at, original_price, coupon_discount, final_price, event_id, distance_category, qr_token, checked_in_at, participant_count")
      .in("id", nonPurchaserRegIds)
      .order("created_at", { ascending: false });
    nonPurchaserRegs = npRegs ?? [];
  }

  // Merge: purchaser registrations first, then non-purchaser
  const allRegs = [...(regs ?? []), ...nonPurchaserRegs];

  if (allRegs.length === 0) return NextResponse.json({ registrations: [] });

  const regIds   = allRegs.map(r => r.id);
  const eventIds = [...new Set(allRegs.map(r => r.event_id))];

  // Fetch events, participants, invoices, pending category change requests, and waitlist in parallel
  const [eventsRes, participantsRes, invoicesRes, catChangesRes, waitlistRes] = await Promise.all([
    db.from("events")
      .select("id, title, event_type, cover_image, banner_image, start_date, start_time, end_date, end_time, location, share_slug, whatsapp_community_url, route_map_url, route_map_type, tshirt_size_chart_url, distance_categories, registration_closes_at, organizer_email, organizer_phone, maps_url")
      .in("id", eventIds),

    db.from("event_participants")
      .select("id, registration_id, first_name, last_name, distance_category, tshirt_size, qr_token, checked_in_at, tshirt_issued, breakfast_availed, medal_issued, bib_collected_at, bib_number, certificate_url, status")
      .in("registration_id", regIds)
      .order("created_at", { ascending: true }),

    db.from("invoices")
      .select("registration_id, invoice_number")
      .in("registration_id", regIds),

    db.from("category_change_requests")
      .select("registration_id, status, old_category, new_category, created_at")
      .in("registration_id", regIds)
      .eq("status", "pending"),

    // Separate event_waitlist entries (per-category waitlist, separate from event_registrations)
    db.from("event_waitlist")
      .select("id, event_id, distance_category, status, position, created_at, approved_at, notified_at")
      .eq("user_email", userEmail.toLowerCase())
      .in("status", ["waiting", "approved"])
      .order("created_at", { ascending: false }),
  ]);

  type EvRow = NonNullable<typeof eventsRes.data>[number];
  const evMap: Record<string, EvRow> = {};
  for (const ev of eventsRes.data ?? []) evMap[ev.id] = ev;

  // Waitlist entries — fetch event details for any event_ids not already in evMap
  const wlEntries = waitlistRes.data ?? [];
  const missingEvIds = [...new Set(wlEntries.map(w => w.event_id).filter(id => !evMap[id]))];
  if (missingEvIds.length > 0) {
    const { data: extra } = await db.from("events")
      .select("id, title, event_type, cover_image, banner_image, start_date, start_time, end_date, end_time, location, share_slug, whatsapp_community_url, route_map_url, route_map_type, tshirt_size_chart_url, distance_categories, registration_closes_at, organizer_email, organizer_phone, maps_url")
      .in("id", missingEvIds);
    for (const ev of extra ?? []) evMap[ev.id] = ev;
  }
  const waitlistEntries = wlEntries.map(w => ({ ...w, events: evMap[w.event_id] ?? null }));

  type ParticipantRow = NonNullable<typeof participantsRes.data>[number];
  const participantsByReg: Record<string, ParticipantRow[]> = {};
  for (const p of participantsRes.data ?? []) {
    if (!participantsByReg[p.registration_id]) participantsByReg[p.registration_id] = [];
    participantsByReg[p.registration_id].push(p);
  }

  const invoiceByReg: Record<string, string> = {};
  for (const inv of invoicesRes.data ?? []) {
    if (inv.registration_id) invoiceByReg[inv.registration_id] = inv.invoice_number;
  }

  const pendingCatChange: Record<string, { old_category: string; new_category: string }> = {};
  for (const r of catChangesRes.data ?? []) {
    pendingCatChange[r.registration_id] = { old_category: r.old_category, new_category: r.new_category };
  }

  const registrations = allRegs.map(r => ({
    ...r,
    events:                 evMap[r.event_id] ?? null,
    participants:           participantsByReg[r.id] ?? [],
    invoice_number:         invoiceByReg[r.id] ?? null,
    pending_category_change: pendingCatChange[r.id] ?? null,
  }));

  return NextResponse.json({ registrations, waitlist_entries: waitlistEntries });
}
