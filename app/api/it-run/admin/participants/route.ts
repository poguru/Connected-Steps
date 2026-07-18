import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";

// GET /api/it-run/admin/participants
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "support_desk", "verification_team"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url    = new URL(req.url);
  const page   = parseInt(url.searchParams.get("page")   ?? "0");
  const limit  = parseInt(url.searchParams.get("limit")  ?? "40");
  const search = url.searchParams.get("search") ?? "";
  const status = url.searchParams.get("status") ?? "";

  const db = getSupabaseServer();
  const { data: event } = await db.from("it_run_events").select("id").eq("slug", "sprint-2").single<{ id: string }>();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  let query = db
    .from("it_run_participants")
    .select(`
      id, first_name, last_name, email, mobile, tshirt_size, dob,
      company_name, bib_number, wave, verification_status, participant_type,
      it_run_registrations!inner(
        registration_code, payment_status,
        it_run_categories(name, color),
        event_id
      ),
      it_run_bib_collections(id),
      it_run_checkins(id, checked_in_at)
    `, { count: "exact" })
    .eq("it_run_registrations.event_id", event.id);

  if (status) query = query.eq("verification_status", status);

  if (search) {
    query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,mobile.ilike.%${search}%,bib_number.eq.${search}`
    );
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(page * limit, (page + 1) * limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, total: count ?? 0 });
}
