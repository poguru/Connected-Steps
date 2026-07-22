import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";
import { recalculateMonth } from "@/lib/recalculate-leaderboard";
import { cacheDel, CK } from "@/lib/cache";
import { autoFeedSessionCompleted } from "@/lib/auto-feed";
import { createNotification } from "@/lib/notify-inapp";

function isoMondayKey(dateStr: string): string {
  const d = new Date(dateStr.slice(0, 10) + "T12:00:00Z");
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
}

// POST /api/attendance/scan
// Header: x-user-token
// Body: { token: string }
export async function POST(req: NextRequest) {
  const userToken = req.headers.get("x-user-token");
  if (!userToken) return NextResponse.json({ error: "Please log in to scan attendance" }, { status: 401 });

  const userEmail = verifyUserToken(userToken);
  if (!userEmail) return NextResponse.json({ error: "Session expired — please log in again" }, { status: 401 });

  let body: { token?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }

  const { token } = body;
  if (!token) return NextResponse.json({ error: "QR token missing" }, { status: 400 });

  const db = getSupabaseServer();

  // 1. Look up QR code
  const { data: qr } = await db
    .from("session_qr_codes")
    .select("session_id, expires_at")
    .eq("token", token)
    .single();

  if (!qr) return NextResponse.json({ error: "Invalid QR code" }, { status: 404 });

  if (new Date(qr.expires_at) < new Date()) {
    return NextResponse.json({ error: "This QR code has expired. Ask your coach to generate a new one." }, { status: 410 });
  }

  // 2. Get session info for the confirmation message
  const { data: session } = await db
    .from("sessions")
    .select("title, date, time")
    .eq("id", qr.session_id)
    .single();

  // 3. Check if already marked as attended — idempotency guard prevents
  //    duplicate points and feed posts when the same user scans twice.
  const { data: existing } = await db
    .from("session_attendance")
    .select("attended, check_in_method")
    .eq("session_id", qr.session_id)
    .eq("user_email", userEmail.toLowerCase())
    .single();

  if (existing?.attended) {
    return NextResponse.json({
      success: true,
      already_checked_in: true,
      message: `You're already checked in to ${session?.title ?? "this session"}.`,
      session,
    });
  }

  // 4. Upsert attendance — insert if not registered, update if registered but not attended
  const now = new Date().toISOString();
  let capturedUserName: string | undefined;

  if (existing) {
    // Already registered — mark attended
    const { error: upErr } = await db
      .from("session_attendance")
      .update({ attended: true, check_in_time: now, check_in_method: "qr" })
      .eq("session_id", qr.session_id)
      .eq("user_email", userEmail.toLowerCase());

    if (upErr) return NextResponse.json({ error: "Database error" }, { status: 500 });
  } else {
    // Not registered — auto-register + mark attended
    const { data: user } = await db
      .from("users")
      .select("first_name, last_name")
      .eq("email", userEmail.toLowerCase())
      .single();

    capturedUserName = user ? `${user.first_name} ${user.last_name}`.trim() : userEmail;

    const { error: insErr } = await db
      .from("session_attendance")
      .insert({
        session_id:       qr.session_id,
        user_email:       userEmail.toLowerCase(),
        user_name:        capturedUserName,
        attended:         true,
        check_in_time:    now,
        check_in_method:  "qr",
      });

    if (insErr) return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // Capture closure values before the response is sent.
  const capturedEmail        = userEmail.toLowerCase();
  const capturedSessionId    = qr.session_id;
  const capturedSessionTitle = session?.title ?? "the session";
  const capturedSessionDate  = session?.date as string | undefined;
  const capturedName         = capturedUserName; // may be undefined for the "update" path

  // after() keeps the serverless function alive until the callback completes,
  // even after the HTTP response has been flushed — guaranteeing that leaderboard
  // recalculation, feed posts, and notifications always run (fixes the previous
  // fire-and-forget pattern that Vercel killed immediately after response).
  after(async () => {
    // Each step is isolated so a failure in one NEVER prevents the others from running.
    // recalculateMonth (step 4) is the most critical — it must always execute.

    const bgDb = getSupabaseServer();

    // Step 1 — resolve display name
    let displayName = capturedName;
    if (!displayName) {
      try {
        const { data: userProfile } = await bgDb
          .from("users")
          .select("first_name, last_name")
          .eq("email", capturedEmail)
          .single();
        displayName = userProfile
          ? `${userProfile.first_name} ${userProfile.last_name}`.trim()
          : capturedEmail.split("@")[0];
      } catch (err) {
        console.error("[scan/after] display name fetch failed:", err);
        displayName = capturedEmail.split("@")[0];
      }
    }

    // Step 2 — attendance ledger row (audit trail for points history)
    try {
      await bgDb.from("points_ledger").insert({
        user_email: capturedEmail,
        session_id: capturedSessionId,
        points:     5,
        reason:     "Attendance",
        category:   "attendance",
        awarded_by: null,
      });
    } catch (err) {
      console.error("[scan/after] attendance ledger insert failed:", err);
    }

    // Step 3 — weekly bonus ledger row (purely for history; leaderboard derives bonus independently)
    if (capturedSessionDate) {
      try {
        const weekStart = isoMondayKey(capturedSessionDate);
        const weekEndDate = new Date(weekStart + "T00:00:00Z");
        weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
        const weekEnd = weekEndDate.toISOString().slice(0, 10);

        const { data: existingBonus } = await bgDb
          .from("points_ledger")
          .select("id")
          .eq("user_email", capturedEmail)
          .eq("category", "weekly_bonus")
          .eq("week_key", weekStart)
          .maybeSingle();

        if (!existingBonus) {
          const { data: weekSessionRows } = await bgDb
            .from("sessions")
            .select("id")
            .gte("date", weekStart)
            .lte("date", weekEnd);

          const weekSessionIds = (weekSessionRows ?? []).map(s => s.id);

          if (weekSessionIds.length > 0) {
            const { count: weekCount } = await bgDb
              .from("session_attendance")
              .select("id", { count: "exact", head: true })
              .eq("user_email", capturedEmail)
              .eq("attended", true)
              .in("session_id", weekSessionIds);

            if ((weekCount ?? 0) >= 4) {
              await bgDb.from("points_ledger").insert({
                user_email: capturedEmail,
                session_id: capturedSessionId,
                points:     5,
                reason:     "Weekly Attendance Bonus (4+ sessions this week)",
                category:   "weekly_bonus",
                awarded_by: "system",
                week_key:   weekStart,
              });

              createNotification({
                user_email: capturedEmail,
                type:       "achievement",
                title:      "Weekly Bonus Unlocked!",
                body:       "You attended 4+ sessions this week and earned an extra 5 points!",
                action_url: "/points",
              }).catch(() => {});
            }
          }
        }
      } catch (err) {
        console.error("[scan/after] weekly bonus failed:", err);
      }
    }

    // Step 4 — cache invalidation
    try {
      await cacheDel(
        CK.userAchievements(capturedEmail),
        CK.userJoinedSessions(capturedEmail),
      );
    } catch (err) {
      console.error("[scan/after] cache del failed:", err);
    }

    // Step 5 — leaderboard recalculation (CRITICAL — isolated so nothing above can skip it)
    if (capturedSessionDate) {
      try {
        const month = capturedSessionDate.slice(0, 7);
        await recalculateMonth(month, { force: true });
      } catch (err) {
        console.error("[scan/after] recalculateMonth failed:", err);
      }
    }

    // Step 6 — feed post + achievements (non-critical)
    try {
      await autoFeedSessionCompleted(capturedSessionId, [{ email: capturedEmail, name: displayName }]);
    } catch (err) {
      console.error("[scan/after] autoFeed failed:", err);
    }

    // Step 7 — attendance confirmation notification (non-critical)
    try {
      await createNotification({
        user_email: capturedEmail,
        type:       "achievement",
        title:      "Attendance Confirmed!",
        body:       `You earned 5 points for attending ${capturedSessionTitle}. Check your leaderboard rank!`,
        action_url: "/leaderboard",
      });
    } catch (err) {
      console.error("[scan/after] notification failed:", err);
    }
  });

  return NextResponse.json({
    success: true,
    already_checked_in: false,
    message: `Attendance recorded for ${session?.title ?? "this session"}!`,
    session,
  });
}
