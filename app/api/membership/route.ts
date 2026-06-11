import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken, isAdminOrCoach } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");

  const tokenEmail = verifyUserToken(req.headers.get("x-user-token") ?? "");
  const isAdmin    = await isAdminOrCoach(req);
  const isOwner    = !!tokenEmail && tokenEmail.toLowerCase() === (email ?? "").toLowerCase();

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data } = await db
    .from("memberships")
    .select("plan, status, amount_paid, started_at, expires_at")
    .eq("user_email", email.toLowerCase())
    .single();

  if (!data) return NextResponse.json({ membership: null });

  const isActive = data.status === "active" && new Date(data.expires_at) > new Date();
  return NextResponse.json({ membership: { ...data, isActive } });
}
