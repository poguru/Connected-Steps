import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// POST /api/share  { type, id, platform }
export async function GET(req: NextRequest) {
  // Redirect-tracking: /api/share?type=post&id=xxx&platform=twitter&to=<url>
  const { searchParams } = req.nextUrl;
  const to = searchParams.get("to");
  const type     = searchParams.get("type") ?? "";
  const id       = searchParams.get("id") ?? "";
  const platform = searchParams.get("platform") ?? "";

  if (type && id && platform) {
    const db = getSupabaseServer();
    await db.from("share_events").insert({ content_type: type, content_id: id, platform, referrer: req.headers.get("referer") }).select().single();
  }

  if (to) return NextResponse.redirect(to);
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { type?: string; id?: string; platform?: string };
    const { type, id, platform } = body;

    if (!type || !id || !platform) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const db = getSupabaseServer();
    await db.from("share_events").insert({
      content_type: type,
      content_id:   id,
      platform,
      referrer:     req.headers.get("referer"),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
