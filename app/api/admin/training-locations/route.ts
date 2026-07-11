import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET /api/admin/training-locations â€” all locations with member counts
export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data: locations, error } = await db
    .from("training_locations")
    .select("*")
    .order("display_order", { ascending: true });

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // Enrich with member counts
  const ids = (locations ?? []).map(l => l.id);
  const { data: counts } = ids.length ? await db
    .from("user_location_assignments")
    .select("location_id")
    .in("location_id", ids) : { data: [] };

  const countMap: Record<string, number> = {};
  for (const c of counts ?? []) countMap[c.location_id] = (countMap[c.location_id] ?? 0) + 1;

  return NextResponse.json({
    locations: (locations ?? []).map(l => ({ ...l, member_count: countMap[l.id] ?? 0 })),
  });
}

// POST /api/admin/training-locations â€” create new location
export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, area, city, state, meeting_point, maps_url, latitude, longitude, max_capacity, display_order } = body;

  if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("training_locations")
    .insert({ name: name.trim(), area, city: city ?? "Hyderabad", state: state ?? "Telangana", meeting_point, maps_url, latitude, longitude, max_capacity, display_order: display_order ?? 0 })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ location: data });
}
