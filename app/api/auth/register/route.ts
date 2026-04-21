import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const { firstName, lastName, email, phone, goal, location, password } = await req.json();

    if (!email || !password || !firstName || !lastName) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const supabaseServer = getSupabaseServer();

    // Check if email already registered
    const { data: existing, error: checkError } = await supabaseServer
      .from("users")
      .select("id")
      .eq("email", email.toLowerCase())
      .single();

    if (checkError && checkError.code !== "PGRST116") {
      console.error("Supabase check error:", checkError);
      return NextResponse.json({ error: "DB check failed: " + checkError.message }, { status: 500 });
    }

    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 12);

    const { error } = await supabaseServer.from("users").insert({
      first_name: firstName,
      last_name:  lastName,
      email:      email.toLowerCase(),
      phone,
      goal,
      location,
      password:   hashed,
    });

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json({ error: "Insert failed: " + error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    console.error("Register route crashed:", e);
    return NextResponse.json({ error: "Server error: " + (e instanceof Error ? e.message : String(e)) }, { status: 500 });
  }
}
