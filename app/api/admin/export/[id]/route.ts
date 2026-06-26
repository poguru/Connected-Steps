import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET /api/admin/export/[id]
// Returns the export status.  When status="ready", also returns a signed
// download URL valid for 1 hour.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db      = getSupabaseServer();

  const { data, error } = await db
    .from("admin_exports")
    .select("id, dataset, format, status, row_count, file_path, error, created_at, completed_at")
    .eq("id", id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Export not found" }, { status: 404 });

  let downloadUrl: string | null = null;

  if (data.status === "ready" && data.file_path) {
    const { data: signed } = await db.storage
      .from("admin-exports")
      .createSignedUrl(data.file_path, 3600); // 1-hour expiry

    downloadUrl = signed?.signedUrl ?? null;
  }

  return NextResponse.json({ ...data, downloadUrl });
}

// DELETE /api/admin/export/[id]
// Removes the export record and its file from storage (cleanup).

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db      = getSupabaseServer();

  const { data } = await db
    .from("admin_exports")
    .select("file_path")
    .eq("id", id)
    .single();

  if (data?.file_path) {
    await db.storage.from("admin-exports").remove([data.file_path]);
  }

  await db.from("admin_exports").delete().eq("id", id);

  return NextResponse.json({ ok: true });
}
