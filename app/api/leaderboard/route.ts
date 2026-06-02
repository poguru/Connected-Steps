import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const db = getSupabaseServer();

  const { data: entries, error } = await db
    .from("leaderboard")
    .select("id, user_email, user_name, location, goal, month_points, total_points, updated_at")
    .order("month_points", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!entries?.length) return NextResponse.json({ entries: [] });

  // Fetch photos for all users in one query
  const emails = entries.map((e) => e.user_email);
  const { data: users } = await db
    .from("users")
    .select("email, photo")
    .in("email", emails);

  const photoMap: Record<string, string | null> = {};
  for (const u of users ?? []) {
    photoMap[u.email] = u.photo ?? null;
  }

  const enriched = entries.map((e) => ({
    ...e,
    photo: photoMap[e.user_email] ?? null,
  }));

  return NextResponse.json({ entries: enriched });
}
