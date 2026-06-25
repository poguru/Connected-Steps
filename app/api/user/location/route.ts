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
