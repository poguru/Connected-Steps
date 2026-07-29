import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";

// GET /api/admin/attendance-qr
// Returns paginated history of generated QRs with distribution status.
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db   = getSupabaseServer();
  const url  = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const size = 20;
  const from = (page - 1) * size;

  const { data: rows, count } = await db
    .from("daily_attendance_qr")
    .select(`
      id, date, location_id, generated_at, generated_by, expires_at, is_active,
      training_locations ( name ),
      daily_qr_distribution_log ( id, recipient_email, recipient_name, status, sent_at, error_message )
    `, { count: "exact" })
    .order("date",         { ascending: false })
    .order("generated_at", { ascending: false })
    .range(from, from + size - 1);

  return NextResponse.json({ qrs: rows ?? [], total: count ?? 0, page, size });
}
