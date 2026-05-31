import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const db = getSupabaseServer();

  const { data, error } = await db
    .from("session_attendance")
    .select("session_id")
    .eq("user_email", email.toLowerCase());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ session_ids: (data ?? []).map((r) => r.session_id) });
}
