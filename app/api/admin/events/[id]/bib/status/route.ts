import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// GET /api/admin/events/[id]/bib/status
// Returns BIB collection status overview for an event.

export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const db = getSupabaseServer();

  const [regRes, centerRes] = await Promise.all([
    // All confirmed paid registrations
    db.from("event_registrations")
      .select("id, registration_code, user_name, user_email, phone, distance_category, bib_number, bib_collected_at, bib_collected_by")
      .eq("event_id", eventId)
      .in("payment_status", ["paid", "free"])
      .eq("status", "confirmed")
      .order("bib_number", { ascending: true }),

    // Collection centers with their slots
    db.from("bib_collection_centers")
      .select(`*, bib_collection_slots(id, slot_date, start_time, end_time, capacity, booked_count, status)`)
      .eq("event_id", eventId)
      .order("display_order", { ascending: true }),
  ]);

  const regs    = regRes.data    ?? [];
  const centers = centerRes.data ?? [];

  const total     = regs.length;
  const assigned  = regs.filter(r => r.bib_number).length;
  const collected = regs.filter(r => r.bib_collected_at).length;
  const pending   = assigned - collected;

  // Group by category
  const byCategory: Record<string, { total: number; assigned: number; collected: number }> = {};
  for (const r of regs) {
    const cat = r.distance_category ?? "OPEN";
    if (!byCategory[cat]) byCategory[cat] = { total: 0, assigned: 0, collected: 0 };
    byCategory[cat].total++;
    if (r.bib_number)        byCategory[cat].assigned++;
    if (r.bib_collected_at) byCategory[cat].collected++;
  }

  return NextResponse.json({
    summary: { total, assigned, collected, pending, unassigned: total - assigned },
    by_category: byCategory,
    registrations: regs,
    centers,
  });
}
