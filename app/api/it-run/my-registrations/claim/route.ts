import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken, USER_SESSION_COOKIE } from "@/lib/admin-auth";
import { claimEmailVariants } from "@/lib/it-run-my-registrations";

// POST /api/it-run/my-registrations/claim
// Links IT Run registrations that were made with the signed-in account's email and are not on any account yet.
//
// Safety:
//  - The account is the session identity only. The body is ignored.
//  - Only registrations whose lead email matches the session email are eligible.
//  - Only registrations with no linked account are updated (linked_user_email IS NULL). An existing link is
//    never overwritten or moved, so this cannot take another account's registration.
//  - The check and the update are one statement, so two concurrent claims cannot both link the same row.
//  - The signed-in account's email is already verified by the login that issued the session.

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(req: NextRequest) {
  const userEmail = verifyUserToken(req.cookies.get(USER_SESSION_COOKIE)?.value ?? "");
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("it_run_registrations")
    .update({ linked_user_email: userEmail })
    .in("lead_email", claimEmailVariants(userEmail))
    .is("linked_user_email", null)
    .select("id, event_id")
    .returns<Array<{ id: string; event_id: string }>>();

  if (error) {
    console.error("[it-run/my-registrations/claim] update failed:", error.code ?? "unknown");
    return NextResponse.json({ error: "We couldn't link your registrations. Please try again." }, { status: 500, headers: NO_STORE });
  }

  const claimed = data ?? [];
  if (claimed.length > 0) {
    await db.from("it_run_audit_logs").insert(claimed.map(r => ({
      event_id: r.event_id,
      actor_email: userEmail,
      actor_role: "participant",
      action: "registration_claimed",
      entity_type: "registration",
      entity_id: r.id,
      detail: { method: "lead_email_match_on_signed_in_account" },
    }))).then(() => {}, () => {});
  }

  return NextResponse.json({ ok: true, linked: claimed.length }, { headers: NO_STORE });
}
