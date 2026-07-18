import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";

// GET /api/it-run/admin/checkins
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin", "checkin_team", "support_desk"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url   = new URL(req.url);
  const page  = parseInt(url.searchParams.get("page")  ?? "0");
  const limit = parseInt(url.searchParams.get("limit") ?? "50");

  const db = getSupabaseServer();
  const { data: event } = await db.from("it_run_events").select("id").eq("slug", "sprint-2").single<{ id: string }>();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const { data, error, count } = await db
    .from("it_run_checkins")
    .select(`
      id, checked_in_at, notes,
      it_run_participants!inner(
        id, first_name, last_name, bib_number,
        it_run_registrations!inner(
          registration_code,
          it_run_events!inner(id),
          it_run_categories(name, color)
        )
      )
    `, { count: "exact" })
    .eq("it_run_participants.it_run_registrations.it_run_events.id", event.id)
    .order("checked_in_at", { ascending: false })
    .range(page * limit, (page + 1) * limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, total: count ?? 0 });
}
