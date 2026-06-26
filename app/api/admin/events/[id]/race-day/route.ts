import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// GET /api/admin/events/[id]/race-day
// Returns live race-day statistics and recent activity.
// Designed to be polled every 10–15 seconds from the Race Day Hub.
//
// Query params:
//   since   ISO timestamp — only return activity after this time (for incremental updates)

export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const since = req.nextUrl.searchParams.get("since") ?? null;
  const db    = getSupabaseServer();

  // All confirmed registrations with race-day status
  const { data: regs, error } = await db
    .from("event_registrations")
    .select(`
      id, registration_code, user_name, user_email, phone,
      distance_category, bib_number,
      status, payment_status,
      checked_in_at, checked_in_by,
      breakfast_availed, breakfast_availed_at,
      bib_collected_at
    `)
    .eq("event_id", eventId)
    .in("status", ["confirmed"])
    .in("payment_status", ["paid", "free"])
    .order("checked_in_at", { ascending: false, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const all             = regs ?? [];
  const total           = all.length;
  const checkedIn       = all.filter(r => r.checked_in_at).length;
  const notCheckedIn    = total - checkedIn;
  const breakfastIssued = all.filter(r => r.breakfast_availed).length;
  const bibCollected    = all.filter(r => r.bib_collected_at).length;

  // Recent activity: last 20 check-ins
  const recentCheckins = all
    .filter(r => r.checked_in_at)
    .slice(0, 20)
    .map(r => ({
      registration_code: r.registration_code,
      user_name:         r.user_name,
      distance_category: r.distance_category,
      bib_number:        r.bib_number,
      checked_in_at:     r.checked_in_at,
      checked_in_by:     r.checked_in_by,
    }));

  // Pending list: confirmed + paid but not yet checked in
  const pending = all
    .filter(r => !r.checked_in_at)
    .map(r => ({
      registration_code: r.registration_code,
      user_name:         r.user_name,
      user_email:        r.user_email,
      phone:             r.phone,
      distance_category: r.distance_category,
      bib_number:        r.bib_number,
    }));

  // By category breakdown
  const byCategory: Record<string, { total: number; checked_in: number; breakfast: number }> = {};
  for (const r of all) {
    const cat = r.distance_category ?? "OPEN";
    if (!byCategory[cat]) byCategory[cat] = { total: 0, checked_in: 0, breakfast: 0 };
    byCategory[cat].total++;
    if (r.checked_in_at)    byCategory[cat].checked_in++;
    if (r.breakfast_availed) byCategory[cat].breakfast++;
  }

  // New activity since timestamp (for incremental polling)
  const newSince = since
    ? all.filter(r => r.checked_in_at && r.checked_in_at > since)
    : [];

  return NextResponse.json({
    summary: {
      total,
      checked_in:       checkedIn,
      not_checked_in:   notCheckedIn,
      breakfast_issued: breakfastIssued,
      bib_collected:    bibCollected,
      check_in_rate:    total > 0 ? Math.round((checkedIn / total) * 100) : 0,
    },
    by_category:     byCategory,
    recent_checkins: recentCheckins,
    pending,
    new_since:       newSince,
    as_of:           new Date().toISOString(),
  });
}
