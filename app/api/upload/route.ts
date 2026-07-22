import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// POST /api/upload
// FormData: file (File), bucket (string)
// Returns: { path } — storage path within the bucket (caller stores this, not a public URL)

const ALLOWED_BUCKETS = ["bug-screenshots"];
const ALLOWED_TYPES  = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  try {
    const form   = await req.formData();
    const file   = form.get("file")   as File   | null;
    const bucket = form.get("bucket") as string | null;

    if (!file)   return NextResponse.json({ error: "No file" },            { status: 400 });
    if (!bucket) return NextResponse.json({ error: "No bucket" },          { status: 400 });
    if (!ALLOWED_BUCKETS.includes(bucket)) return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
    if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: "Only PNG, JPG, JPEG, WEBP accepted" }, { status: 415 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 413 });

    const ext    = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path   = `${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const db     = getSupabaseServer();

    const { error } = await db.storage
      .from(bucket)
      .upload(path, buffer, { contentType: file.type, upsert: false });

    if (error) {
      console.error("[upload] storage error:", error.message);
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    return NextResponse.json({ path });
  } catch (err) {
    console.error("[upload] unexpected:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
