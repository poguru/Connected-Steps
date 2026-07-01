import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { recalculateMonth } from "@/lib/recalculate-leaderboard";


// POST — sync attendance for a session to the leaderboard.
//
// Safety properties:
//   Idempotent        — recalculateMonth reads all data and upserts; running
//                       twice produces identical leaderboard state.
//   Concurrent-safe   — both callers compute the same scores from the same
//                       data and upsert the same values. "Last writer wins"
//                       is safe because the writes are identical.
//   Single authority  — recalculateMonth is the only code that touches
//                       leaderboard points; no incremental delta is applied.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();

  // Fetch session date to determine which month to recalculate
  const { data: session } = await db
    .from("sessions")
    .select("date")
    .eq("id", id)
    .single();

  const sessionMonth = session?.date
    ? (session.date as string).slice(0, 7)
    : new Date().toISOString().slice(0, 7);

  // Early-exit guard: if every record for this session is already synced,
  // skip the recalculation entirely (no-op for re-clicks and concurrent calls
  // that arrive after the first has finished).
  const { count } = await db
    .from("session_attendance")
    .select("id", { count: "exact", head: true })
    .eq("session_id", id)
    .eq("points_synced", false);

  if (!count || count === 0) {
    return NextResponse.json({ synced: 0, message: "Nothing to sync." });
  }

  // Recalculate the full month — single source of truth.
  // Also marks all session_attendance rows for this month as points_synced = true.
  // force: true — the admin explicitly triggered this sync, so bypass the
  // 60-second debounce that protects against concurrent QR-scan storms.
  const result = await recalculateMonth(sessionMonth, { force: true });

  return NextResponse.json({
    synced:  result.updated,
    message: result.message,
  });
}
