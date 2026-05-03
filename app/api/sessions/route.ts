import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export const revalidate = 300; // refresh every 5 minutes

export async function GET() {
  const db    = getSupabaseServer();
  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await db
    .from("sessions")
    .select("id, title, date, location")
    .gte("date", today)
    .order("date", { ascending: true })
    .limit(6);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
