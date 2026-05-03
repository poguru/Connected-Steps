import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export const revalidate = 3600; // cache for 1 hour

export async function GET() {
  const db = getSupabaseServer();

  const [membersRes, runsRes] = await Promise.all([
    db.from("users").select("id", { count: "exact", head: true }),
    db.from("run_registrations").select("id", { count: "exact", head: true }),
  ]);

  return NextResponse.json({
    members:          membersRes.count  ?? 0,
    runRegistrations: runsRes.count     ?? 0,
  });
}
