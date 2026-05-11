import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ membership: null });

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
