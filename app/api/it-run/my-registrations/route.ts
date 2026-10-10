import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken, USER_SESSION_COOKIE } from "@/lib/admin-auth";
import { participantChangesOpen } from "@/lib/it-run-participant-cutoff";
import {
  buildMyRegistrations,
  claimEmailVariants,
  type MyRegistrationRow,
  type MyRegParticipantRow,
  type MyRegCollectionRow,
} from "@/lib/it-run-my-registrations";

// GET /api/it-run/my-registrations
// Returns the IT Run registrations linked to the signed-in Connected Steps account, with participants,
// BIB numbers, and QR tokens. Identity comes only from the signed session cookie. No query parameter or
// request body can select another account's registrations.
//
// Queries are separate on purpose: BIB collections belong to participants, not to registrations, so they
// cannot be embedded under a registration. Assembly is in lib/it-run-my-registrations.ts.

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const userEmail = verifyUserToken(req.cookies.get(USER_SESSION_COOKIE)?.value ?? "");
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const db = getSupabaseServer();

  const { data: regs, error: regErr } = await db
    .from("it_run_registrations")
    .select(`
      id, registration_code, payment_status, registration_status,
      final_price, base_price, discount_amount, early_bird_offer_id, participant_count, created_at,
      category:it_run_categories ( name, distance_km, color, category_type ),
      event:it_run_events ( title, event_date )
    `)
    .eq("linked_user_email", userEmail)
    .order("created_at", { ascending: false })
    .returns<MyRegistrationRow[]>();

  if (regErr) {
    console.error("[it-run/my-registrations] registrations query failed:", regErr.code ?? "unknown");
    return NextResponse.json({ error: "Failed to load registrations" }, { status: 500, headers: NO_STORE });
  }

  // Registrations made with this email that no account has claimed yet. A failure here must not hide the list.
  const { data: unclaimed, error: claimErr } = await db
    .from("it_run_registrations")
    .select("id")
    .in("lead_email", claimEmailVariants(userEmail))
    .is("linked_user_email", null)
    .returns<Array<{ id: string }>>();
  if (claimErr) console.error("[it-run/my-registrations] claimable count failed:", claimErr.code ?? "unknown");
  const claimable = claimErr ? 0 : (unclaimed ?? []).length;

  // Server clock. After the cutoff the list is still returned, but no change or refund action is offered.
  const changesOpen = participantChangesOpen();

  const rows = regs ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ registrations: [], claimable, participantChangesOpen: changesOpen }, { headers: NO_STORE });
  }

  const { data: parts, error: partErr } = await db
    .from("it_run_participants")
    .select("id, registration_id, first_name, last_name, participant_type, bib_number, qr_token, verification_status")
    .in("registration_id", rows.map(r => r.id))
    .order("created_at", { ascending: true })
    .returns<MyRegParticipantRow[]>();

  if (partErr) {
    console.error("[it-run/my-registrations] participants query failed:", partErr.code ?? "unknown");
    return NextResponse.json({ error: "Failed to load registrations" }, { status: 500, headers: NO_STORE });
  }

  const participants = parts ?? [];
  let collections: MyRegCollectionRow[] = [];
  if (participants.length > 0) {
    const { data: cols, error: colErr } = await db
      .from("it_run_bib_collections")
      .select("participant_id, collected_at")
      .in("participant_id", participants.map(p => p.id))
      .returns<MyRegCollectionRow[]>();

    if (colErr) {
      console.error("[it-run/my-registrations] BIB collection query failed:", colErr.code ?? "unknown");
      return NextResponse.json({ error: "Failed to load registrations" }, { status: 500, headers: NO_STORE });
    }
    collections = cols ?? [];
  }

  // Early bird names for the discount line. A failed lookup falls back to "Early bird" and does not hide the list.
  const offerIds = Array.from(new Set(rows.map(r => r.early_bird_offer_id).filter((id): id is string => !!id)));
  const offerNames = new Map<string, string>();
  if (offerIds.length > 0) {
    const { data: offers, error: offerErr } = await db
      .from("it_run_early_bird_offers")
      .select("id, name")
      .in("id", offerIds)
      .returns<Array<{ id: string; name: string }>>();
    if (offerErr) console.error("[it-run/my-registrations] offer name lookup failed:", offerErr.code ?? "unknown");
    for (const o of offers ?? []) offerNames.set(o.id, o.name);
  }

  return NextResponse.json(
    { registrations: buildMyRegistrations(rows, participants, collections, offerNames, changesOpen), claimable, participantChangesOpen: changesOpen },
    { headers: NO_STORE },
  );
}
