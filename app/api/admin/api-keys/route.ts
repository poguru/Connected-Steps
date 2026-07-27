import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, canAccessOrg, writeOrgAudit, actorEmail } from "@/lib/org-auth";
import { createApiKey, ALL_SCOPES, READ_ONLY_SCOPES, type ApiKeyScope } from "@/lib/api-key";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url    = new URL(req.url);
  const org_id = url.searchParams.get("org_id") ?? ctx.org_id;
  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });
  if (!canAccessOrg(ctx, org_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("api_keys")
    .select("id, name, description, key_prefix, key_type, scopes, expires_at, last_used_at, is_active, created_by, created_at, updated_at")
    .eq("organization_id", org_id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Failed to fetch keys" }, { status: 500 });

  // Mask prefix to show only last 4 chars of prefix for display
  const masked = (data ?? []).map(k => ({
    ...k,
    key_preview: `cs_${k.key_type}_${"•".repeat(8)}${(k.key_prefix as string).slice(-4)}`,
  }));

  return NextResponse.json({ data: masked, available_scopes: ALL_SCOPES, readonly_scopes: READ_ONLY_SCOPES });
}

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    org_id:      string;
    name:        string;
    description?: string;
    key_type?:   "live" | "test";
    scopes:      ApiKeyScope[];
    expires_at?: string;
  };

  if (!body.org_id || !body.name || !body.scopes?.length) {
    return NextResponse.json({ error: "org_id, name, and scopes are required" }, { status: 400 });
  }
  if (!canAccessOrg(ctx, body.org_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Validate scopes
  const validScopes = new Set([...ALL_SCOPES, "*"]);
  const badScope = body.scopes.find(s => !validScopes.has(s));
  if (badScope) return NextResponse.json({ error: `Invalid scope: ${badScope}` }, { status: 400 });

  const result = await createApiKey({
    organization_id: body.org_id,
    name:            body.name,
    description:     body.description,
    key_type:        body.key_type ?? "live",
    scopes:          body.scopes,
    expires_at:      body.expires_at,
    created_by:      actorEmail(ctx),
  });

  if (!result) return NextResponse.json({ error: "Failed to create API key" }, { status: 500 });

  await writeOrgAudit({
    organization_id: body.org_id,
    action:          "api_key.created",
    actor_email:     actorEmail(ctx),
    resource_type:   "api_key",
    resource_id:     result.record.id,
    detail:          { name: body.name, scopes: body.scopes, key_type: body.key_type },
  });

  // Return raw key ONCE — never stored in DB
  return NextResponse.json({
    data: {
      ...result.record,
      raw_key: result.rawKey,
    },
    warning: "Store this API key securely. It will not be shown again.",
  }, { status: 201 });
}
