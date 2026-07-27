import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getOrgContext, canAccessOrg, canDo } from "@/lib/org-auth";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessOrg(ctx, id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (ctx.type === "org_member" && ctx.role && !canDo(ctx.role, "audit:read")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const db     = getSupabaseServer();
  const sp     = req.nextUrl.searchParams;
  const limit  = Math.min(200, Math.max(1, parseInt(sp.get("limit") ?? "50", 10)));
  const offset = Math.max(0, parseInt(sp.get("offset") ?? "0", 10));
  const action = sp.get("action") ?? null;
  const actor  = sp.get("actor")  ?? null;

  let q = db
    .from("organization_audit_logs")
    .select("id, action, actor_email, resource_type, resource_id, detail, ip, created_at")
    .eq("organization_id", id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (action) q = q.ilike("action", `%${action}%`);
  if (actor)  q = q.ilike("actor_email", `%${actor}%`);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  return NextResponse.json({ logs: data ?? [], limit, offset });
}
