import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const BUCKET   = "it-run-company-ids";
const ALLOWED  = ["image/jpeg","image/png","image/webp","application/pdf"];

// POST /api/it-run/upload/company-id
// Accepts a multipart/form-data body with a 'file' field.
// Stores in Supabase Storage and returns a public URL.
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file     = formData.get("file") as File | null;

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: "Only JPG, PNG, WEBP or PDF allowed" }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 400 });

    const db = getSupabaseServer();
    const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1];
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const bytes  = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const { data: upload, error: uploadErr } = await db.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: false });

    if (uploadErr) {
      console.error("[it-run/upload] storage error:", uploadErr.message);
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    const { data: { publicUrl } } = db.storage.from(BUCKET).getPublicUrl(upload.path);

    return NextResponse.json({ url: publicUrl });
  } catch (e: unknown) {
    console.error("[it-run/upload] error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
