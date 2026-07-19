import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getSupabaseServer();

  const sp    = req.nextUrl.searchParams;
  const limit = Math.max(0, parseInt(sp.get("limit") ?? "0", 10));
  const page  = Math.max(0, parseInt(sp.get("page")  ?? "0", 10));

  let q = db.from("sessions").select("*").order("date", { ascending: false });
  if (limit > 0) q = q.range(page * limit, page * limit + limit - 1);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // Backward-compatible: no pagination params -> same { data } shape as before.
  return NextResponse.json(
    limit > 0
      ? { data, page, limit, hasMore: (data?.length ?? 0) >= limit }
      : { data }
  );
}

export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { title, date, time, location, venue } = await req.json();
  if (!title || !date || !location) {
    return NextResponse.json({ error: "title, date and location are required." }, { status: 400 });
  }

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("sessions")
    .insert({ title, date, time: time || null, location, venue: venue || null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // Immediate member notifications removed.
  // Members are notified the evening before their session via the daily
  // session-reminders cron (6 PM IST). See /admin/settings/reminders.

  return NextResponse.json({ data });
}
