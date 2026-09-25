import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";

// GET /api/it-run/admin/audit-logs
// ?limit=50&offset=0&actor=&action=
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit  = Math.min(100, parseInt(searchParams.get("limit") ?? "50", 10));
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);
  const actor  = searchParams.get("actor")?.trim() ?? "";
  const action = searchParams.get("action")?.trim() ?? "";

  const db = getSupabaseServer();

  let query = db
    .from("it_run_audit_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (actor)  query = (query as typeof query).ilike("actor_email", `%${actor}%`);
  if (action) query = (query as typeof query).eq("action", action);

  const { data: logs, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ logs, total: count ?? 0 });
}
