import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, canAccessOrg, writeOrgAudit, actorEmail } from "@/lib/org-auth";
import { getSupabaseServer } from "@/lib/supabase-server";
import { enqueueJob } from "@/lib/job-queue";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { delivery_id } = await req.json() as { delivery_id: string };
  if (!delivery_id) return NextResponse.json({ error: "delivery_id is required" }, { status: 400 });

  const db = getSupabaseServer();

  // Verify the delivery belongs to this subscription and org
  const { data: delivery } = await db
    .from("webhook_delivery_log")
    .select("id, subscription_id, event_type, request_body, webhook_subscriptions!inner(organization_id)")
    .eq("id", delivery_id)
    .eq("subscription_id", id)
    .single();

  if (!delivery) return NextResponse.json({ error: "Delivery not found" }, { status: 404 });

  const orgId = ((delivery as unknown) as { webhook_subscriptions: { organization_id: string } }).webhook_subscriptions.organization_id;
  if (!canAccessOrg(ctx, orgId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Create a new delivery row as a replay
  const { data: newDelivery, error } = await db
    .from("webhook_delivery_log")
    .insert({
      subscription_id: id,
      event_type:      (delivery as { event_type: string }).event_type,
      status:          "pending",
      attempt_count:   0,
      request_body:    (delivery as { request_body: unknown }).request_body,
    })
    .select("id")
    .single();

  if (error || !newDelivery) return NextResponse.json({ error: "Failed to create replay delivery" }, { status: 500 });

  await enqueueJob("deliver_webhook", {
    delivery_id:     (newDelivery as { id: string }).id,
    subscription_id: id,
  }, {
    idempotencyKey: `wh:replay:${(newDelivery as { id: string }).id}`,
  });

  await writeOrgAudit({
    organization_id: orgId,
    action:          "webhook.delivery_replayed",
    actor_email:     actorEmail(ctx),
    resource_type:   "webhook_delivery_log",
    resource_id:     (newDelivery as { id: string }).id,
    detail:          { original_delivery_id: delivery_id, subscription_id: id },
  });

  return NextResponse.json({ data: { delivery_id: (newDelivery as { id: string }).id } }, { status: 202 });
}
