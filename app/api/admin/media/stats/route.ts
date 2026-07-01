import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// ── GET /api/admin/media/stats ────────────────────────────────────────────────
// Returns current storage statistics and media_settings for the admin panel.
export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getSupabaseServer();

  // Fetch aggregate stats (may fail gracefully if session_media doesn't exist yet)
  let stats: Record<string, unknown> = {
    total_items:    0,
    total_images:   0,
    total_videos:   0,
    active_videos:  0,
    deleted_videos: 0,
    total_bytes:    null,
    video_bytes:    null,
    next_expiry_at: null,
  };

  try {
    const { data } = await db.from("media_storage_stats").select("*").single();
    if (data) stats = data as Record<string, unknown>;
  } catch { /* view may not exist if migration hasn't run yet */ }

  // Fetch settings
  let settings: Record<string, string> = {
    video_retention_days: "30",
    cleanup_enabled:      "true",
    last_cleanup_at:      "",
    last_cleanup_deleted: "0",
  };

  try {
    const { data: rows } = await db
      .from("media_settings")
      .select("key, value");
    for (const row of rows ?? []) settings[row.key] = row.value;
  } catch { /* media_settings may not exist yet */ }

  // Next scheduled cleanup (estimate: oldest unexpired video + retention days)
  let nextCleanupEst: string | null = null;
  if (stats.next_expiry_at) nextCleanupEst = stats.next_expiry_at as string;

  return NextResponse.json({ stats, settings, nextCleanupEst });
}

// ── PATCH /api/admin/media/stats ─────────────────────────────────────────────
// Update media_settings (admin only).
// Body: { key: string, value: string }
export async function PATCH(req: NextRequest) {
  if (!await isAdminOrCoach(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as { key?: string; value?: string };

  const ALLOWED_KEYS = ["video_retention_days", "cleanup_enabled"];
  if (!body.key || !ALLOWED_KEYS.includes(body.key)) {
    return NextResponse.json({ error: `key must be one of: ${ALLOWED_KEYS.join(", ")}` }, { status: 400 });
  }
  if (body.value === undefined || body.value === null) {
    return NextResponse.json({ error: "value is required" }, { status: 400 });
  }

  const db = getSupabaseServer();
  const { error } = await db
    .from("media_settings")
    .upsert({ key: body.key, value: String(body.value), updated_at: new Date().toISOString() });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, key: body.key, value: body.value });
}
