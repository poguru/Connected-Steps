import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";


export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();

  // Clean up notifications linking to this session's join page.
  // Must run before the session row is gone so the cleanup is meaningful.
  // Failure is non-fatal — session deletion still proceeds.
  try {
    const { error: cleanupErr } = await db
      .from("notifications")
      .delete()
      .eq("action_url", `/join/${id}`);
    if (cleanupErr) {
      console.error(`[session-delete] notification cleanup failed for session ${id}:`, cleanupErr.message);
    }
  } catch (e) {
    console.error(`[session-delete] notification cleanup threw for session ${id}:`, e);
  }

  // Delete attendance records first, then the session
  await db.from("session_attendance").delete().eq("session_id", id);
  const { error } = await db.from("sessions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { title, date, time, location, venue } = await req.json();

  if (!title || !date || !location) {
    return NextResponse.json({ error: "title, date and location are required." }, { status: 400 });
  }

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("sessions")
    .update({ title, date, time: time || null, location, venue: venue || null })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ data });
}
