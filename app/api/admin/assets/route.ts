import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

const BUCKET = "event-media";

// GET /api/admin/assets?folder=shared
// Lists files (or root-level folders when folder is omitted) in the event-media bucket.
export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const folder = req.nextUrl.searchParams.get("folder") ?? "";
  const db = getSupabaseServer();

  const { data, error } = await db.storage
    .from(BUCKET)
    .list(folder, { limit: 200, sortBy: { column: "created_at", order: "desc" } });

  if (error) return NextResponse.json({ error: "Storage error" }, { status: 500 });

  const items = (data ?? []).map(item => {
    const isFolder = !item.metadata;
    const path     = folder ? `${folder}/${item.name}` : item.name;
    const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(path);
    return {
      name:       item.name,
      path,
      is_folder:  isFolder,
      size:       item.metadata?.size ?? null,
      mime_type:  item.metadata?.mimetype ?? null,
      created_at: item.created_at ?? null,
      url:        isFolder ? null : urlData.publicUrl,
    };
  });

  return NextResponse.json({ items, folder });
}

// DELETE /api/admin/assets?path=shared/file.jpg
// Removes a single object from the event-media bucket.
export async function DELETE(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const path = req.nextUrl.searchParams.get("path")?.trim();
  if (!path) return NextResponse.json({ error: "path is required" }, { status: 400 });

  // Guard: prevent deleting entire folders by requiring a file extension
  if (!path.includes(".")) return NextResponse.json({ error: "Path must be a file, not a folder" }, { status: 400 });

  const db = getSupabaseServer();
  const { error } = await db.storage.from(BUCKET).remove([path]);
  if (error) return NextResponse.json({ error: "Delete failed" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
