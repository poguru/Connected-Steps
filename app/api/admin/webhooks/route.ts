import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getOrgContext, canAccessOrg, writeOrgAudit, actorEmail } from "@/lib/org-auth";
import { getSupabaseServer } from "@/lib/supabase-server";
import { WEBHOOK_EVENTS } from "@/lib/webhook-dispatch";

export async function GET(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url    = new URL(req.url);
  const org_id = url.searchParams.get("org_id") ?? ctx.org_id;
  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });
  if (!canAccessOrg(ctx, org_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("webhook_subscriptions")
    .select("id, name, url, events, is_active, description, max_attempts, timeout_seconds, rate_limit_rpm, created_by, created_at, updated_at")
    .eq("organization_id", org_id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Failed to fetch webhooks" }, { status: 500 });

  // Never return signing_secret in list — only on create
  return NextResponse.json({ data: data ?? [], available_events: WEBHOOK_EVENTS });
}

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    org_id:         string;
    name:           string;
    url:            string;
    events:         string[];
    description?:   string;
    max_attempts?:  number;
    timeout_seconds?: number;
  };

  if (!body.org_id || !body.name || !body.url || !body.events?.length) {
    return NextResponse.json({ error: "org_id, name, url, and events are required" }, { status: 400 });
  }
  if (!canAccessOrg(ctx, body.org_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Validate URL
  try { new URL(body.url); } catch { return NextResponse.json({ error: "Invalid URL" }, { status: 400 }); }

  // Validate event names
  const validEvents = new Set(WEBHOOK_EVENTS as string[]);
  const badEvent    = body.events.find(e => !validEvents.has(e));
  if (badEvent) return NextResponse.json({ error: `Unknown event type: ${badEvent}. Available: ${WEBHOOK_EVENTS.join(", ")}` }, { status: 400 });

  // Generate signing secret
  const signingSecret = crypto.randomBytes(32).toString("hex");

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("webhook_subscriptions")
    .insert({
      organization_id: body.org_id,
      name:            body.name,
      url:             body.url,
      events:          body.events,
      description:     body.description ?? null,
      signing_secret:  signingSecret,
      max_attempts:    body.max_attempts    ?? 5,
      timeout_seconds: body.timeout_seconds ?? 30,
      created_by:      actorEmail(ctx),
    })
    .select("id, name, url, events, is_active, max_attempts, timeout_seconds, created_at")
    .single();

  if (error) return NextResponse.json({ error: "Failed to create webhook" }, { status: 500 });

  await writeOrgAudit({
    organization_id: body.org_id,
    action:          "webhook.created",
    actor_email:     actorEmail(ctx),
    resource_type:   "webhook_subscription",
    resource_id:     (data as { id: string }).id,
    detail:          { name: body.name, url: body.url, events: body.events },
  });

  return NextResponse.json({
    data: { ...data, signing_secret: signingSecret },
    warning: "Store the signing_secret securely — it will not be shown again. Use it to verify X-CS-Signature headers on incoming webhook deliveries.",
  }, { status: 201 });
}
