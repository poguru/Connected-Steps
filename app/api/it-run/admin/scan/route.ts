import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole, verifyItRunQR } from "@/lib/it-run-auth";

// GET /api/it-run/admin/scan?q=<qr_token | bib_number | registration_code>
// Returns full participant status for the scan workflow.
// Accepts: HMAC-signed QR token, BIB number, or registration code.
export async function GET(req: NextRequest) {
  const session = requireRole(req, [
    "event_admin", "bib_collection", "checkin_team", "support_desk",
  ]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "Scan input required" }, { status: 400 });

  const db = getSupabaseServer();

  const { data: event } = await db
    .from("it_run_events").select("id").eq("slug", "sprint-2").single();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  let participantId: string | null = null;

  // 1. Try HMAC-signed QR token
  const qrData = verifyItRunQR(q);
  if (qrData?.participantId) {
    participantId = qrData.participantId;
  }

  // 2. Try BIB number (pure numeric or numeric string)
  if (!participantId && /^\d+$/.test(q)) {
    const { data: p } = await db
      .from("it_run_participants")
      .select("id")
      .eq("event_id", event.id)
      .eq("bib_number", q)
      .maybeSingle();
    participantId = p?.id ?? null;
  }

  // 3. Try registration code — returns lead participant of that registration
  if (!participantId) {
    const { data: reg } = await db
      .from("it_run_registrations")
      .select("id")
      .eq("event_id", event.id)
      .ilike("registration_code", q)
      .maybeSingle();
    if (reg) {
      const { data: p } = await db
        .from("it_run_participants")
        .select("id")
        .eq("registration_id", reg.id)
        .order("created_at")
        .limit(1)
        .maybeSingle();
      participantId = p?.id ?? null;
    }
  }

  if (!participantId) {
    return NextResponse.json({ error: "No participant found for this code" }, { status: 404 });
  }

  // Full participant fetch with all status indicators
  const { data: participant } = await db
    .from("it_run_participants")
    .select(`
      id, first_name, last_name, participant_type,
      tshirt_size, bib_number, wave, mobile, email,
      verification_status,
      it_run_registrations!inner (
        id, registration_code, payment_status, registration_status,
        it_run_categories ( id, name, distance_km, color )
      ),
      it_run_bib_collections ( id, collected_at, volunteer_email, counter_number ),
      it_run_tshirt_issuances ( id, issued_at, is_override, volunteer_email ),
      it_run_checkins ( id, checked_in_at, volunteer_email )
    `)
    .eq("id", participantId)
    .single();

  if (!participant) {
    return NextResponse.json({ error: "Participant not found" }, { status: 404 });
  }

  // Reject unconfirmed registrations at scan time
  const payStatus = (participant.it_run_registrations as unknown as { payment_status: string }).payment_status;
  const regStatus = (participant.it_run_registrations as unknown as { registration_status: string }).registration_status;

  if (!["paid", "free"].includes(payStatus)) {
    return NextResponse.json({
      error: "Registration not confirmed (payment pending or failed)",
      payment_status: payStatus,
    }, { status: 400 });
  }
  if (regStatus === "cancelled") {
    return NextResponse.json({
      error: "This registration has been cancelled",
      registration_status: regStatus,
    }, { status: 400 });
  }

  return NextResponse.json({ participant });
}
