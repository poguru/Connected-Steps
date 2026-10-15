import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole, getClientIp } from "@/lib/it-run-auth";
import { planBibNumbers, type BibAssignment, type BibCandidate } from "@/lib/it-run-bib";
import { sendItRunBibInviteEmail, type BibEmailOutcome } from "@/lib/it-run-email";

// GET /api/it-run/admin/bibs?unallocated=1
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "bib_collection"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const unallocated = req.nextUrl.searchParams.get("unallocated") === "1";

  const { data: event } = await db.from("it_run_events").select("id").eq("slug", "sprint-2").single();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  let q = db
    .from("it_run_participants")
    .select(`
      id, first_name, last_name, email, mobile, bib_number, wave, collection_counter,
      verification_status, tshirt_size, participant_type,
      it_run_registrations!inner ( registration_code, payment_status,
        it_run_categories ( name, distance_km, slug, color ) ),
      it_run_bib_collections ( id, collected_at )
    `)
    .eq("event_id", event.id)
    .in("it_run_registrations.payment_status", ["paid","free"]);

  if (unallocated) q = q.is("bib_number", null);

  const { data, error } = await q.order("id");
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // Normalize: PostgREST returns null for empty to-many relations.
  // Frontend expects [] consistently. Map null → [] for it_run_bib_collections.
  const normalizedData = (data ?? []).map((p: any) => ({
    ...p,
    it_run_bib_collections: (p.it_run_bib_collections as unknown[] | null) ?? [],
  }));

  return NextResponse.json({ data: normalizedData });
}

// POST /api/it-run/admin/bibs — "Allocate BIBs and send"
//
// Allocates BIB numbers to every confirmed participant who has none, then sends the BIB email (numbers, QR codes
// and the collection slot link) to each confirmed registration that now has all its numbers and has not had one.
// Refused until registration has closed. Safe to press again: a participant is numbered once, and an email is sent once.
export async function POST(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const db = getSupabaseServer();

    const { data: event } = await db
      .from("it_run_events")
      .select("id, registration_closes_at")
      .eq("slug", "sprint-2")
      .single<{ id: string; registration_closes_at: string | null }>();
    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    if (event.registration_closes_at && Date.now() < new Date(event.registration_closes_at).getTime()) {
      return NextResponse.json({
        error: "Registration has not closed yet. BIB numbers are allocated after it closes.",
        code: "REGISTRATION_OPEN",
      }, { status: 409 });
    }

    const { data: cats } = await db
      .from("it_run_categories")
      .select("id, slug")
      .eq("event_id", event.id)
      .returns<Array<{ id: string; slug: string }>>();
    const slugById = new Map((cats ?? []).map(c => [c.id, c.slug]));

    // Confirmed participants without a BIB (a confirmed registration has every adult verified and is paid or free)
    const { data: unnumbered, error: candidateErr } = await db
      .from("it_run_participants")
      .select("id, registration_id, category_id, participant_type, team_key, created_at, it_run_registrations!inner ( payment_status, registration_status )")
      .eq("event_id", event.id)
      .is("bib_number", null)
      .is("cancelled_at", null)
      .eq("it_run_registrations.registration_status", "active")
      .in("it_run_registrations.payment_status", ["paid", "free"])
      .returns<Array<{
        id: string; registration_id: string; category_id: string | null; participant_type: string;
        team_key: string | null; created_at: string;
      }>>();
    if (candidateErr) return NextResponse.json({ error: "Database error" }, { status: 500 });

    const { data: existing } = await db
      .from("it_run_participants")
      .select("bib_number")
      .eq("event_id", event.id)
      .not("bib_number", "is", null)
      .returns<Array<{ bib_number: string }>>();

    const candidates: BibCandidate[] = (unnumbered ?? []).map(p => ({
      participantId:   p.id,
      registrationId: p.registration_id,
      categorySlug:    slugById.get(p.category_id ?? "") ?? "",
      participantType: p.participant_type,
      teamKey:         p.team_key,
      createdAt:       p.created_at,
    }));
    const plan = planBibNumbers(candidates, (existing ?? []).map(r => r.bib_number));

    // Write every number, or none. A team's two numbers must stay paired, so a failed write rolls the run back.
    const written: BibAssignment[] = [];
    for (const a of plan.assignments) {
      const { data: row, error } = await db
        .from("it_run_participants")
        .update({ bib_number: a.bib })
        .eq("id", a.participantId)
        .is("bib_number", null)
        .select("id");
      if (error || !row?.length) {
        for (const w of written) {
          await db.from("it_run_participants").update({ bib_number: null }).eq("id", w.participantId).eq("bib_number", w.bib);
        }
        console.error("[it-run/admin/bibs] allocation write failed, rolled back:", error?.message ?? "no row updated");
        return NextResponse.json({
          error: "BIB allocation was interrupted and nothing was kept. Press Allocate BIBs and send again.",
          code: "ALLOCATION_RETRY",
        }, { status: 409 });
      }
      written.push(a);
    }

    // Confirmed registrations that have not had their BIB email. Those without numbers are not sent.
    const { data: ready } = await db
      .from("it_run_registrations")
      .select("id, lead_email")
      .eq("event_id", event.id)
      .eq("registration_status", "active")
      .in("payment_status", ["paid", "free"])
      .is("bib_email_sent_at", null)
      .returns<Array<{ id: string; lead_email: string }>>();

    const outcomes = { sent: 0, not_allocated: 0, failed: 0, skipped: 0 };
    for (const reg of ready ?? []) {
      let outcome: BibEmailOutcome;
      try {
        outcome = await sendItRunBibInviteEmail(reg.id, reg.lead_email);
      } catch (e) {
        console.error(`[admin/bibs] BIB email failed reg=${reg.id}:`, e);
        outcome = "failed";
      }
      outcomes[outcome]++;
    }

    db.from("it_run_audit_logs").insert({
      event_id:    event.id,
      actor_email: session.email,
      actor_role:  session.role,
      action:      "allocate_bibs_and_send",
      entity_type: "event",
      entity_id:   "sprint-2",
      ip:          getClientIp(req),
      detail:      { allocated: written.length, problems: plan.problems.length, ...outcomes },
    }).then(() => {}, () => {});

    return NextResponse.json({
      ok: true,
      allocated: written.length,
      problems: plan.problems,
      emailed: outcomes.sent,
      notAllocated: outcomes.not_allocated,
      emailFailed: outcomes.failed,
    });
  } catch (e: unknown) {
    console.error("[it-run/admin/bibs] error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
