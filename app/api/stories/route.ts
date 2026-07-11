import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";

// GET /api/stories â€” fetch approved stories + avg rating
export async function GET() {
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("stories")
    .select("id, user_name, quote, achievement, rating, created_at")
    .eq("approved", true)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const stories = data ?? [];
  const rated   = stories.filter((s) => s.rating != null);
  const avg_rating = rated.length
    ? Math.round((rated.reduce((sum, s) => sum + s.rating, 0) / rated.length) * 10) / 10
    : null;

  return NextResponse.json({ stories, avg_rating });
}

// POST /api/stories â€” submit a story with optional rating
export async function POST(req: NextRequest) {
  try {
    const user_email = verifyUserToken(req.headers.get("x-user-token") ?? "");
    if (!user_email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { user_name, quote, achievement, rating } = await req.json();
    if (!user_name || !quote?.trim() || !achievement?.trim())
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    if (quote.length > 1000)
      return NextResponse.json({ error: "Story must be under 1000 characters" }, { status: 400 });
    if (rating != null && (rating < 1 || rating > 5))
      return NextResponse.json({ error: "Rating must be 1â€“5" }, { status: 400 });

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
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
