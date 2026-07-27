import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, canAccessOrg, writeOrgAudit, actorEmail } from "@/lib/org-auth";
import { getSupabaseServer } from "@/lib/supabase-server";
import type { ApiKeyScope } from "@/lib/api-key";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getSupabaseServer();

  const { data, error } = await db
    .from("api_keys")
    .select("id, organization_id, name, description, key_prefix, key_type, scopes, expires_at, last_used_at, is_active, created_by, created_at")
    .eq("id", id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccessOrg(ctx, data.organization_id as string)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { name?: string; description?: string; is_active?: boolean; scopes?: ApiKeyScope[] };

  const db = getSupabaseServer();
  const { data: existing } = await db.from("api_keys").select("organization_id").eq("id", id).single();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccessOrg(ctx, existing.organization_id as string)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name        !== undefined) updates.name        = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.is_active   !== undefined) updates.is_active   = body.is_active;
  if (body.scopes      !== undefined) updates.scopes      = body.scopes;

  const { data, error } = await db.from("api_keys").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: "Update failed" }, { status: 500 });

  await writeOrgAudit({
    organization_id: existing.organization_id as string,
    action:          "api_key.updated",
    actor_email:     actorEmail(ctx),
    resource_type:   "api_key",
    resource_id:     id,
    detail:          { changes: Object.keys(updates) },
  });

  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getSupabaseServer();
  const { data: existing } = await db.from("api_keys").select("organization_id, name").eq("id", id).single();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccessOrg(ctx, existing.organization_id as string)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Revoke (soft-delete) — keep for audit trail
  await db.from("api_keys").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id);

  await writeOrgAudit({
    organization_id: existing.organization_id as string,
    action:          "api_key.revoked",
    actor_email:     actorEmail(ctx),
    resource_type:   "api_key",
    resource_id:     id,
    detail:          { name: existing.name },
  });

  return NextResponse.json({ ok: true });
}
