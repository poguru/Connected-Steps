import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-user-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const email = verifyUserToken(token);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();

  const { data, error } = await db
    .from("session_attendance")
    .select("session_id, attended")
    .eq("user_email", email.toLowerCase());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  return NextResponse.json({
    session_ids:  rows.map((r) => r.session_id),
    attended_ids: rows.filter((r) => r.attended).map((r) => r.session_id),
  });
}
