import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";

// GET /api/admin/attendance-qr/settings
// Returns all settings rows (global + per-location).
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data } = await db
    .from("attendance_qr_settings")
    .select("*, training_locations ( id, name )")
    .order("location_id", { ascending: true, nullsFirst: true });

  return NextResponse.json({ settings: data ?? [] });
}

// PATCH /api/admin/attendance-qr/settings
// Body: { location_id?: string|null; generation_time?: string; validity_minutes?: number;
//         auto_generate_enabled?: boolean; auto_email_enabled?: boolean }
// Upserts the settings row for the given location_id (null = global).
export async function PATCH(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db   = getSupabaseServer();
  const body = await req.json() as Record<string, unknown>;

  const allowed: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.generation_time === "string" && /^\d{2}:\d{2}$/.test(body.generation_time)) {
    allowed.generation_time = body.generation_time;
  }
  if (typeof body.validity_minutes === "number" && body.validity_minutes >= 30 && body.validity_minutes <= 480) {
    allowed.validity_minutes = body.validity_minutes;
  }
  if (typeof body.auto_generate_enabled === "boolean") {
    allowed.auto_generate_enabled = body.auto_generate_enabled;
  }
  if (typeof body.auto_email_enabled === "boolean") {
    allowed.auto_email_enabled = body.auto_email_enabled;
  }

  if (Object.keys(allowed).length <= 1) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const locationId = "location_id" in body ? (body.location_id as string | null) : undefined;

  const { data, error } = await db
    .from("attendance_qr_settings")
    .upsert({
      ...allowed,
      location_id: locationId ?? null,
    }, { onConflict: "location_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}
