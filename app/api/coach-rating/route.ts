import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";

// GET â€” avg rating per coach (public)
export async function GET() {
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("coach_ratings")
    .select("coach_name, rating");

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // Group by coach
  const map: Record<string, number[]> = {};
  for (const row of data ?? []) {
    if (!map[row.coach_name]) map[row.coach_name] = [];
    map[row.coach_name].push(row.rating);
  }

  const ratings = Object.entries(map).map(([coach_name, vals]) => ({
    coach_name,
    avg:   Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
    count: vals.length,
  }));

  return NextResponse.json({ ratings });
}

// POST â€” submit or update a rating (one per user per coach)
export async function POST(req: NextRequest) {
  try {
    const user_email = verifyUserToken(req.headers.get("x-user-token") ?? "");
    if (!user_email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { coach_name, rating, feedback } = await req.json();
    if (!coach_name || !rating)
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    if (rating < 1 || rating > 5)
      return NextResponse.json({ error: "Rating must be 1â€“5" }, { status: 400 });

    const db = getSupabaseServer();

    // Upsert â€” update if already rated this coach
    const { error } = await db.from("coach_ratings").upsert(
      { user_email, coach_name, rating, feedback: feedback?.trim() || null },
      { onConflict: "user_email,coach_name" }
    );

    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
