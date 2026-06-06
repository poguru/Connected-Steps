import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// POST /api/push-token
// Body: { user_email, token, platform? }
export async function POST(req: NextRequest) {
  try {
    const { user_email, token, platform } = await req.json();
    if (!user_email || !token) {
      return NextResponse.json({ error: "user_email and token required" }, { status: 400 });
    }

    const db = getSupabaseServer();
    const { error } = await db
      .from("push_tokens")
      .upsert({ user_email, token, platform }, { onConflict: "token" });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
