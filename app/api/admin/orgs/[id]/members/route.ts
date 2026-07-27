import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import {
  getOrgContext, canAccessOrg, canDo, ORG_ROLES, getLimitFor,
  writeOrgAudit, actorEmail, type OrgRole,
} from "@/lib/org-auth";
import { getClientIp } from "@/lib/rate-limit";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessOrg(ctx, id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (ctx.type === "org_member" && ctx.role && !canDo(ctx.role, "members:read")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("organization_members")
    .select("id, user_email, role, is_active, invited_by, created_at, permissions")
    .eq("organization_id", id)
    .order("created_at");

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ members: data ?? [] });
}

/** Invite / add a member to the organization. */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessOrg(ctx, id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (ctx.type === "org_member" && ctx.role && !canDo(ctx.role, "members:invite")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { user_email, role = "read_only" } = await req.json();
  if (!user_email) return NextResponse.json({ error: "user_email is required" }, { status: 400 });
  if (!ORG_ROLES.includes(role as OrgRole)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Check plan member limit
  const db = getSupabaseServer();
  const [{ data: org }, { count: currentCount }] = await Promise.all([
    db.from("organizations").select("plan").eq("id", id).single(),
    db.from("organization_members").select("id", { count: "exact", head: true }).eq("organization_id", id).eq("is_active", true),
  ]);

  const limit = getLimitFor(org?.plan ?? "free", "max_members");
  if (limit !== -1 && (currentCount ?? 0) >= limit) {
    return NextResponse.json({
      error: `Member limit (${limit}) reached for the ${org?.plan ?? "free"} plan`,
    }, { status: 402 });
  }

  const { data, error } = await db
    .from("organization_members")
    .upsert(
      { organization_id: id, user_email: user_email.toLowerCase(), role, invited_by: actorEmail(ctx), is_active: true },
      { onConflict: "organization_id,user_email" },
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  await writeOrgAudit({
    organization_id: id,
    action:          "member.added",
    actor_email:     actorEmail(ctx),
    resource_type:   "member",
    resource_id:     user_email,
    detail:          { role },
    ip:              getClientIp(req),
  });

  return NextResponse.json({ member: data }, { status: 201 });
}

/** Update a member's role or status. */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessOrg(ctx, id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (ctx.type === "org_member" && ctx.role && !canDo(ctx.role, "members:invite")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { user_email, role, is_active, permissions } = await req.json();
  if (!user_email) return NextResponse.json({ error: "user_email is required" }, { status: 400 });

  // Prevent demoting the last owner
  if (role && role !== "owner") {
    const db2 = getSupabaseServer();
    const { count: ownerCount } = await db2
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", id)
      .eq("role", "owner")
      .eq("is_active", true);
    if ((ownerCount ?? 0) <= 1) {
      const { data: target } = await db2
        .from("organization_members")
        .select("role")
        .eq("organization_id", id)
        .eq("user_email", user_email)
        .single();
      if (target?.role === "owner") {
        return NextResponse.json({ error: "Cannot remove the last owner" }, { status: 400 });
      }
    }
  }

  const update: Record<string, unknown> = {};
  if (role        !== undefined) update.role        = role;
  if (is_active   !== undefined) update.is_active   = is_active;
  if (permissions !== undefined) update.permissions = permissions;

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("organization_members")
    .update(update)
    .eq("organization_id", id)
    .eq("user_email", user_email)
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  await writeOrgAudit({
    organization_id: id,
    action:          "member.updated",
    actor_email:     actorEmail(ctx),
    resource_type:   "member",
    resource_id:     user_email,
    detail:          update as Record<string, unknown>,
    ip:              getClientIp(req),
  });

  return NextResponse.json({ member: data });
}

/** Remove a member. */
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessOrg(ctx, id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (ctx.type === "org_member" && ctx.role && !canDo(ctx.role, "members:remove")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { user_email } = await req.json();
  if (!user_email) return NextResponse.json({ error: "user_email is required" }, { status: 400 });

  const db = getSupabaseServer();
  const { error } = await db
    .from("organization_members")
    .delete()
    .eq("organization_id", id)
    .eq("user_email", user_email);

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  await writeOrgAudit({
    organization_id: id,
    action:          "member.removed",
    actor_email:     actorEmail(ctx),
    resource_type:   "member",
    resource_id:     user_email,
    ip:              getClientIp(req),
  });

  return NextResponse.json({ ok: true });
}
