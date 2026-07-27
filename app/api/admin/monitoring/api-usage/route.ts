import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, canAccessOrg } from "@/lib/org-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url    = new URL(req.url);
  const org_id = url.searchParams.get("org_id") ?? ctx.org_id;
  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });
  if (!canAccessOrg(ctx, org_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getSupabaseServer();

  // Monthly aggregates per key
  const { data: monthly } = await db
    .from("api_usage_stats")
    .select("api_key_id, month_bucket, request_count, avg_latency_ms, error_count, server_error_count, api_keys!inner(name, key_prefix, is_active)")
    .eq("api_keys.organization_id", org_id)
    .order("month_bucket", { ascending: false })
    .limit(120); // 10 keys × 12 months

  // 24-hour snapshot from raw log
  const since24h = new Date(Date.now() - 86_400_000).toISOString();
  const { data: recent } = await db
    .from("api_usage_log")
    .select("endpoint, method, status_code, latency_ms, created_at, api_keys!inner(name)")
    .eq("api_keys.organization_id", org_id)
    .gte("created_at", since24h)
    .order("created_at", { ascending: false })
    .limit(200);

  // Endpoint breakdown (last 24h)
  const endpointMap: Record<string, { count: number; errors: number; avg_latency: number; latencies: number[] }> = {};
  for (const row of (recent ?? [])) {
    const r   = row as { endpoint: string; status_code: number; latency_ms: number };
    const key = `${r.endpoint}`;
    if (!endpointMap[key]) endpointMap[key] = { count: 0, errors: 0, avg_latency: 0, latencies: [] };
    endpointMap[key].count++;
    endpointMap[key].latencies.push(r.latency_ms ?? 0);
    if (r.status_code >= 400) endpointMap[key].errors++;
  }
  const endpoints = Object.entries(endpointMap).map(([endpoint, v]) => ({
    endpoint,
    count:       v.count,
    errors:      v.errors,
    avg_latency: Math.round(v.latencies.reduce((a, b) => a + b, 0) / v.latencies.length),
  })).sort((a, b) => b.count - a.count).slice(0, 20);

  return NextResponse.json({
    data: {
      monthly_by_key: monthly ?? [],
      last_24h: {
        total:     (recent ?? []).length,
        errors:    (recent ?? []).filter(r => (r as { status_code: number }).status_code >= 400).length,
        endpoints,
      },
    },
  });
}
