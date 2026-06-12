import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken, isAdminOrCoach } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");

  // Accept either the user's own token or an admin/coach credential
  const tokenEmail = verifyUserToken(req.headers.get("x-user-token") ?? "");
  const isAdmin    = await isAdminOrCoach(req);
  const isOwner    = !!tokenEmail && tokenEmail.toLowerCase() === (email ?? "").toLowerCase();

  if (!email || (!isOwner && !isAdmin))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();

  if (isOwner) {
    const { data: membership } = await db
      .from("memberships")
      .select("status, expires_at")
      .eq("user_email", email.toLowerCase())
      .maybeSingle();

    if (
      !membership ||
      membership.status !== "active" ||
      new Date(membership.expires_at) <= new Date()
    ) {
      return NextResponse.json({ error: "Active membership required" }, { status: 403 });
    }
  }

  const { data } = await db
    .from("training_plans")
    .select("id, title, coach_name, days, created_at")
    .eq("user_email", email.toLowerCase())
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({ plan: data ?? null });
}
