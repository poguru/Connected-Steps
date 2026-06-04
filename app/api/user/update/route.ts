import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const { email, firstName, lastName, phone, location, goal, photo } = await req.json();
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

    const db = getSupabaseServer();

    const updateFields: Record<string, unknown> = {};
    if (firstName !== undefined) updateFields.first_name = firstName;
    if (lastName  !== undefined) updateFields.last_name  = lastName;
    if (phone     !== undefined) updateFields.phone      = phone;
    if (location  !== undefined) updateFields.location   = location;
    if (goal      !== undefined) updateFields.goal       = goal;
    if (photo     !== undefined) updateFields.photo      = photo;

    await db.from("users").update(updateFields).eq("email", email.toLowerCase());

    const lbFields: Record<string, unknown> = {};
    if (firstName !== undefined && lastName !== undefined) lbFields.user_name = `${firstName} ${lastName}`;
    if (location  !== undefined) lbFields.location = location;
    if (goal      !== undefined) lbFields.goal     = goal;
    if (Object.keys(lbFields).length > 0) {
      await db.from("leaderboard").update(lbFields).eq("user_email", email.toLowerCase());
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
