import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-user-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userEmail = verifyUserToken(token);
  if (!userEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { goal } = await req.json();
    if (!goal) return NextResponse.json({ error: "Missing goal" }, { status: 400 });

    const db = getSupabaseServer();
    await db.from("users").update({ goal }).eq("email", userEmail.toLowerCase());
    await db.from("leaderboard").update({ goal }).eq("user_email", userEmail.toLowerCase());

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
