import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const email = req.nextUrl.searchParams.get("email");
  const db = getSupabaseServer();

  const { data: session } = await db
    .from("sessions")
    .select("id, title, date, time, venue, location")
    .eq("id", id)
    .single();
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  let already_joined = false;
  if (email) {
    const { data: existing } = await db
      .from("session_attendance")
      .select("id")
      .eq("session_id", id)
      .eq("user_email", email.toLowerCase().trim())
      .single();
    already_joined = !!existing;
  }

  return NextResponse.json({ session, already_joined });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });

  const db = getSupabaseServer();

  const { data: session } = await db
    .from("sessions")
    .select("id, title, date, time, venue, location")
    .eq("id", id)
    .single();
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  // Block joining if session was more than 2 hours ago
  const sessionTime = session.time ?? "00:00";
  const [hours, minutes] = sessionTime.split(":").map(Number);
  const sessionStart = new Date(`${session.date}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00+05:30`);
  const deadline = new Date(sessionStart.getTime() + 2 * 60 * 60 * 1000);
  if (new Date() > deadline) {
    return NextResponse.json({ error: "Registration is closed. You can only join up to 2 hours after the session starts." }, { status: 410 });
  }

  const { data: user } = await db
    .from("users")
    .select("email, first_name, last_name")
    .eq("email", email.toLowerCase().trim())
    .single();
  if (!user) return NextResponse.json({ error: "No Connected Steps account found for this email. Please sign up first." }, { status: 404 });

  const { data: existing } = await db
    .from("session_attendance")
    .select("id")
    .eq("session_id", id)
    .eq("user_email", email.toLowerCase().trim())
    .single();

  if (existing) return NextResponse.json({ success: true, already: true, session });

  const { error } = await db.from("session_attendance").insert({
    session_id:    id,
    user_email:    user.email,
    user_name:     `${user.first_name} ${user.last_name}`.trim(),
    attended:      false,
    bonus_points:  0,
    bonus_reason:  "",
    points_synced: false,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, already: false, session });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });

  const db = getSupabaseServer();

  const { data: session } = await db
    .from("sessions")
    .select("id, date, time")
    .eq("id", id)
    .single();
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  // Block leaving if session has already started
  const sessionTime = session.time ?? "00:00";
  const [hours, minutes] = sessionTime.split(":").map(Number);
  const sessionStart = new Date(`${session.date}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00+05:30`);
  if (new Date() >= sessionStart) {
    return NextResponse.json({ error: "You cannot leave a session that has already started." }, { status: 400 });
  }

  // Check if points have been synced — don't allow leaving after that
  const { data: attendance } = await db
    .from("session_attendance")
    .select("id, points_synced")
    .eq("session_id", id)
    .eq("user_email", email.toLowerCase().trim())
    .single();

  if (!attendance) return NextResponse.json({ error: "You are not registered for this session." }, { status: 404 });
  if (attendance.points_synced) return NextResponse.json({ error: "Your attendance has already been recorded and points synced. Please contact the admin." }, { status: 400 });

  const { error } = await db
    .from("session_attendance")
    .delete()
    .eq("session_id", id)
    .eq("user_email", email.toLowerCase().trim());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
