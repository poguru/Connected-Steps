import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("run_events")
    .select("*")
    .eq("is_live", true)
    .order("date", { ascending: true })
    .limit(1)
    .single();

  if (error || !data) return NextResponse.json({ event: null });
  return NextResponse.json({ event: data });
}
