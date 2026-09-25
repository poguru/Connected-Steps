import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";

// GET /api/it-run/admin/audit-logs
// Filters: actor, action, entity_type, entity_id, date_from, date_to
// Pagination: limit, offset
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "super_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp          = req.nextUrl.searchParams;
  const limit       = Math.min(100, parseInt(sp.get("limit")  ?? "50", 10));
  const offset      = parseInt(sp.get("offset") ?? "0", 10);
  const actor       = sp.get("actor")?.trim()       ?? "";
  const action      = sp.get("action")?.trim()      ?? "";
  const entityType  = sp.get("entity_type")?.trim() ?? "";
  const entityId    = sp.get("entity_id")?.trim()   ?? "";
  const dateFrom    = sp.get("date_from")?.trim()   ?? "";
  const dateTo      = sp.get("date_to")?.trim()     ?? "";

  const db = getSupabaseServer();

  let query = db
    .from("it_run_audit_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (actor)      query = query.ilike("actor_email", `%${actor}%`);
  if (action)     query = query.eq("action", action);
  if (entityType) query = query.eq("entity_type", entityType);
  if (entityId)   query = query.ilike("entity_id", `%${entityId}%`);
  if (dateFrom)   query = query.gte("created_at", `${dateFrom}T00:00:00Z`);
  if (dateTo)     query = query.lte("created_at", `${dateTo}T23:59:59Z`);

  const { data: logs, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ logs, total: count ?? 0 });
}
