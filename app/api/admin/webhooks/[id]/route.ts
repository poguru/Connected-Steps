import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, canAccessOrg, writeOrgAudit, actorEmail } from "@/lib/org-auth";
import { getSupabaseServer } from "@/lib/supabase-server";
import { WEBHOOK_EVENTS } from "@/lib/webhook-dispatch";

async function resolveWebhook(id: string, ctx: Awaited<ReturnType<typeof getOrgContext>>) {
  const db = getSupabaseServer();
  const { data } = await db
    .from("webhook_subscriptions")
    .select("id, organization_id, name, url, events, is_active, description, max_attempts, timeout_seconds, rate_limit_rpm, created_by, created_at, updated_at")
    .eq("id", id)
    .single();
  if (!data) return { webhook: null, error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (!canAccessOrg(ctx!, (data as { organization_id: string }).organization_id)) {
    return { webhook: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { webhook: data as typeof data & { organization_id: string }, error: null };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { webhook, error } = await resolveWebhook(id, ctx);
  if (error) return error;

  return NextResponse.json({ data: webhook });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { webhook, error } = await resolveWebhook(id, ctx);
  if (error) return error;

  const body = await req.json() as {
    name?:            string;
    url?:             string;
    events?:          string[];
    is_active?:       boolean;
    description?:     string;
    max_attempts?:    number;
    timeout_seconds?: number;
  };

  if (body.url) {
    try { new URL(body.url); } catch { return NextResponse.json({ error: "Invalid URL" }, { status: 400 }); }
  }
  if (body.events) {
    const validEvents = new Set(WEBHOOK_EVENTS as string[]);
    const badEvent = body.events.find(e => !validEvents.has(e));
    if (badEvent) return NextResponse.json({ error: `Unknown event type: ${badEvent}` }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name            !== undefined) updates.name            = body.name;
  if (body.url             !== undefined) updates.url             = body.url;
  if (body.events          !== undefined) updates.events          = body.events;
  if (body.is_active       !== undefined) updates.is_active       = body.is_active;
  if (body.description     !== undefined) updates.description     = body.description;
  if (body.max_attempts    !== undefined) updates.max_attempts    = body.max_attempts;
  if (body.timeout_seconds !== undefined) updates.timeout_seconds = body.timeout_seconds;

  const db = getSupabaseServer();
  const { data, error: updateError } = await db
    .from("webhook_subscriptions")
    .update(updates)
    .eq("id", id)
    .select("id, name, url, events, is_active, description, max_attempts, timeout_seconds, updated_at")
    .single();

  if (updateError) return NextResponse.json({ error: "Update failed" }, { status: 500 });

  await writeOrgAudit({
    organization_id: webhook!.organization_id,
    action:          "webhook.updated",
    actor_email:     actorEmail(ctx),
    resource_type:   "webhook_subscription",
    resource_id:     id,
    detail:          { changes: Object.keys(updates).filter(k => k !== "updated_at") },
  });

  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { webhook, error } = await resolveWebhook(id, ctx);
  if (error) return error;

  const db = getSupabaseServer();
  await db.from("webhook_subscriptions").delete().eq("id", id);

  await writeOrgAudit({
    organization_id: webhook!.organization_id,
    action:          "webhook.deleted",
    actor_email:     actorEmail(ctx),
    resource_type:   "webhook_subscription",
    resource_id:     id,
    detail:          { name: (webhook as { name: string }).name },
  });

  return NextResponse.json({ ok: true });
}
