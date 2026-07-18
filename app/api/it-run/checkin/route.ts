import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole, verifyItRunQR } from "@/lib/it-run-auth";

// GET /api/it-run/checkin?q=<qr_token_or_bib_number>
// POST /api/it-run/checkin — record check-in
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "checkin_team"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "Query required" }, { status: 400 });

  const db = getSupabaseServer();

  // Try QR token
  const qrData = verifyItRunQR(q);
  let participantId = qrData?.participantId;

  // Try BIB number
  if (!participantId) {
    const { data: part } = await db
      .from("it_run_participants")
      .select("id")
      .eq("bib_number", q)
      .single();
    participantId = part?.id;
  }

  if (!participantId) return NextResponse.json({ error: "Participant not found" }, { status: 404 });

  const { data: part } = await db
    .from("it_run_participants")
    .select(`
      id, first_name, last_name, bib_number, wave,
      it_run_registrations!inner ( registration_code, payment_status,
        it_run_categories ( name, distance_km, color )
      ),
      it_run_checkins ( id, checked_in_at )
    `)
    .eq("id", participantId)
    .single();

  return NextResponse.json({ participant: part ?? null });
}

export async function POST(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "checkin_team"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { participantId } = await req.json() as { participantId: string };
    if (!participantId) return NextResponse.json({ error: "participantId required" }, { status: 400 });

    const db = getSupabaseServer();

    // Verify registration confirmed
    const { data: part } = await db
      .from("it_run_participants")
      .select("id,first_name,last_name,bib_number,it_run_registrations!inner(payment_status)")
      .eq("id", participantId)
      .single<{ id: string; first_name: string; last_name: string; bib_number: string | null; it_run_registrations: { payment_status: string } }>();

    if (!part) return NextResponse.json({ error: "Participant not found" }, { status: 404 });
    if (!["paid","free"].includes(part.it_run_registrations.payment_status)) {
      return NextResponse.json({ error: "Registration not confirmed" }, { status: 400 });
    }

    const { error: insErr } = await db
      .from("it_run_checkins")
      .insert({ participant_id: participantId, volunteer_email: session.email });

    if (insErr) {
      if (insErr.code === "23505") {
        return NextResponse.json({ error: "Already checked in", already: true }, { status: 409 });
      }
      return NextResponse.json({ error: "Failed to record check-in" }, { status: 500 });
    }

    return NextResponse.json({
      ok:   true,
      name: `${part.first_name} ${part.last_name}`,
      bib:  part.bib_number,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
