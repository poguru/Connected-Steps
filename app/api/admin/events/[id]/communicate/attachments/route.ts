import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg":      "jpg",
  "image/jpg":       "jpg",
  "image/png":       "png",
  "image/webp":      "webp",
  "image/svg+xml":   "svg",
  "application/pdf": "pdf",
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;  // 5 MB per file

// POST — upload one attachment file, return metadata
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const ext = ALLOWED_TYPES[file.type];
  if (!ext)
    return NextResponse.json({
      error: `Unsupported type "${file.type}". Allowed: PNG, JPG, WEBP, SVG, PDF`,
    }, { status: 400 });

  if (file.size > MAX_FILE_BYTES)
    return NextResponse.json({
      error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB. Maximum is 5 MB.`,
    }, { status: 400 });

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const path     = `${id}/${Date.now()}-${safeName}`;
  const buffer   = Buffer.from(await file.arrayBuffer());

  const db = getSupabaseServer();
  const { error: uploadErr } = await db.storage
    .from("email-attachments")
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (uploadErr) {
    console.error("[comm-attachments] upload error:", uploadErr.message);
    return NextResponse.json({ error: "Upload failed: " + uploadErr.message }, { status: 500 });
  }

  return NextResponse.json({
    attachment: { name: file.name, mime_type: file.type, size: file.size, path },
  });
}

// DELETE — remove an uploaded attachment (path in query string)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await params;

  const path = new URL(req.url).searchParams.get("path");
  if (!path) return NextResponse.json({ error: "path is required" }, { status: 400 });

  const db = getSupabaseServer();
  const { error } = await db.storage.from("email-attachments").remove([path]);
  if (error) {
    console.error("[comm-attachments] delete error:", error.message);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
