import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// GET /api/stories — fetch approved stories
export async function GET() {
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("stories")
    .select("id, user_name, quote, achievement, created_at")
    .eq("approved", true)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ stories: data ?? [] });
}

// POST /api/stories — submit a story
export async function POST(req: NextRequest) {
  try {
    const { user_email, user_name, quote, achievement } = await req.json();
    if (!user_email || !user_name || !quote?.trim() || !achievement?.trim())
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    if (quote.length > 400)
      return NextResponse.json({ error: "Story must be under 400 characters" }, { status: 400 });

    const db = getSupabaseServer();

    // Prevent duplicate pending submissions
    const { data: existing } = await db
      .from("stories")
      .select("id")
      .eq("user_email", user_email)
      .eq("approved", false)
      .single();
    if (existing) return NextResponse.json({ error: "You already have a story pending review" }, { status: 409 });

    await db.from("stories").insert({ user_email, user_name, quote: quote.trim(), achievement: achievement.trim(), approved: false });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
