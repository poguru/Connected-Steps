import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// GET /api/admin/events/[id]/ops/volunteers
// Returns per-volunteer operational stats aggregated from event_service_logs.
// Includes role, scan counts per service, and last-active timestamp.
export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const db = getSupabaseServer();

  const [assignmentsRes, logsRes] = await Promise.all([
    // Who is assigned and in what role
    db.from("event_portal_user_assignments")
      .select("id, role, event_portal_users!inner(email, name)")
      .eq("event_id", eventId),

    // All service log entries for this event — aggregated per volunteer
    db.from("event_service_logs")
      .select("volunteer_email, volunteer_role, service_name, action, created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false }),
  ]);

  type Assignment = {
    id: string;
    role: string;
    event_portal_users: { email: string; name: string | null } | null;
  };

  const assignments = (assignmentsRes.data ?? []) as unknown as Assignment[];

  // Build per-volunteer aggregates from service logs
  type VolStats = {
    email: string;
    total_scans: number;
    by_service: Record<string, number>;
    last_active: string | null;
  };

  const volMap = new Map<string, VolStats>();

  for (const log of (logsRes.data ?? [])) {
    const email = log.volunteer_email ?? "system";
    if (!volMap.has(email)) {
      volMap.set(email, { email, total_scans: 0, by_service: {}, last_active: null });
    }
    const v = volMap.get(email)!;
    v.total_scans++;
    v.by_service[log.service_name] = (v.by_service[log.service_name] ?? 0) + 1;
    if (!v.last_active || log.created_at > v.last_active) v.last_active = log.created_at;
  }

  // Merge assignments with stats
  const ACTIVE_CUTOFF = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 min

  const volunteers = assignments.map(a => {
    const email = a.event_portal_users?.email ?? "";
    const stats = volMap.get(email);
    const lastActive = stats?.last_active ?? null;
    const isActive = lastActive ? lastActive > ACTIVE_CUTOFF : false;

    return {
      id:          a.id,
      email,
      name:        a.event_portal_users?.name ?? email,
      role:        a.role,
      total_scans: stats?.total_scans ?? 0,
      by_service:  stats?.by_service  ?? {},
      last_active: lastActive,
      is_active:   isActive,
    };
  });

  // Include volunteers seen in logs but not in assignments (edge case)
  for (const [email, stats] of volMap.entries()) {
    if (email === "system") continue;
    const alreadyIncluded = volunteers.some(v => v.email === email);
    if (!alreadyIncluded) {
      volunteers.push({
        id:          email,
        email,
        name:        email,
        role:        "unknown",
        total_scans: stats.total_scans,
        by_service:  stats.by_service,
        last_active: stats.last_active,
        is_active:   stats.last_active ? stats.last_active > ACTIVE_CUTOFF : false,
      });
    }
  }

  // Sort: active first, then by total_scans desc
  volunteers.sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    return b.total_scans - a.total_scans;
  });

  return NextResponse.json({ volunteers, as_of: new Date().toISOString() });
}
