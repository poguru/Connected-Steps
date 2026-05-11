import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// GET /api/stories — fetch approved stories + avg rating
export async function GET() {
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("stories")
    .select("id, user_name, quote, achievement, rating, created_at")
    .eq("approved", true)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const stories = data ?? [];
  const rated   = stories.filter((s) => s.rating != null);
  const avg_rating = rated.length
    ? Math.round((rated.reduce((sum, s) => sum + s.rating, 0) / rated.length) * 10) / 10
    : null;

  return NextResponse.json({ stories, avg_rating });
}

// POST /api/stories — submit a story with optional rating
export async function POST(req: NextRequest) {
  try {
    const { user_email, user_name, quote, achievement, rating } = await req.json();
    if (!user_email || !user_name || !quote?.trim() || !achievement?.trim())
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    if (quote.length > 1000)
      return NextResponse.json({ error: "Story must be under 1000 characters" }, { status: 400 });
    if (rating != null && (rating < 1 || rating > 5))
      return NextResponse.json({ error: "Rating must be 1–5" }, { status: 400 });

    const db = getSupabaseServer();

    const { data: existing } = await db
      .from("stories")
      .select("id")
      .eq("user_email", user_email)
      .eq("approved", false)
      .single();
    if (existing) return NextResponse.json({ error: "You already have a story pending review" }, { status: 409 });

    await db.from("stories").insert({
      user_email,
      user_name,
      quote: quote.trim(),
      achievement: achievement.trim(),
      rating: rating ?? null,
      approved: false,
    });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
