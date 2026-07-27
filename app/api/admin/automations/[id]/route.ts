import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, canAccessOrg, writeOrgAudit, actorEmail } from "@/lib/org-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

async function resolveRule(id: string, ctx: Awaited<ReturnType<typeof getOrgContext>>) {
  const db = getSupabaseServer();
  const { data } = await db
    .from("automation_rules")
    .select("id, organization_id, name, description, trigger_event, conditions, actions, is_active, created_by, created_at, updated_at")
    .eq("id", id)
    .single();
  if (!data) return { rule: null, error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (!canAccessOrg(ctx!, (data as { organization_id: string }).organization_id)) {
    return { rule: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { rule: data as typeof data & { organization_id: string }, error: null };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id }      = await params;
  const { rule, error } = await resolveRule(id, ctx);
  if (error) return error;
  return NextResponse.json({ data: rule });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id }          = await params;
  const { rule, error } = await resolveRule(id, ctx);
  if (error) return error;

  const body = await req.json() as {
    name?:        string;
    description?: string;
    conditions?:  unknown[];
    actions?:     unknown[];
    is_active?:   boolean;
  };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name        !== undefined) updates.name        = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.conditions  !== undefined) updates.conditions  = body.conditions;
  if (body.actions     !== undefined) updates.actions     = body.actions;
  if (body.is_active   !== undefined) updates.is_active   = body.is_active;

  const db = getSupabaseServer();
  const { data, error: updateErr } = await db
    .from("automation_rules")
    .update(updates)
    .eq("id", id)
    .select("id, name, trigger_event, conditions, actions, is_active, updated_at")
    .single();

  if (updateErr) return NextResponse.json({ error: "Update failed" }, { status: 500 });

  await writeOrgAudit({
    organization_id: rule!.organization_id,
    action:          "automation.updated",
    actor_email:     actorEmail(ctx),
    resource_type:   "automation_rule",
    resource_id:     id,
    detail:          { changes: Object.keys(updates).filter(k => k !== "updated_at") },
  });

  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id }          = await params;
  const { rule, error } = await resolveRule(id, ctx);
  if (error) return error;

  const db = getSupabaseServer();
  await db.from("automation_rules").delete().eq("id", id);

  await writeOrgAudit({
    organization_id: rule!.organization_id,
    action:          "automation.deleted",
    actor_email:     actorEmail(ctx),
    resource_type:   "automation_rule",
    resource_id:     id,
    detail:          { name: (rule as { name: string }).name },
  });

  return NextResponse.json({ ok: true });
}
