import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const db = getSupabaseServer();
  const { data } = await db
    .from("leaderboard")
    .select("month_points, total_points, points_month")
    .eq("user_email", email.toLowerCase())
    .single();

  if (!data) return NextResponse.json({ month_points: 0, total_points: 0 });

  const currentMonth = new Date().toISOString().slice(0, 7);
  const month_points = (data.points_month === currentMonth) ? (data.month_points ?? 0) : 0;

  return NextResponse.json({ month_points, total_points: data.total_points ?? 0 });
}
