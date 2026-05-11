import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const { type, value, code } = await req.json();
    if (!type || !value || !code) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const db         = getSupabaseServer();
    const identifier = type === "email" ? (value as string).toLowerCase() : value;

    const { data, error } = await db
      .from("otp_verifications")
      .select("id, code, expires_at, verified")
      .eq("identifier", identifier)
      .eq("type", type)
      .single();

    if (error || !data)  return NextResponse.json({ error: "OTP not found. Please request a new one." }, { status: 400 });
    if (data.verified)   return NextResponse.json({ error: "OTP already used." }, { status: 400 });
    if (new Date(data.expires_at) < new Date()) return NextResponse.json({ error: "OTP expired. Please request a new one." }, { status: 400 });
    if (data.code !== String(code).trim()) return NextResponse.json({ error: "Incorrect OTP. Please try again." }, { status: 400 });

    await db.from("otp_verifications").update({ verified: true }).eq("id", data.id);
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
