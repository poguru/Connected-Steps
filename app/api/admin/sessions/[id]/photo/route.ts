import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const formData = await req.formData();
  const file = formData.get("photo") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });

  const ext      = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const fileName = `${id}/group.${ext}`;
  const buffer   = Buffer.from(await file.arrayBuffer());

  const db = getSupabaseServer();

  const { error: upErr } = await db.storage
    .from("session-photos")
    .upload(fileName, buffer, { contentType: file.type, upsert: true });

  if (upErr) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const { data: urlData } = db.storage.from("session-photos").getPublicUrl(fileName);
  const cover_image_url = urlData.publicUrl;

  // Save to cover_image_url (card cover) — separate from photo_url (gallery photos)
  const { error: dbErr } = await db.from("sessions").update({ cover_image_url }).eq("id", id);
  if (dbErr) return NextResponse.json({ error: "Database error" }, { status: 500 });

  return NextResponse.json({ success: true, photo_url: cover_image_url, cover_image_url });
}
