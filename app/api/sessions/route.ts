import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export const revalidate = 300; // refresh every 5 minutes

export async function GET() {
  const db = getSupabaseServer();

  // Use IST (UTC+5:30) for date/time comparisons since sessions are in India
  const istNow  = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const today   = istNow.toISOString().split("T")[0];
  const nowMins = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();

  const { data, error } = await db
    .from("sessions")
    .select("id, title, date, time, venue, location, photo_url")
    .gte("date", today)
    .order("date", { ascending: true })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Hide today's sessions that started more than 2 hours ago
  const GRACE_MINS = 120;
  const filtered = (data ?? []).filter((s) => {
    if (s.date !== today) return true;
    if (!s.time) return true;
    const [sh, sm] = (s.time as string).split(":").map(Number);
    return nowMins < sh * 60 + sm + GRACE_MINS;
  });

  return NextResponse.json({ data: filtered });
}
