import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const { email, goal } = await req.json();
    if (!email || !goal) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const db = getSupabaseServer();

    // Update users table
    await db.from("users").update({ goal }).eq("email", email.toLowerCase());

    // Update leaderboard table too
    await db.from("leaderboard").update({ goal }).eq("user_email", email.toLowerCase());

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
