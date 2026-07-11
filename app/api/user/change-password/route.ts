import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const { email, currentPassword, newPassword } = await req.json();
    if (!email || !currentPassword || !newPassword)
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    if (newPassword.length < 6)
      return NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 });

    const db = getSupabaseServer();
    const { data: user } = await db.from("users").select("password").eq("email", email.toLowerCase()).single();
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.from("users").update({ password: hashed }).eq("email", email.toLowerCase());

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
