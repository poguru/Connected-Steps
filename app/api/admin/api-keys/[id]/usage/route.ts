import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, canAccessOrg } from "@/lib/org-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getSupabaseServer();

  const { data: key } = await db.from("api_keys").select("organization_id").eq("id", id).single();
  if (!key) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccessOrg(ctx, key.organization_id as string)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Aggregate from the view
  const { data: stats } = await db
    .from("api_usage_stats")
    .select("month_bucket, request_count, avg_latency_ms, error_count, server_error_count")
    .eq("api_key_id", id)
    .order("month_bucket", { ascending: false })
    .limit(12);

  // Recent individual log entries
  const { data: recent } = await db
    .from("api_usage_log")
    .select("endpoint, method, status_code, latency_ms, created_at")
    .eq("api_key_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ data: { monthly_stats: stats ?? [], recent: recent ?? [] } });
}
