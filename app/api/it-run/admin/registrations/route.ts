import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";

// GET /api/it-run/admin/registrations?page=0&limit=50&status=paid&search=
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "support_desk"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp     = req.nextUrl.searchParams;
  const page   = Math.max(0, parseInt(sp.get("page")  ?? "0", 10));
  const limit  = Math.min(100, Math.max(10, parseInt(sp.get("limit") ?? "50", 10)));
  const status = sp.get("status") ?? "";
  const search = sp.get("search")?.trim() ?? "";

  const db = getSupabaseServer();

  const { data: event } = await db
    .from("it_run_events")
    .select("id")
    .eq("slug", "sprint-2")
    .single();

  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  let q = db
    .from("it_run_registrations")
    .select(`
      id, registration_code, lead_email, participant_count,
      base_price, discount_amount, final_price, payment_status,
      created_at, updated_at,
      it_run_categories ( name, distance_km, category_type, color ),
      it_run_participants ( id, first_name, last_name, email, mobile, bib_number, verification_status )
    `, { count: "exact" })
    .eq("event_id", event.id);

  if (status) q = q.eq("payment_status", status);
  if (search) {
    q = q.or(`registration_code.ilike.%${search}%,lead_email.ilike.%${search}%`);
  }

  const { data, count, error } = await q
    .order("created_at", { ascending: false })
    .range(page * limit, page * limit + limit - 1);

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  return NextResponse.json({ data, total: count ?? 0, page, limit });
}
