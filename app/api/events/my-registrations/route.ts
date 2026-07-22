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

  // Registrations
  const { data: regs, error: regErr } = await db
    .from("event_registrations")
    .select("id, registration_code, payment_status, status, created_at, original_price, coupon_discount, final_price, event_id, distance_category, qr_token, checked_in_at, participant_count")
    .eq("user_email", userEmail.toLowerCase())
    .order("created_at", { ascending: false });

  if (regErr) return NextResponse.json({ error: "Database error" }, { status: 500 });
  if (!regs || regs.length === 0) return NextResponse.json({ registrations: [] });

  const regIds  = regs.map(r => r.id);
  const eventIds = [...new Set(regs.map(r => r.event_id))];

  // Fetch events, participants, and invoices in parallel
  const [eventsRes, participantsRes, invoicesRes] = await Promise.all([
    db.from("events")
      .select("id, title, event_type, cover_image, start_date, start_time, end_date, end_time, location, share_slug")
      .in("id", eventIds),

    db.from("event_participants")
      .select("id, registration_id, first_name, last_name, distance_category, tshirt_size, qr_token, checked_in_at, tshirt_issued, breakfast_availed, medal_issued, bib_collected_at, status")
      .in("registration_id", regIds)
      .order("created_at", { ascending: true }),

    db.from("invoices")
      .select("registration_id, invoice_number")
      .in("registration_id", regIds),
  ]);

  type EvRow = NonNullable<typeof eventsRes.data>[number];
  const evMap: Record<string, EvRow> = {};
  for (const ev of eventsRes.data ?? []) evMap[ev.id] = ev;

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

  const registrations = regs.map(r => ({
    ...r,
    events:          evMap[r.event_id] ?? null,
    participants:    participantsByReg[r.id] ?? [],
    invoice_number:  invoiceByReg[r.id] ?? null,
  }));

  return NextResponse.json({ registrations });
}
