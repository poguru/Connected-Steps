import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const db = getSupabaseServer();
  const { data } = await db
    .from("leaderboard")
    .select("week_points, total_points")
    .eq("user_email", email.toLowerCase())
    .single();

  if (!data) return NextResponse.json({ week_points: 0, total_points: 0 });
  return NextResponse.json(data);
}
