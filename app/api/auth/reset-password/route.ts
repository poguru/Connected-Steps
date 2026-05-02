import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();
    if (!token || !password) return NextResponse.json({ error: "Missing fields." }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });

    const db = getSupabaseServer();

    // Find token
    const { data: resets } = await db
      .from("password_resets")
      .select("email, expires_at")
      .eq("token", token)
      .limit(1);

    if (!resets || resets.length === 0) {
      return NextResponse.json({ error: "Invalid or expired reset link." }, { status: 400 });
    }

    const reset = resets[0];
    if (new Date(reset.expires_at) < new Date()) {
      await db.from("password_resets").delete().eq("token", token);
      return NextResponse.json({ error: "This reset link has expired. Please request a new one." }, { status: 400 });
    }

    // Update password
    const hashed = await bcrypt.hash(password, 10);
    await db.from("users").update({ password: hashed }).eq("email", reset.email);

    // Delete used token
    await db.from("password_resets").delete().eq("token", token);

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    console.error("Reset password error:", e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
