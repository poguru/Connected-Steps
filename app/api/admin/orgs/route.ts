import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getOrgContext, writeOrgAudit, actorEmail } from "@/lib/org-auth";
import { getClientIp } from "@/lib/rate-limit";

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** List all organizations — super admin only. */
export async function GET(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db  = getSupabaseServer();
  const sp  = req.nextUrl.searchParams;
  const q   = sp.get("q") ?? "";

  let query = db
    .from("organizations")
    .select("id, name, slug, logo_url, primary_color, plan, plan_status, is_active, is_default, created_at, contact_email, website, domain")
    .order("created_at", { ascending: false });

  if (q) query = query.ilike("name", `%${q}%`);

  // Org members can only see their own org
  if (ctx.type === "org_member" && ctx.org_id) {
    query = query.eq("id", ctx.org_id);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // Attach member counts
  const db2 = getSupabaseServer();
  const ids  = (data ?? []).map(o => o.id);
  const { data: counts } = await db2
    .from("organization_members")
    .select("organization_id")
    .in("organization_id", ids)
    .eq("is_active", true);

  const memberCount: Record<string, number> = {};
  (counts ?? []).forEach(r => {
    memberCount[r.organization_id] = (memberCount[r.organization_id] ?? 0) + 1;
  });

  return NextResponse.json({
    orgs: (data ?? []).map(o => ({ ...o, member_count: memberCount[o.id] ?? 0 })),
  });
}

/** Create a new organization — super admin only. */
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.type !== "super_admin") {
    return NextResponse.json({ error: "Only platform admins can create organizations" }, { status: 403 });
  }

  const body = await req.json();
  const { name, contact_email, domain, plan = "free", timezone = "Asia/Kolkata", currency = "INR" } = body;
  if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const slug = `${toSlug(name)}-${Date.now().toString(36)}`;
  const db   = getSupabaseServer();

  const { data, error } = await db
    .from("organizations")
    .insert({ name: name.trim(), slug, contact_email, domain, plan, timezone, currency })
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  await writeOrgAudit({
    organization_id: data.id,
    action:          "org.created",
    actor_email:     actorEmail(ctx),
    resource_type:   "organization",
    resource_id:     data.id,
    detail:          { name: data.name, plan: data.plan },
    ip:              getClientIp(req),
  });

  return NextResponse.json({ org: data }, { status: 201 });
}
