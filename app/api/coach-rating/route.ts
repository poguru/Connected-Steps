import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// GET — avg rating per coach (public)
export async function GET() {
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("coach_ratings")
    .select("coach_name, rating");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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

// POST — submit or update a rating (one per user per coach)
export async function POST(req: NextRequest) {
  try {
    const { user_email, coach_name, rating, feedback } = await req.json();
    if (!user_email || !coach_name || !rating)
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    if (rating < 1 || rating > 5)
      return NextResponse.json({ error: "Rating must be 1–5" }, { status: 400 });

    const db = getSupabaseServer();

    // Upsert — update if already rated this coach
    const { error } = await db.from("coach_ratings").upsert(
      { user_email, coach_name, rating, feedback: feedback?.trim() || null },
      { onConflict: "user_email,coach_name" }
    );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
