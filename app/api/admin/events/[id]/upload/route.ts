import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { uploadBuffer } from "@/lib/storage";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/svg+xml"]);
const MAX_BYTES     = 10 * 1024 * 1024; // 10 MB

// POST /api/admin/events/[id]/upload
// Uploads a single image file to the event-media storage bucket.
// FormData fields:  file (File), purpose (poster|banner|gallery|sponsor-logo|partner-logo|organizer-logo|powered-by)
// Returns:          { url: string }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const form    = await req.formData();
  const file    = form.get("file") as File | null;
  const purpose = (form.get("purpose") as string | null) ?? "misc";

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type))
    return NextResponse.json({ error: "Unsupported file type. Use JPEG, PNG, WEBP, or SVG." }, { status: 415 });
  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: "File is too large (10 MB maximum)." }, { status: 413 });

  const ext      = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path     = `${id}/${purpose}-${Date.now()}.${ext}`;
  const buffer   = Buffer.from(await file.arrayBuffer());

  const db = getSupabaseServer();
  try {
    const { publicUrl } = await uploadBuffer(db, "event-media", path, buffer, file.type, true);
    return NextResponse.json({ url: publicUrl });
  } catch (err) {
    console.error("[event-upload] storage error:", (err as Error).message, "path:", path);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
