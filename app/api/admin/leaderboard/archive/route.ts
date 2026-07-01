import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// IST offset in milliseconds (UTC+05:30)
const IST_MS = 5.5 * 60 * 60 * 1000;

/** Current calendar month in IST as "YYYY-MM". */
function currentMonthIST(): string {
  return new Date(Date.now() + IST_MS).toISOString().slice(0, 7);
}

// ── GET — live leaderboard for a specific month + all archived months ─────────
// Query params:
//   ?month=YYYY-MM   (optional, defaults to current IST month)
//
// The "live" array contains ONLY users whose `points_month` in the leaderboard
// table matches the requested month.  This ensures:
//   • June users who haven't attended July sessions show 0 pts in July (they
//     are simply absent from the result rather than showing stale June values).
//   • The admin "This Month" column is always accurate.
export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getSupabaseServer();

  const sp    = new URL(req.url).searchParams;
  const month = sp.get("month") ?? currentMonthIST();

  // Validate month format
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Invalid month format — use YYYY-MM" }, { status: 400 });
  }

  const [liveRes, archiveRes] = await Promise.all([
    // Only fetch rows whose cached month_points belongs to the requested month.
    // Users who attended previous months but not the current one are correctly
    // excluded — their month_points is stale and must not appear as "current".
    db.from("leaderboard")
      .select("user_email, user_name, location, goal, month_points, total_points, points_month, updated_at")
      .eq("points_month", month)
      .gt("month_points", 0)           // only include users who actually earned points
      .order("month_points", { ascending: false }),

    db.from("monthly_leaderboard_archive")
      .select("*")
      .order("month", { ascending: false })
      .order("rank",  { ascending: true }),
  ]);

  if (liveRes.error)    return NextResponse.json({ error: liveRes.error.message },    { status: 500 });
  if (archiveRes.error) return NextResponse.json({ error: archiveRes.error.message }, { status: 500 });

  return NextResponse.json({
    live:     liveRes.data    ?? [],
    archives: archiveRes.data ?? [],
    month,                         // echo back so the client knows which month was served
  });
}

// ── POST — snapshot current month's leaderboard into the archive ──────────────
export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body  = await req.json().catch(() => ({}));
  const month = (body.month as string | undefined) ?? currentMonthIST();

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Invalid month format — use YYYY-MM" }, { status: 400 });
  }

  const db = getSupabaseServer();

  // Snapshot only rows whose points belong to the requested month
  const { data: entries, error: fetchErr } = await db
    .from("leaderboard")
    .select("user_email, user_name, location, goal, month_points, total_points, points_month")
    .eq("points_month", month)
    .gt("month_points", 0)
    .order("month_points", { ascending: false });

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!entries || entries.length === 0) {
    return NextResponse.json({ error: "No participants with points for this month." }, { status: 400 });
  }

  // Delete any existing archive for this month (allow re-archiving)
  await db.from("monthly_leaderboard_archive").delete().eq("month", month);

  const rows = entries.map((e, i) => ({
    month,
    rank:         i + 1,
    user_email:   e.user_email,
    user_name:    e.user_name,
    location:     e.location ?? "",
    goal:         e.goal ?? "",
    month_points: e.month_points ?? 0,
    total_points: e.total_points ?? 0,
    archived_at:  new Date().toISOString(),
  }));

  const { error: insertErr } = await db.from("monthly_leaderboard_archive").insert(rows);
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  return NextResponse.json({ saved: rows.length, month });
}
