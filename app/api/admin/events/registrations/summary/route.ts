import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET /api/admin/events/registrations/summary
// Returns per-event registration counts for the events list dashboard.
export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("event_registrations")
    .select("event_id, payment_status, final_price, status");

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const map: Record<string, { event_id: string; total: number; paid: number; free: number; pending: number; revenue: number }> = {};

  for (const r of data ?? []) {
    if (!map[r.event_id]) {
      map[r.event_id] = { event_id: r.event_id, total: 0, paid: 0, free: 0, pending: 0, revenue: 0 };
    }
    const s = map[r.event_id];
    s.total++;
    if (r.payment_status === "paid")    { s.paid++;    s.revenue += r.final_price ?? 0; }
    if (r.payment_status === "free")    { s.free++;    }
    if (r.payment_status === "pending") { s.pending++; }
  }

  return NextResponse.json({ summaries: Object.values(map) });
}
