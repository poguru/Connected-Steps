import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-user-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userEmail = verifyUserToken(token);
  if (!userEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { firstName, lastName, phone, location, goal, photo } = await req.json();

    const db = getSupabaseServer();

    const updateFields: Record<string, unknown> = {};
    if (firstName !== undefined) updateFields.first_name = firstName;
    if (lastName  !== undefined) updateFields.last_name  = lastName;
    if (phone     !== undefined) {
      updateFields.phone          = phone;
      updateFields.phone_verified = false;
    }
    if (location !== undefined) updateFields.location = location;
    if (goal     !== undefined) updateFields.goal     = goal;
    if (photo    !== undefined) updateFields.photo    = photo;

    await db.from("users").update(updateFields).eq("email", userEmail.toLowerCase());

    const lbFields: Record<string, unknown> = {};
    if (firstName !== undefined && lastName !== undefined) lbFields.user_name = `${firstName} ${lastName}`;
    if (location  !== undefined) lbFields.location = location;
    if (goal      !== undefined) lbFields.goal     = goal;
    if (Object.keys(lbFields).length > 0) {
      await db.from("leaderboard").update(lbFields).eq("user_email", userEmail.toLowerCase());
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
