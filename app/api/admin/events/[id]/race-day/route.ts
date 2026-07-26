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

  // Registration info + service status (checked_in_at, breakfast_availed, bib_collected_at).
  // Service columns live in event_participants — the ops scan route never updates
  // event_registrations for these fields, so reading them from there always returns null/false.
  const [regsRes, partsRes] = await Promise.all([
    db.from("event_registrations")
      .select("id, registration_code, user_name, user_email, phone, distance_category, bib_number")
      .eq("event_id", eventId)
      .in("status", ["confirmed"])
      .in("payment_status", ["paid", "free"]),
    db.from("event_participants")
      .select("registration_id, checked_in_at, checked_in_by, breakfast_availed, bib_collected_at")
      .eq("event_id", eventId)
      .neq("status", "cancelled"),
  ]);

  if (regsRes.error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // Build a map from registration_id → aggregated service status.
  // For group registrations (multiple participants), take the most recent check-in
  // and OR-aggregate boolean fields so any participant's action counts.
  type SvcStatus = { checked_in_at: string | null; checked_in_by: string | null; breakfast_availed: boolean; bib_collected_at: string | null };
  const partMap = new Map<string, SvcStatus>();
  for (const p of (partsRes.data ?? [])) {
    const existing = partMap.get(p.registration_id);
    if (!existing) {
      partMap.set(p.registration_id, {
        checked_in_at:     p.checked_in_at,
        checked_in_by:     p.checked_in_by,
        breakfast_availed: !!p.breakfast_availed,
        bib_collected_at:  p.bib_collected_at,
      });
    } else {
      partMap.set(p.registration_id, {
        checked_in_at:     p.checked_in_at ?? existing.checked_in_at,
        checked_in_by:     p.checked_in_at ? p.checked_in_by : existing.checked_in_by,
        breakfast_availed: !!p.breakfast_availed || existing.breakfast_availed,
        bib_collected_at:  p.bib_collected_at ?? existing.bib_collected_at,
      });
    }
  }

  const empty: SvcStatus = { checked_in_at: null, checked_in_by: null, breakfast_availed: false, bib_collected_at: null };

  // Enrich registration rows with participant service status, then sort by check-in time desc.
  const all = (regsRes.data ?? [])
    .map(r => ({ ...r, ...(partMap.get(r.id) ?? empty) }))
    .sort((a, b) => {
      if (!a.checked_in_at && !b.checked_in_at) return 0;
      if (!a.checked_in_at) return 1;
      if (!b.checked_in_at) return -1;
      return b.checked_in_at.localeCompare(a.checked_in_at);
    });

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
