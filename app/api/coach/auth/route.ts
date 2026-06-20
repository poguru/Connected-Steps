import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getCoachEmailFromCookie, COOKIE_NAME } from "@/lib/admin-auth";

// GET /api/coach/auth — verify cs_coach_session, return coach profile
export async function GET(req: NextRequest) {
  const email = getCoachEmailFromCookie(req);
  if (!email) return NextResponse.json({ ok: false }, { status: 401 });

  const db = getSupabaseServer();
  const { data: coach } = await db
    .from("coaches")
    .select("id, name, email, specialization, avatar_url, is_active, is_admin")
    .eq("email", email)
    .eq("is_active", true)
    .single();

  if (!coach) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, coach });
}

// DELETE /api/coach/auth — logout (clear cs_coach_session)
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_NAME);
  return res;
}
