import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";

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

  // 3. Check if already marked as attended
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

  if (existing) {
    // Already registered — mark attended
    const { error: upErr } = await db
      .from("session_attendance")
      .update({ attended: true, check_in_time: now, check_in_method: "qr" })
      .eq("session_id", qr.session_id)
      .eq("user_email", userEmail.toLowerCase());

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  } else {
    // Not registered — auto-register + mark attended
    const { data: user } = await db
      .from("users")
      .select("first_name, last_name")
      .eq("email", userEmail.toLowerCase())
      .single();

    const userName = user ? `${user.first_name} ${user.last_name}`.trim() : userEmail;

    const { error: insErr } = await db
      .from("session_attendance")
      .insert({
        session_id: qr.session_id,
        user_email: userEmail.toLowerCase(),
        user_name: userName,
        attended: true,
        check_in_time: now,
        check_in_method: "qr",
      });

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    already_checked_in: false,
    message: `Attendance recorded for ${session?.title ?? "this session"}!`,
    session,
  });
}
