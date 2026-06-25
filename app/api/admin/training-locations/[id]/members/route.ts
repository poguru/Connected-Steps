import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// GET /api/admin/training-locations/[id]/members
export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();

  const { data: assignments } = await db
    .from("user_location_assignments")
    .select("user_email, is_primary, assigned_at")
    .eq("location_id", id)
    .order("assigned_at", { ascending: false });

  const emails = (assignments ?? []).map(a => a.user_email);
  const { data: users } = emails.length ? await db
    .from("users")
    .select("email, first_name, last_name, phone")
    .in("email", emails) : { data: [] };

  const userMap = Object.fromEntries((users ?? []).map(u => [u.email, u]));

  return NextResponse.json({
    members: (assignments ?? []).map(a => ({
      ...a,
      name:  userMap[a.user_email] ? `${userMap[a.user_email].first_name} ${userMap[a.user_email].last_name}`.trim() : a.user_email,
      phone: userMap[a.user_email]?.phone ?? null,
    })),
  });
}

// POST /api/admin/training-locations/[id]/members — assign user
export async function POST(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: location_id } = await params;
  const { user_email, is_primary = true } = await req.json();
  if (!user_email) return NextResponse.json({ error: "user_email required" }, { status: 400 });

  const db = getSupabaseServer();
  const { data: user } = await db.from("users").select("email").eq("email", user_email.toLowerCase()).single();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { error } = await db.from("user_location_assignments").upsert(
    { user_email: user_email.toLowerCase(), location_id, is_primary },
    { onConflict: "user_email,location_id" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/training-locations/[id]/members — remove user
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: location_id } = await params;
  const { user_email } = await req.json();
  if (!user_email) return NextResponse.json({ error: "user_email required" }, { status: 400 });

  const db = getSupabaseServer();
  const { error } = await db.from("user_location_assignments")
    .delete()
    .eq("location_id", location_id)
    .eq("user_email", user_email.toLowerCase());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
