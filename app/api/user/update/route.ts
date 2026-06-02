import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const { email, firstName, lastName, phone, location, goal, photo } = await req.json();
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

    const db = getSupabaseServer();

    const updateFields: Record<string, unknown> = {
      first_name: firstName,
      last_name:  lastName,
      phone,
      location,
      goal,
    };
    if (photo !== undefined) updateFields.photo = photo;

    await db.from("users").update(updateFields).eq("email", email.toLowerCase());

    await db.from("leaderboard").update({
      user_name: `${firstName} ${lastName}`,
      location,
      goal,
    }).eq("user_email", email.toLowerCase());

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
