import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { uploadBuffer } from "@/lib/storage";

const BUCKET = "event-media";

const ALLOWED: Record<string, string> = {
  "image/jpeg":      "jpg",
  "image/jpg":       "jpg",
  "image/png":       "png",
  "image/webp":      "webp",
  "image/svg+xml":   "svg",
  "application/pdf": "pdf",
};

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

// POST /api/admin/assets/upload
// FormData: file (File), folder? (string, default "shared")
// Uploads to event-media/{folder}/{timestamp}-{originalname}
export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form   = await req.formData();
  const file   = form.get("file") as File | null;
  const folder = ((form.get("folder") as string | null) ?? "shared").trim().replace(/[^a-zA-Z0-9_-]/g, "_") || "shared";

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const ext = ALLOWED[file.type];
  if (!ext) return NextResponse.json({ error: "Unsupported type. Use JPEG, PNG, WEBP, SVG, or PDF." }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File exceeds 20 MB limit." }, { status: 413 });

  // Sanitize original filename for the path
  const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 60);
  const path     = `${folder}/${Date.now()}-${baseName}.${ext}`;
  const buffer   = Buffer.from(await file.arrayBuffer());

  const db = getSupabaseServer();
  let publicUrl: string;
  try {
    ({ publicUrl } = await uploadBuffer(db, BUCKET, path, buffer, file.type));
  } catch (err) {
    console.error("[assets-upload] storage error:", (err as Error).message);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok:       true,
    path,
    url:      publicUrl,
    name:     file.name,
    size:     file.size,
    mime_type: file.type,
  });
}
