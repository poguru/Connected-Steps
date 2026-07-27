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

  // Fetch active API keys for the org
  const { data: keys } = await db
    .from("api_keys")
    .select("id, name, key_prefix, scopes, is_active, last_used_at")
    .eq("organization_id", org_id)
    .eq("is_active", true);

  if (!keys?.length) {
    return NextResponse.json({ data: { keys: [], summary: { active_keys: 0 } } });
  }

  // Per-key request counts in the last minute and last hour (from usage log)
  const now        = Date.now();
  const since1min  = new Date(now -         60_000).toISOString();
  const since1hour = new Date(now -   3_600_000).toISOString();

  const keyIds = keys.map(k => (k as { id: string }).id);

  const { data: recent } = await db
    .from("api_usage_log")
    .select("api_key_id, created_at, status_code")
    .in("api_key_id", keyIds)
    .gte("created_at", since1hour)
    .order("created_at", { ascending: false });

  // Aggregate
  const perKey: Record<string, { rpm: number; rph: number; rate_limit_rpm: number; at_limit: boolean }> = {};
  for (const key of keys) {
    const id = (key as { id: string }).id;
    perKey[id] = { rpm: 0, rph: 0, rate_limit_rpm: 60, at_limit: false }; // default limit 60 RPM
  }

  for (const row of (recent ?? [])) {
    const r = row as { api_key_id: string; created_at: string };
    if (!perKey[r.api_key_id]) continue;
    perKey[r.api_key_id].rph++;
    if (r.created_at >= since1min) perKey[r.api_key_id].rpm++;
  }

  for (const stats of Object.values(perKey)) {
    stats.at_limit = stats.rpm >= stats.rate_limit_rpm;
  }

  const enrichedKeys = keys.map(key => {
    const id = (key as { id: string }).id;
    return { ...key, rate_limit_stats: perKey[id] };
  });

  const atLimitCount = Object.values(perKey).filter(s => s.at_limit).length;

  return NextResponse.json({
    data: {
      keys: enrichedKeys,
      summary: {
        active_keys:   keys.length,
        at_limit_now:  atLimitCount,
        total_rpm:     Object.values(perKey).reduce((a, s) => a + s.rpm, 0),
        total_rph:     Object.values(perKey).reduce((a, s) => a + s.rph, 0),
      },
    },
  });
}
