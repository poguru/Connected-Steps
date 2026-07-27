import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, canAccessOrg, writeOrgAudit, actorEmail } from "@/lib/org-auth";
import { getSupabaseServer } from "@/lib/supabase-server";
import { CONNECTOR_REGISTRY, type ConnectorType } from "@/lib/connectors";

async function resolveConfig(connectorType: string, orgId: string) {
  const adapter = CONNECTOR_REGISTRY[connectorType as ConnectorType];
  if (!adapter) return { adapter: null, config: null, notFound: true as const };

  const db = getSupabaseServer();
  const { data } = await db
    .from("connector_configs")
    .select("id, organization_id, connector_type, name, config, is_active, last_sync_at, last_sync_status, last_sync_error, created_at, updated_at")
    .eq("organization_id", orgId)
    .eq("connector_type", connectorType)
    .single();

  return { adapter, config: data, notFound: false as const };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url    = new URL(req.url);
  const org_id = url.searchParams.get("org_id") ?? ctx.org_id;
  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });
  if (!canAccessOrg(ctx, org_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { type } = await params;
  const { adapter, config, notFound } = await resolveConfig(type, org_id);
  if (notFound) return NextResponse.json({ error: `Unknown connector type: ${type}` }, { status: 404 });

  return NextResponse.json({
    data: {
      type:         adapter!.type,
      display_name: adapter!.displayName,
      description:  adapter!.description,
      capabilities: adapter!.capabilities,
      schema:       adapter!.configSchema(),
      installed:    !!config,
      config:       config ? { ...config, config: undefined } : null, // strip raw config values
    },
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    org_id:    string;
    name?:     string;
    config?:   Record<string, string>;
    is_active?: boolean;
  };

  if (!body.org_id) return NextResponse.json({ error: "org_id is required" }, { status: 400 });
  if (!canAccessOrg(ctx, body.org_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { type } = await params;
  const { adapter, notFound } = await resolveConfig(type, body.org_id);
  if (notFound) return NextResponse.json({ error: `Unknown connector type: ${type}` }, { status: 404 });

  if (body.config) {
    const validationError = await adapter!.validateConfig(body.config);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name      !== undefined) updates.name      = body.name;
  if (body.config    !== undefined) updates.config    = body.config;
  if (body.is_active !== undefined) updates.is_active = body.is_active;

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("connector_configs")
    .update(updates)
    .eq("organization_id", body.org_id)
    .eq("connector_type", type)
    .select("id, connector_type, name, is_active, updated_at")
    .single();

  if (error) return NextResponse.json({ error: "Update failed or connector not installed" }, { status: 500 });

  await writeOrgAudit({
    organization_id: body.org_id,
    action:          "connector.updated",
    actor_email:     actorEmail(ctx),
    resource_type:   "connector_config",
    resource_id:     (data as { id: string }).id,
    detail:          { connector_type: type, changes: Object.keys(updates).filter(k => k !== "updated_at") },
  });

  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url    = new URL(req.url);
  const org_id = url.searchParams.get("org_id") ?? ctx.org_id;
  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });
  if (!canAccessOrg(ctx, org_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { type } = await params;
  const db       = getSupabaseServer();

  const { data: existing } = await db
    .from("connector_configs")
    .select("id")
    .eq("organization_id", org_id)
    .eq("connector_type", type)
    .single();

  if (!existing) return NextResponse.json({ error: "Connector not installed" }, { status: 404 });

  await db.from("connector_configs").delete().eq("organization_id", org_id).eq("connector_type", type);

  await writeOrgAudit({
    organization_id: org_id,
    action:          "connector.removed",
    actor_email:     actorEmail(ctx),
    resource_type:   "connector_config",
    resource_id:     (existing as { id: string }).id,
    detail:          { connector_type: type },
  });

  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  // POST /:type is the "test connection" endpoint
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { org_id: string; config?: Record<string, string> };
  if (!body.org_id) return NextResponse.json({ error: "org_id is required" }, { status: 400 });
  if (!canAccessOrg(ctx, body.org_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { type } = await params;
  const { adapter, config, notFound } = await resolveConfig(type, body.org_id);
  if (notFound) return NextResponse.json({ error: `Unknown connector type: ${type}` }, { status: 404 });

  // Use provided config override for testing, or fall back to stored config
  const testConfig: Record<string, string> =
    body.config ?? (config ? (config as { config: Record<string, string> }).config : {});

  let success    = false;
  let error_msg: string | null = null;
  const start    = Date.now();

  try {
    await adapter!.testConnection(testConfig);
    success = true;
  } catch (e) {
    error_msg = e instanceof Error ? e.message : String(e);
  }

  const latency_ms = Date.now() - start;

  // Update last_sync_status on the stored config (if it exists)
  if (config) {
    await getSupabaseServer()
      .from("connector_configs")
      .update({
        last_sync_at:     new Date().toISOString(),
        last_sync_status: success ? "ok" : "error",
        last_sync_error:  error_msg,
        updated_at:       new Date().toISOString(),
      })
      .eq("organization_id", body.org_id)
      .eq("connector_type", type);
  }

  return NextResponse.json({ data: { success, latency_ms, error: error_msg } });
}
