import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireStaffPermission, requireStaffRole } from "@/lib/staff-auth";
import { verifyItRunQR } from "@/lib/it-run-auth";

// GET /api/it-run/staff/participant/lookup?q=<qr_token|registration_code|bib_number>
// Resolves participant from QR/code. Server-side validation, no client trust.
export async function GET(req: NextRequest) {
  const session = requireStaffRole(req, [
    "super_admin",
    "event_admin",
    "bib_staff",
    "checkin_staff",
    "breakfast_staff",
    "goodies_staff",
    "tshirt_staff",
    "medal_staff",
  ]);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!requireStaffPermission(session, "PARTICIPANT_SEARCH")) {
    return NextResponse.json({ error: "Permission PARTICIPANT_SEARCH required" }, { status: 403 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ error: "Search query required" }, { status: 400 });
  }

  const db = getSupabaseServer();

  let participantId: string | null = null;

  // 1. Try HMAC-signed QR token
  const qrData = verifyItRunQR(q);
  if (qrData?.participantId) {
    participantId = qrData.participantId;
  }

  // 2. Try BIB number (numeric)
  if (!participantId && /^\d+$/.test(q)) {
    const { data: p } = await db
      .from("it_run_participants")
      .select("id")
      .eq("event_id", session.eventId)
      .eq("bib_number", q)
      .maybeSingle<{ id: string }>();

    participantId = p?.id ?? null;
  }

  // 3. Try registration code
  if (!participantId) {
    const { data: reg } = await db
      .from("it_run_registrations")
      .select("id")
      .eq("event_id", session.eventId)
      .ilike("registration_code", q)
      .maybeSingle<{ id: string }>();

    if (reg) {
      const { data: p } = await db
        .from("it_run_participants")
        .select("id")
        .eq("registration_id", reg.id)
        .order("created_at")
        .limit(1)
        .maybeSingle<{ id: string }>();

      participantId = p?.id ?? null;
    }
  }

  if (!participantId) {
    return NextResponse.json({ error: "Participant not found" }, { status: 404 });
  }

  // Load full participant data with all entitlements
  const { data: participant } = await db
    .from("it_run_participants")
    .select(
      `
      id, first_name, last_name, bib_number, wave, tshirt_size,
      verification_status, it_run_registrations!inner(
        id, registration_code, payment_status, registration_status,
        it_run_categories(name, color)
      )
    `,
    )
    .eq("id", participantId)
    .eq("event_id", session.eventId)
    .maybeSingle<{
      id: string;
      first_name: string;
      last_name: string;
      bib_number: string | null;
      wave: string | null;
      tshirt_size: string | null;
      verification_status: string;
      it_run_registrations: {
        id: string;
        registration_code: string;
        payment_status: string;
        registration_status: string;
        it_run_categories: {
          name: string;
          color: string;
        };
      };
    }>();

  if (!participant) {
    return NextResponse.json({ error: "Participant not found" }, { status: 404 });
  }

  const reg = participant.it_run_registrations;

  // Load entitlements
  const { data: entitlements } = await db
    .from("it_run_event_entitlements")
    .select("entitlement_type, status, issued_at, issued_by")
    .eq("event_id", session.eventId)
    .eq("participant_id", participantId);

  const entitlementMap = new Map<string, { status: string; issuedAt: string | null }>();
  (entitlements ?? []).forEach((e: any) => {
    entitlementMap.set(e.entitlement_type, {
      status: e.status,
      issuedAt: e.issued_at,
    });
  });

  // Check registration eligibility
  const canIssue =
    (reg.payment_status === "paid" || reg.payment_status === "free") &&
    reg.registration_status !== "cancelled";

  return NextResponse.json({
    participant: {
      id: participant.id,
      firstName: participant.first_name,
      lastName: participant.last_name,
      bibNumber: participant.bib_number,
      wave: participant.wave,
      tshirtSize: participant.tshirt_size,
      verificationStatus: participant.verification_status,
      registrationCode: reg.registration_code,
      category: reg.it_run_categories.name,
      categoryColor: reg.it_run_categories.color,
      canIssue,
      paymentStatus: reg.payment_status,
      registrationStatus: reg.registration_status,
    },
    entitlements: Object.fromEntries(entitlementMap),
  });
}
