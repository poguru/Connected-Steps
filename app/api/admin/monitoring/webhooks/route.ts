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

  // Per-subscription health
  const { data: subscriptions } = await db
    .from("webhook_subscriptions")
    .select("id, name, url, is_active, events")
    .eq("organization_id", org_id);

  if (!subscriptions?.length) {
    return NextResponse.json({ data: { subscriptions: [], summary: { total: 0, active: 0 } } });
  }

  const subIds = subscriptions.map(s => (s as { id: string }).id);

  // Delivery stats per subscription (last 7 days)
  const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: deliveries } = await db
    .from("webhook_delivery_log")
    .select("subscription_id, status, http_status, created_at")
    .in("subscription_id", subIds)
    .gte("created_at", since7d);

  // Aggregate per subscription
  const statsMap: Record<string, { total: number; success: number; failed: number; pending: number; last_delivery: string | null }> = {};
  for (const sub of subscriptions) {
    const id = (sub as { id: string }).id;
    statsMap[id] = { total: 0, success: 0, failed: 0, pending: 0, last_delivery: null };
  }
  for (const d of (deliveries ?? [])) {
    const row = d as { subscription_id: string; status: string; created_at: string };
    const s   = statsMap[row.subscription_id];
    if (!s) continue;
    s.total++;
    if (row.status === "success")  s.success++;
    else if (row.status === "failed")  s.failed++;
    else if (row.status === "pending") s.pending++;
    if (!s.last_delivery || row.created_at > s.last_delivery) s.last_delivery = row.created_at;
  }

  const enriched = subscriptions.map(sub => {
    const id    = (sub as { id: string }).id;
    const stats = statsMap[id];
    return {
      ...sub,
      last_7_days: stats,
      success_rate: stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : null,
    };
  });

  const total  = subscriptions.length;
  const active = subscriptions.filter(s => (s as { is_active: boolean }).is_active).length;
  const allDeliveries = deliveries?.length ?? 0;
  const failures      = (deliveries ?? []).filter(d => (d as { status: string }).status === "failed").length;

  return NextResponse.json({
    data: {
      subscriptions: enriched,
      summary: {
        total,
        active,
        deliveries_last_7d: allDeliveries,
        failures_last_7d:   failures,
        success_rate:       allDeliveries > 0 ? Math.round(((allDeliveries - failures) / allDeliveries) * 100) : null,
      },
    },
  });
}
