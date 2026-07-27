import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, canAccessOrg } from "@/lib/org-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getSupabaseServer();

  // Verify subscription belongs to org
  const { data: sub } = await db
    .from("webhook_subscriptions")
    .select("organization_id")
    .eq("id", id)
    .single();
  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccessOrg(ctx, (sub as { organization_id: string }).organization_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url          = new URL(req.url);
  const page         = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const per_page     = Math.min(100, Math.max(1, Number(url.searchParams.get("per_page") ?? 25)));
  const status       = url.searchParams.get("status");    // pending | success | failed
  const event_type   = url.searchParams.get("event_type");

  let query = db
    .from("webhook_delivery_log")
    .select("id, event_type, status, http_status, attempt_count, next_retry_at, request_body, response_body, error_message, created_at, delivered_at", { count: "exact" })
    .eq("subscription_id", id)
    .order("created_at", { ascending: false })
    .range((page - 1) * per_page, page * per_page - 1);

  if (status)     query = query.eq("status", status);
  if (event_type) query = query.eq("event_type", event_type);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: "Failed to fetch deliveries" }, { status: 500 });

  const total = count ?? 0;
  return NextResponse.json({
    data: data ?? [],
    meta: { total, page, per_page, pages: Math.ceil(total / per_page) },
  });
}
