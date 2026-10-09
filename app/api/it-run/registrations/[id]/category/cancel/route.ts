import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken, USER_SESSION_COOKIE } from "@/lib/admin-auth";

// POST /api/it-run/registrations/[id]/category/cancel
// The participant closed checkout without paying. Releases the held seat. Never touches a paid change.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const email = verifyUserToken(req.cookies.get(USER_SESSION_COOKIE)?.value ?? "");
  if (!email) return NextResponse.json({ error: "Please sign in.", code: "AUTH_REQUIRED" }, { status: 401 });

  const db = getSupabaseServer();
  const { data: reg } = await db
    .from("it_run_registrations")
    .select("id, participant_count, linked_user_email")
    .eq("id", id)
    .maybeSingle<{ id: string; participant_count: number; linked_user_email: string | null }>();
  if (!reg || !reg.linked_user_email || reg.linked_user_email.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json({ error: "We couldn't find this registration.", code: "NOT_FOUND" }, { status: 404 });
  }

  const { data: pending } = await db
    .from("it_run_category_changes")
    .select("id, to_category_id")
    .eq("registration_id", reg.id)
    .eq("status", "pending")
    .maybeSingle<{ id: string; to_category_id: string }>();
  if (!pending) return NextResponse.json({ ok: true, cancelled: false });

  const { data: cancelled } = await db
    .from("it_run_category_changes")
    .update({ status: "cancelled" })
    .eq("id", pending.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle<{ id: string }>();
  if (cancelled) {
    await db.rpc("itr_release_capacity", { p_category_id: pending.to_category_id, p_count: reg.participant_count });
  }
  return NextResponse.json({ ok: true, cancelled: !!cancelled });
}
