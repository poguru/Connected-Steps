import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getSupabaseServer } from "@/lib/supabase-server";
import { paiseToRupees } from "@/lib/finance-service";

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const org_id      = searchParams.get("org_id")      ?? undefined;
  const event_id    = searchParams.get("event_id")    ?? undefined;
  const entity_type = searchParams.get("entity_type") ?? undefined;
  const action      = searchParams.get("action")      ?? undefined;
  const date_from   = searchParams.get("date_from")   ?? undefined;
  const date_to     = searchParams.get("date_to")     ?? undefined;
  const page        = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit       = 50;
  const offset      = (page - 1) * limit;

  const db = getSupabaseServer();
  let q = db
    .from("financial_audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (org_id)      q = q.eq("organization_id", org_id) as typeof q;
  if (event_id)    q = q.eq("event_id", event_id) as typeof q;
  if (entity_type) q = q.eq("entity_type", entity_type) as typeof q;
  if (action)      q = q.ilike("action", `%${action}%`) as typeof q;
  if (date_from)   q = q.gte("created_at", date_from) as typeof q;
  if (date_to)     q = q.lte("created_at", date_to + "T23:59:59Z") as typeof q;

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const logs = (data ?? []).map((l: Record<string, unknown>) => ({
    ...l,
    amount_rupees: l.amount_paise != null ? paiseToRupees(l.amount_paise as number) : null,
  }));

  return NextResponse.json({ logs, total: count ?? 0, page, limit });
}
