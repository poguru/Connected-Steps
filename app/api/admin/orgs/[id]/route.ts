import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getOrgContext, canAccessOrg, canDo, writeOrgAudit, actorEmail } from "@/lib/org-auth";
import { getClientIp } from "@/lib/rate-limit";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessOrg(ctx, id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("organizations")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Attach member count
  const { count } = await db
    .from("organization_members")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", id)
    .eq("is_active", true);

  return NextResponse.json({ org: { ...data, member_count: count ?? 0 } });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessOrg(ctx, id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (ctx.type === "org_member" && ctx.role && !canDo(ctx.role, "settings:edit")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const body = await req.json();

  // Strip fields that org members can't touch
  const {
    id: _id, is_default: _def, created_at: _ca, subscription_id: _sub,
    plan: _plan, plan_status: _ps, plan_limits: _pl,
    ...safeFields
  } = body;

  // Only super admin can change billing fields
  const update: Record<string, unknown> = { ...safeFields };
  if (ctx.type === "super_admin") {
    if (_plan    !== undefined) update.plan         = _plan;
    if (_ps      !== undefined) update.plan_status  = _ps;
    if (_pl      !== undefined) update.plan_limits  = _pl;
    if (_sub     !== undefined) update.subscription_id = _sub;
  }

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("organizations")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  await writeOrgAudit({
    organization_id: id,
    action:          "org.updated",
    actor_email:     actorEmail(ctx),
    resource_type:   "organization",
    resource_id:     id,
    detail:          { fields: Object.keys(update) },
    ip:              getClientIp(req),
  });

  return NextResponse.json({ org: data });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.type !== "super_admin") {
    return NextResponse.json({ error: "Only platform admins can delete organizations" }, { status: 403 });
  }

  const db = getSupabaseServer();

  // Never delete the default org
  const { data: org } = await db.from("organizations").select("is_default").eq("id", id).single();
  if (org?.is_default) {
    return NextResponse.json({ error: "Cannot delete the default organization" }, { status: 400 });
  }

  const { error } = await db.from("organizations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
