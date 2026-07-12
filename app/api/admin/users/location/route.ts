import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// POST /api/admin/users/location
// Body: { email, location_id }
// Updates user_location_assignments (upsert primary) + users.location (display name)

export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email, location_id } = await req.json().catch(() => ({})) as { email?: string; location_id?: string };
  if (!email || !location_id) return NextResponse.json({ error: "email and location_id required" }, { status: 400 });

  const db    = getSupabaseServer();
  const clean = email.toLowerCase().trim();

  // Fetch location name for the users.location text field
  const { data: loc, error: locErr } = await db
    .from("training_locations")
    .select("id, name")
    .eq("id", location_id)
    .single();

  if (locErr || !loc) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  // 1. Clear existing primary assignment
  await db
    .from("user_location_assignments")
    .update({ is_primary: false })
    .eq("user_email", clean)
    .eq("is_primary", true);

  // 2. Upsert new primary assignment
  const { error: upsertErr } = await db
    .from("user_location_assignments")
    .upsert(
      { user_email: clean, location_id, is_primary: true },
      { onConflict: "user_email,location_id" }
    );

  if (upsertErr) {
    console.error("[admin/users/location] upsert error:", upsertErr.message);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // 3. Keep users.location text in sync (legacy field used by leaderboard display)
  await db.from("users").update({ location: loc.name }).eq("email", clean);

  return NextResponse.json({ ok: true, location: loc.name });
}
