import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() || "";

    const db = getSupabaseServer();

    let query = db
      .from("leaderboard")
      .select("user_email, user_name, location, goal, week_km, total_km, week_runs, total_runs")
      .order("total_km", { ascending: false })
      .limit(20);

    if (q) {
      query = query.or(`user_name.ilike.%${q}%,location.ilike.%${q}%`);
    }

    const { data, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ users: data || [] });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
