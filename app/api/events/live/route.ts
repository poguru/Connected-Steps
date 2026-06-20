import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const db = getSupabaseServer();

  // Use IST (UTC+5:30) — only return events that haven't passed yet
  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const today  = istNow.toISOString().split("T")[0];

  const { data, error } = await db
    .from("run_events")
    .select("*")
    .eq("is_live", true)
    .gte("date", today)          // Never return past events
    .order("date", { ascending: true })
    .limit(1)
    .single();

  if (error || !data) return NextResponse.json({ event: null });
  return NextResponse.json({ event: data });
}
