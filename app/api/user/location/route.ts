import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyUserToken } from "@/lib/admin-auth";

// GET /api/user/location — returns the caller's training location assignment(s)
export async function GET(req: NextRequest) {
  const token = req.headers.get("x-user-token");
  if (!token) return NextResponse.json({ locations: [] });
  const email = verifyUserToken(token);
  if (!email) return NextResponse.json({ locations: [] });

  const db = getSupabaseServer();
  const { data } = await db
    .from("user_location_assignments")
    .select("location_id, is_primary, training_locations(id, name, area, city, meeting_point, maps_url, latitude, longitude)")
    .eq("user_email", email.toLowerCase())
    .order("is_primary", { ascending: false });

  return NextResponse.json({ locations: data ?? [] });
}

// POST /api/user/location — set / update the caller's preferred training location
export async function POST(req: NextRequest) {
  const token = req.headers.get("x-user-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const email = verifyUserToken(token);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { location_id } = await req.json();
  if (!location_id) return NextResponse.json({ error: "location_id required" }, { status: 400 });

  const db = getSupabaseServer();

  // Verify location exists and is active
  const { data: loc } = await db
    .from("training_locations")
    .select("id, name")
    .eq("id", location_id)
    .eq("status", "active")
    .single();

  if (!loc) return NextResponse.json({ error: "Training location not found or inactive" }, { status: 404 });

  // Set all existing assignments to is_primary=false first
  await db
    .from("user_location_assignments")
    .update({ is_primary: false })
    .eq("user_email", email.toLowerCase());

  // Upsert the new primary location
  const { error } = await db.from("user_location_assignments").upsert(
    { user_email: email.toLowerCase(), location_id, is_primary: true },
    { onConflict: "user_email,location_id" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  console.log(`[location] user ${email} set preferred location to ${loc.name}`);
  return NextResponse.json({ ok: true, location: loc });
}
