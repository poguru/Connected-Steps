import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

// GET â€” return all app_settings rows
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getSupabaseServer();
  const { data, error } = await db.from("app_settings").select("key, value, updated_at").order("key");
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ settings: data ?? [] });
}

// PUT â€” upsert a single setting: { key, value }
export async function PUT(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { key, value } = await req.json();
    if (!key || value === undefined) return NextResponse.json({ error: "key and value required" }, { status: 400 });
    const db = getSupabaseServer();
    const { error } = await db.from("app_settings").upsert(
      { key, value: String(value), updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
