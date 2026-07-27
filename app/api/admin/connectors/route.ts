import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, canAccessOrg, actorEmail } from "@/lib/org-auth";
import { getSupabaseServer } from "@/lib/supabase-server";
import { CONNECTOR_REGISTRY, type ConnectorType } from "@/lib/connectors";

export async function GET(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url    = new URL(req.url);
  const org_id = url.searchParams.get("org_id") ?? ctx.org_id;
  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });
  if (!canAccessOrg(ctx, org_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getSupabaseServer();
  const { data: configs } = await db
    .from("connector_configs")
    .select("id, connector_type, name, is_active, last_sync_at, last_sync_status, last_sync_error, created_at, updated_at")
    .eq("organization_id", org_id);

  // Merge connector registry with DB configs (never return the raw config object — it may contain secrets)
  const configsByType = Object.fromEntries((configs ?? []).map(c => [(c as { connector_type: string }).connector_type, c]));

  const connectors = Object.values(CONNECTOR_REGISTRY).map(adapter => ({
    type:         adapter.type,
    display_name: adapter.displayName,
    description:  adapter.description,
    capabilities: adapter.capabilities,
    schema:       adapter.configSchema(),
    installed:    !!configsByType[adapter.type],
    config:       configsByType[adapter.type] ?? null,
  }));

  return NextResponse.json({ data: connectors });
}

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    org_id:         string;
    connector_type: string;
    name:           string;
    config:         Record<string, string>;
  };

  if (!body.org_id || !body.connector_type || !body.name || !body.config) {
    return NextResponse.json({ error: "org_id, connector_type, name, and config are required" }, { status: 400 });
  }
  if (!canAccessOrg(ctx, body.org_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const adapter = CONNECTOR_REGISTRY[body.connector_type as ConnectorType];
  if (!adapter) {
    return NextResponse.json({ error: `Unknown connector type: ${body.connector_type}` }, { status: 400 });
  }

  const validationError = await adapter.validateConfig(body.config);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("connector_configs")
    .upsert({
      organization_id: body.org_id,
      connector_type:  body.connector_type,
      name:            body.name,
      config:          body.config,
      is_active:       false,
      created_by:      actorEmail(ctx),
      updated_at:      new Date().toISOString(),
    }, { onConflict: "organization_id,connector_type" })
    .select("id, connector_type, name, is_active, created_at")
    .single();

  if (error) return NextResponse.json({ error: "Failed to save connector config" }, { status: 500 });

  return NextResponse.json({ data }, { status: 201 });
}
