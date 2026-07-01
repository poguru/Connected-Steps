import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// ── POST /api/admin/media/cleanup ─────────────────────────────────────────────
// Deletes expired video files from Supabase Storage and soft-deletes their DB
// rows (preserving the thumbnail_url for historical gallery display).
//
// Also callable from the cron job at /api/cron/media-cleanup with the special
// CRON_SECRET header instead of admin auth.
//
// Returns:
//   { deleted: number, failed: number, skipped: number, log: string[] }
export async function POST(req: NextRequest) {
  // Accept either admin auth or the cron secret
  const cronSecret = req.headers.get("x-cron-secret");
  const isCron     = cronSecret && cronSecret === process.env.CRON_SECRET;

  if (!isCron && !await isAdminOrCoach(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db  = getSupabaseServer();
  const log: string[] = [];
  let deleted = 0, failed = 0, skipped = 0;

  // ── Check if cleanup is enabled ──────────────────────────────────────────
  const { data: setting } = await db
    .from("media_settings")
    .select("value")
    .eq("key", "cleanup_enabled")
    .single();

  if (setting?.value === "false") {
    return NextResponse.json({
      deleted: 0, failed: 0, skipped: 0,
      log: ["Cleanup is disabled in media_settings."],
    });
  }

  // ── Fetch expired videos ──────────────────────────────────────────────────
  const { data: expired, error: fetchErr } = await db
    .from("session_media")
    .select("id, session_id, url, thumbnail_url, expires_at, is_cover")
    .eq("media_type", "video")
    .is("deleted_at", null)
    .not("expires_at", "is", null)
    .lte("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: true })
    .limit(500);                        // process in batches of 500

  if (fetchErr) {
    log.push(`DB error fetching expired videos: ${fetchErr.message}`);
    return NextResponse.json({ deleted, failed, skipped, log }, { status: 500 });
  }

  if (!expired?.length) {
    log.push("No expired videos found.");
    return NextResponse.json({ deleted, failed, skipped, log });
  }

  log.push(`Found ${expired.length} expired video(s) to process.`);

  for (const item of expired) {
    try {
      // ── Delete from Supabase Storage ───────────────────────────────────
      const storagePath = extractStoragePath(item.url, "session-videos");

      if (storagePath) {
        const { error: storageErr } = await db.storage
          .from("session-videos")
          .remove([storagePath]);

        if (storageErr) {
          // Log but don't fail — the DB row still needs to be marked deleted
          log.push(`Storage delete failed for ${item.id}: ${storageErr.message}`);
        }
      } else {
        log.push(`Could not extract storage path for ${item.id} — skipping storage delete`);
        skipped++;
      }

      // ── Soft-delete the DB row (preserve thumbnail) ───────────────────
      // We keep the row so gallery queries can still show a thumbnail.
      // `deleted_from_storage = true` signals the video file is gone.
      const { error: dbErr } = await db
        .from("session_media")
        .update({
          deleted_at:           new Date().toISOString(),
          deleted_from_storage: true,
          // Clear the video URL but preserve thumbnail for historical display
          url: item.thumbnail_url ?? item.url,
        })
        .eq("id", item.id);

      if (dbErr) {
        log.push(`DB update failed for ${item.id}: ${dbErr.message}`);
        failed++;
      } else {
        log.push(`✓ Deleted video ${item.id} (session ${item.session_id})`);
        deleted++;
      }
    } catch (e: unknown) {
      log.push(`Unexpected error for ${item.id}: ${String(e)}`);
      failed++;
    }
  }

  // ── Update last-run metadata ──────────────────────────────────────────────
  await db
    .from("media_settings")
    .upsert([
      { key: "last_cleanup_at",      value: new Date().toISOString() },
      { key: "last_cleanup_deleted", value: String(deleted) },
    ]);

  log.push(`Done. deleted=${deleted} failed=${failed} skipped=${skipped}`);
  return NextResponse.json({ deleted, failed, skipped, log });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract the path segment inside the storage bucket from a public URL.
 * e.g. "https://…/storage/v1/object/public/session-videos/abc/1234.mp4"
 *      → "abc/1234.mp4"
 */
function extractStoragePath(url: string, bucket: string): string | null {
  try {
    const u = new URL(url);
    const marker = `/object/public/${bucket}/`;
    const idx    = u.pathname.indexOf(marker);
    if (idx < 0) return null;
    return decodeURIComponent(u.pathname.slice(idx + marker.length));
  } catch {
    return null;
  }
}
