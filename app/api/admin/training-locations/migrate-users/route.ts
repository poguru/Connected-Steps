import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// POST /api/admin/training-locations/migrate-users
// Auto-assigns existing users to training locations based on their text location field.
// Safe to run multiple times — skips users already assigned.
export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();

  // 1. Fetch all active training locations
  const { data: locations } = await db
    .from("training_locations")
    .select("id, name, area")
    .eq("status", "active");

  if (!locations?.length) return NextResponse.json({ error: "No active training locations found" }, { status: 404 });

  // 2. Fetch all users not yet assigned to any location
  const { data: assigned } = await db
    .from("user_location_assignments")
    .select("user_email");
  const assignedEmails = new Set((assigned ?? []).map(a => a.user_email));

  const { data: users } = await db
    .from("users")
    .select("email, location")
    .not("location", "is", null)
    .neq("location", "");

  const unassigned = (users ?? []).filter(u => !assignedEmails.has(u.email.toLowerCase()));

  // 3. Build location match map (name/area → location id)
  const matchMap = new Map<string, string>();
  for (const loc of locations) {
    const key = (loc.name ?? "").toLowerCase();
    const areaKey = (loc.area ?? "").toLowerCase();
    if (key) matchMap.set(key, loc.id);
    if (areaKey && areaKey !== key) matchMap.set(areaKey, loc.id);
  }

  // 4. Assign users to matching locations
  let assigned_count = 0, skipped = 0, no_match = 0;

  for (const user of unassigned) {
    const userLoc = (user.location ?? "").toLowerCase().trim();
    // Try exact match, then partial match
    let locationId = matchMap.get(userLoc);
    if (!locationId) {
      for (const [key, id] of matchMap) {
        if (userLoc.includes(key) || key.includes(userLoc)) { locationId = id; break; }
      }
    }

    if (!locationId) { no_match++; continue; }

    const { error } = await db.from("user_location_assignments").upsert(
      { user_email: user.email.toLowerCase(), location_id: locationId, is_primary: true },
      { onConflict: "user_email,location_id", ignoreDuplicates: true }
    );
    if (error) skipped++;
    else assigned_count++;
  }

  return NextResponse.json({
    total_unassigned: unassigned.length,
    assigned:   assigned_count,
    no_match,
    skipped,
    message: `Assigned ${assigned_count} users to training locations. ${no_match} users had no matching location text.`,
  });
}
