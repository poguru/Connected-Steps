import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole, verifyItRunQR } from "@/lib/it-run-auth";

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
    return lookupByRegistrationCode(db, qrData.registrationCode);
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
      bib_number, wave, verification_status, tshirt_size,
      it_run_registrations ( id, registration_code, payment_status, final_price,
        it_run_categories ( name, distance_km ),
        it_run_events ( title )
      ),
      it_run_bib_collections ( id, collected_at, volunteer_email )
    `)
    .or(`mobile.eq.${q},email.ilike.${q}`)
    .limit(5);

  return NextResponse.json({ results: parts ?? [] });
}

async function lookupByRegistrationCode(db: ReturnType<typeof import("@/lib/supabase-server").getSupabaseServer>, code: string) {
  const { data: parts } = await db
    .from("it_run_participants")
    .select(`
      id, first_name, last_name, email, mobile, company_name,
      bib_number, wave, verification_status, tshirt_size,
      it_run_registrations!inner ( id, registration_code, payment_status, final_price,
        it_run_categories ( name, distance_km ),
        it_run_events ( title )
      ),
      it_run_bib_bookings ( id, status, it_run_bib_slots ( location_name, slot_date, start_time ) ),
      it_run_bib_collections ( id, collected_at, volunteer_email )
    `)
    .eq("it_run_registrations.registration_code", code);

  return NextResponse.json({ results: parts ?? [] });
}

export async function POST(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "bib_collection"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { participantId, counterNumber, notes } = await req.json() as {
      participantId: string; counterNumber: string; notes?: string;
    };

    if (!participantId) return NextResponse.json({ error: "participantId required" }, { status: 400 });

    const db = getSupabaseServer();

    // Verify registration is paid/free
    const { data: part } = await db
      .from("it_run_participants")
      .select("id, first_name, last_name, bib_number, it_run_registrations!inner(payment_status)")
      .eq("id", participantId)
      .single<{ id: string; first_name: string; last_name: string; bib_number: string | null; it_run_registrations: { payment_status: string } }>();

    if (!part) return NextResponse.json({ error: "Participant not found" }, { status: 404 });
    if (!["paid","free"].includes(part.it_run_registrations.payment_status)) {
      return NextResponse.json({ error: "Registration not confirmed — cannot issue BIB" }, { status: 400 });
    }

    // Record collection (unique constraint prevents duplicate)
    const { error: insErr } = await db
      .from("it_run_bib_collections")
      .insert({
        participant_id:  participantId,
        volunteer_email: session.email,
        counter_number:  counterNumber ?? null,
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
