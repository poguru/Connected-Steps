import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole, verifyItRunQR } from "@/lib/it-run-auth";
import { collectionReadiness } from "@/lib/it-run-bib-desk";

// Each result carries its readiness, worked out here on the server from the recorded facts
/* eslint-disable @typescript-eslint/no-explicit-any -- the query shape is loose; readiness reads only what it needs */
function withReadiness(rows: any[]) {
  return rows.map(p => ({
    ...p,
    readiness: collectionReadiness({
      cancelled: !!p.cancelled_at,
      paymentStatus: p.it_run_registrations?.payment_status ?? "",
      participantType: p.participant_type ?? "",
      verificationOutcome: p.verification_outcome ?? null,
      bibNumber: p.bib_number ?? null,
      bibCollected: (p.it_run_bib_collections ?? []).length > 0,
    }),
  }));
}

// GET /api/it-run/bib-collection?q=<search_or_qr>
// POST /api/it-run/bib-collection  — record BIB collection
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "bib_collection", "support_desk"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "Search query required" }, { status: 400 });

  const db = getSupabaseServer();

  // Try QR token first
  const qrData = verifyItRunQR(q);
  if (qrData) {
    // A participant's QR names that participant: only their record is returned, never another runner on the booking
    return lookupByRegistrationCode(db, qrData.registrationCode, qrData.participantId);
  }

  // Try registration code (ITRUN2-XXXXXXXX)
  if (q.toUpperCase().startsWith("ITRUN")) {
    return lookupByRegistrationCode(db, q.toUpperCase());
  }

  // Search by mobile or email
  const { data: parts } = await db
    .from("it_run_participants")
    .select(`
      id, first_name, last_name, email, mobile, company_name,
      bib_number, wave, verification_status, verification_outcome, verification_version, participant_type, cancelled_at, tshirt_size,
      it_run_registrations ( id, registration_code, payment_status, final_price,
        it_run_categories ( name, distance_km ),
        it_run_events ( title )
      ),
      it_run_bib_collections ( id, collected_at, volunteer_email )
    `)
    .or(`mobile.eq.${q},email.ilike.${q}`)
    .limit(5);

  return NextResponse.json({ results: withReadiness(parts ?? []) });
}

async function lookupByRegistrationCode(db: ReturnType<typeof import("@/lib/supabase-server").getSupabaseServer>, code: string, participantId?: string) {
  const { data: parts } = await db
    .from("it_run_participants")
    .select(`
      id, first_name, last_name, email, mobile, company_name,
      bib_number, wave, verification_status, verification_outcome, verification_version, participant_type, cancelled_at, tshirt_size,
      it_run_registrations!inner ( id, registration_code, payment_status, final_price,
        it_run_categories ( name, distance_km ),
        it_run_events ( title )
      ),
      it_run_bib_bookings ( id, status, it_run_bib_slots ( location_name, slot_date, start_time ) ),
      it_run_bib_collections ( id, collected_at, volunteer_email )
    `)
    .eq("it_run_registrations.registration_code", code);

  const scoped = participantId ? (parts ?? []).filter(p => p.id === participantId) : (parts ?? []);
  return NextResponse.json({ results: withReadiness(scoped) });
}

export async function POST(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "bib_collection"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { participantId, counterNumber, counterId, notes } = await req.json() as {
      participantId: string; counterNumber?: string; counterId?: string; notes?: string;
    };

    if (!participantId) return NextResponse.json({ error: "participantId required" }, { status: 400 });

    const db = getSupabaseServer();

    // Verify registration is paid/free
    const { data: part } = await db
      .from("it_run_participants")
      .select("id, first_name, last_name, bib_number, cancelled_at, participant_type, verification_outcome, it_run_registrations!inner(payment_status), it_run_bib_collections(id)")
      .eq("id", participantId)
      .single<{ id: string; first_name: string; last_name: string; bib_number: string | null; cancelled_at: string | null; participant_type: string; verification_outcome: string | null; it_run_registrations: { payment_status: string }; it_run_bib_collections: Array<{ id: string }> | null }>();

    if (!part) return NextResponse.json({ error: "Participant not found" }, { status: 404 });
    // The policy is checked on the server: a BIB is issued only when the readiness is ready
    const readiness = collectionReadiness({
      cancelled: !!part.cancelled_at,
      paymentStatus: part.it_run_registrations.payment_status,
      participantType: part.participant_type,
      verificationOutcome: part.verification_outcome,
      bibNumber: part.bib_number,
      bibCollected: (part.it_run_bib_collections ?? []).length > 0,
    });
    if (readiness.state !== "ready") {
      return NextResponse.json({ error: readiness.message, code: readiness.state.toUpperCase() }, { status: 409 });
    }

    // The counter must be one of the event's enabled counters
    let counterLabel: string | null = counterNumber ?? null;
    let counterRef: string | null = null;
    if (counterId) {
      const { data: counter } = await db
        .from("it_run_bib_counters")
        .select("id, label, is_enabled")
        .eq("id", counterId)
        .maybeSingle<{ id: string; label: string; is_enabled: boolean }>();
      if (!counter) return NextResponse.json({ error: "Counter not found" }, { status: 404 });
      if (!counter.is_enabled) return NextResponse.json({ error: "This counter is disabled. Choose an active counter.", code: "COUNTER_DISABLED" }, { status: 409 });
      counterLabel = counter.label;
      counterRef = counter.id;
    }

    // Record collection (unique constraint prevents duplicate)
    const { error: insErr } = await db
      .from("it_run_bib_collections")
      .insert({
        participant_id:  participantId,
        volunteer_email: session.email,
        counter_number:  counterLabel,
        counter_id:      counterRef,
        notes:           notes ?? null,
      });

    if (insErr) {
      if (insErr.code === "23505") {
        return NextResponse.json({ error: "BIB already collected for this participant", already: true }, { status: 409 });
      }
      return NextResponse.json({ error: "Failed to record collection" }, { status: 500 });
    }

    return NextResponse.json({
      ok:   true,
      name: `${part.first_name} ${part.last_name}`,
      bib:  part.bib_number,
    });
  } catch (e: unknown) {
    console.error("[it-run/bib-collection] error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
