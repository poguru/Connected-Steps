import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// GET /api/events/by-slug?slug=gandipet-cycling-ride
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") ?? "";
  if (!slug) return NextResponse.json({ event: null }, { status: 200 });

  const db = getSupabaseServer();
  const { data } = await db
    .from("events")
    .select("*")
    .eq("share_slug", slug)
    .eq("status", "published")
    .single();

  if (!data) return NextResponse.json({ event: null }, { status: 404 });

  // Increment view count (fire-and-forget)
  db.from("events").update({ view_count: (data.view_count ?? 0) + 1 }).eq("share_slug", slug).then(() => {});

  return NextResponse.json({ event: data });
}

// POST /api/events/by-slug?slug=... — increment share count
export async function POST(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") ?? "";
  if (!slug) return NextResponse.json({ ok: false });

  const db = getSupabaseServer();
  const { data } = await db.from("events").select("share_count").eq("share_slug", slug).single();
  if (data) {
    await db.from("events").update({ share_count: (data.share_count ?? 0) + 1 }).eq("share_slug", slug);
  }
  return NextResponse.json({ ok: true });
}
