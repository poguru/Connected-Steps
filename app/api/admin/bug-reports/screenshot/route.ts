import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET /api/admin/bug-reports/screenshot?path=<storage-path>
// Returns a 60-minute signed URL for a private bug-screenshots file

export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const path = new URL(req.url).searchParams.get("path");
  if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });

  const db = getSupabaseServer();
  const { data, error } = await db.storage
    .from("bug-screenshots")
    .createSignedUrl(path, 3600); // 1 hour

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Could not generate signed URL" }, { status: 500 });
  }

  return NextResponse.json({ signedUrl: data.signedUrl });
}
