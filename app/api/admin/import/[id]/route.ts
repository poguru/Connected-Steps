import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, canAccessOrg } from "@/lib/org-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getSupabaseServer();

  const { data, error } = await db
    .from("import_jobs")
    .select("id, organization_id, entity_type, status, file_name, total_rows, valid_rows, error_rows, created_rows, validation_report, error_message, created_by, event_id, committed_at, created_at, updated_at")
    .eq("id", id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccessOrg(ctx, (data as { organization_id: string }).organization_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ data });
}
