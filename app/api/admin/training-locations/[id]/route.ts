import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/admin/training-locations/[id] — edit location
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("training_locations")
    .update(body)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ location: data });
}

// DELETE /api/admin/training-locations/[id] — delete if no members assigned
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();

  const { count } = await db
    .from("user_location_assignments")
    .select("id", { count: "exact", head: true })
    .eq("location_id", id);

  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: `Cannot delete — ${count} users are assigned to this location. Remove them first.` }, { status: 409 });
  }

  const { error } = await db.from("training_locations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
