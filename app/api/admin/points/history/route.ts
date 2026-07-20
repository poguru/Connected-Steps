import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  attendance:       "Session Attendance",
  weekly_bonus:     "Weekly Bonus",
  bonus:            "Admin Bonus",
  challenge:        "Challenge Award",
  referral:         "Referral Reward",
  strava:           "Strava Reward",
  admin_adjustment: "Admin Adjustment",
  streak:           "Streak Reward",
};

// GET /api/admin/points/history
// Query: page=1 limit=25 user_email= category= from= to=
// Returns paginated full points_ledger with session title and user name joins.
export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page       = Math.max(1, parseInt(searchParams.get("page")  ?? "1", 10));
  const limit      = Math.min(100, Math.max(10, parseInt(searchParams.get("limit") ?? "25", 10)));
  const userEmail  = searchParams.get("user_email")?.toLowerCase() ?? "";
  const category   = searchParams.get("category") ?? "";
  const from       = searchParams.get("from") ?? "";
  const to         = searchParams.get("to") ?? "";

  const db = getSupabaseServer();

  let query = db
    .from("points_ledger")
    .select(
      "id, user_email, session_id, points, reason, category, awarded_by, week_key, created_at, metadata, sessions(id, title, date)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (userEmail) query = query.eq("user_email", userEmail);
  if (category)  query = query.eq("category", category);
  if (from)      query = query.gte("created_at", from + "T00:00:00Z");
  if (to)        query = query.lte("created_at", to   + "T23:59:59Z");

  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // Resolve user display names in batch
  const emails = [...new Set((data ?? []).map(r => r.user_email))];
  const { data: users } = await db
    .from("users")
    .select("email, first_name, last_name")
    .in("email", emails);

  const userMap = new Map((users ?? []).map(u => [u.email.toLowerCase(), `${u.first_name} ${u.last_name}`.trim()]));

  const transactions = (data ?? []).map(row => {
    const sessRaw = row.sessions as unknown;
    const sess = Array.isArray(sessRaw)
      ? (sessRaw[0] as { id: string; title: string; date: string } | undefined ?? null)
      : sessRaw as { id: string; title: string; date: string } | null;

    return {
      id:            row.id,
      user_email:    row.user_email,
      user_name:     userMap.get(row.user_email.toLowerCase()) ?? row.user_email.split("@")[0],
      session_id:    row.session_id,
      session_title: sess?.title ?? null,
      session_date:  sess?.date  ?? null,
      points:        row.points,
      reason:        row.reason,
      category:      row.category,
      category_label: CATEGORY_LABELS[row.category] ?? row.category,
      awarded_by:    row.awarded_by,
      week_key:      row.week_key,
      created_at:    row.created_at,
      metadata:      row.metadata,
    };
  });

  const total_count = count ?? 0;
  const total_pages = Math.max(1, Math.ceil(total_count / limit));

  return NextResponse.json({ transactions, page, total_pages, total_count });
}
