import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getSupabaseServer();
  const { data: session } = await db
    .from("sessions")
    .select("id, title, date, time, venue, location")
    .eq("id", id)
    .single();
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  return NextResponse.json({ session });
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
