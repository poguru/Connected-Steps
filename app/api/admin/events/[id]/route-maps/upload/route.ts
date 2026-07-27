import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

const ALLOWED: Record<string, string> = {
  "image/jpeg":       "image",
  "image/jpg":        "image",
  "image/png":        "image",
  "image/webp":       "image",
  "image/svg+xml":    "image",
  "application/pdf":  "pdf",
  // GPX files are XML — browsers may send either of these MIME types
  "application/gpx+xml":  "gpx",
  "text/xml":              "gpx",
  "application/xml":       "gpx",
};

const MAX_BYTES = 30 * 1024 * 1024; // 30 MB

// POST /api/admin/events/[id]/route-maps/upload
// Uploads a route map file (image, PDF, or GPX) to the event-media bucket.
// FormData: file (File), name (string), race_id? (string)
// Returns: { url, file_type, file_size, name, race_id }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: eventId } = await params;

  const form    = await req.formData();
  const file    = form.get("file") as File | null;
  const name    = (form.get("name") as string | null)?.trim() || null;
  const raceId  = (form.get("race_id") as string | null)?.trim() || null;

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const fileType = ALLOWED[file.type];
  if (!fileType) {
    return NextResponse.json(
      { error: "Unsupported file type. Use JPEG, PNG, WEBP, SVG, PDF, or GPX." },
      { status: 415 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File is too large (30 MB maximum)." }, { status: 413 });
  }

  const ext    = file.name.split(".").pop()?.toLowerCase() ?? fileType;
  const path   = `${eventId}/route-map-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const db = getSupabaseServer();
  const { error: upErr } = await db.storage
    .from("event-media")
    .upload(path, buffer, { contentType: file.type, upsert: true });

  if (upErr) {
    console.error("[route-map-upload] storage error:", upErr.message);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  const { data: urlData } = db.storage.from("event-media").getPublicUrl(path);

  return NextResponse.json({
    url:       urlData.publicUrl,
    file_type: fileType,
    file_size: file.size,
    name:      name ?? file.name,
    race_id:   raceId,
  });
}
