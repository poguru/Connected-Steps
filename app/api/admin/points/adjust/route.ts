import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { recalculateMonth } from "@/lib/recalculate-leaderboard";
import { createNotification } from "@/lib/notify-inapp";

const IST_MS = 5.5 * 60 * 60 * 1000;

// POST /api/admin/points/adjust
// Body: { user_email, points (signed: positive=award, negative=deduct), reason, notes?, session_id? }
// Requires admin/coach auth.
// Writes an immutable admin_adjustment row to points_ledger, then triggers
// leaderboard recalculation for the current month.
export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as {
    user_email?: string;
    points?:     number;
    reason?:     string;
    notes?:      string;
    session_id?: string;
  };

  const { user_email, points, reason, notes, session_id } = body;

  if (!user_email || typeof points !== "number" || points === 0 || !reason?.trim()) {
    return NextResponse.json(
      { error: "user_email, points (non-zero), and reason are required" },
      { status: 400 },
    );
  }

  if (Math.abs(points) > 10_000) {
    return NextResponse.json({ error: "Points adjustment exceeds maximum allowed (10,000)" }, { status: 400 });
  }

  const db = getSupabaseServer();

  // Verify user exists
  const { data: user } = await db
    .from("users")
    .select("first_name, last_name, email")
    .eq("email", user_email.toLowerCase())
    .single();

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Build admin name from the session cookie (best-effort)
  const adminCookie = req.cookies.get("cs_admin")?.value ?? "Admin";

  const fullReason = notes?.trim()
    ? `${reason.trim()} — ${notes.trim()}`
    : reason.trim();

  // Write immutable ledger row
  const { data: ledgerRow, error: ledgerErr } = await db
    .from("points_ledger")
    .insert({
      user_email:  user_email.toLowerCase(),
      session_id:  session_id ?? null,
      points,
      reason:      fullReason,
      category:    "admin_adjustment",
      awarded_by:  adminCookie,
      metadata:    notes ? { notes } : null,
    })
    .select()
    .single();

  if (ledgerErr) {
    return NextResponse.json({ error: "Failed to record adjustment" }, { status: 500 });
  }

  // Trigger leaderboard recalculation for current month (forced)
  const currentMonth = new Date(Date.now() + IST_MS).toISOString().slice(0, 7);
  await recalculateMonth(currentMonth, { force: true });

  // Notify the user
  const action = points > 0 ? "awarded" : "deducted";
  const absPoints = Math.abs(points);
  await createNotification({
    user_email: user_email.toLowerCase(),
    type:       "achievement",
    title:      points > 0 ? "Points Awarded!" : "Points Adjusted",
    body:       `${absPoints} point${absPoints !== 1 ? "s" : ""} ${action}: ${reason.trim()}`,
    action_url: "/points",
  });

  return NextResponse.json({ adjustment: ledgerRow, recalculated: true });
}
