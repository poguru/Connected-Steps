import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET /api/admin/coach-assignments
// Returns all users with their assigned coaches
export async function GET(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const db = getSupabaseServer();

    const { data: assignments, error } = await db
      .from("coach_assignments")
      .select("id, user_email, coach_id, assigned_at, is_active, coaches(id, name, email, specialization)")
      .eq("is_active", true)
      .order("user_email");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: coaches } = await db
      .from("coaches")
      .select("id, name, email, specialization, is_admin")
      .eq("is_active", true)
      .order("is_admin", { ascending: false })
      .order("name");

    const { data: users } = await db
      .from("users")
      .select("email, first_name, last_name")
      .order("first_name");

    return NextResponse.json({
      assignments: assignments ?? [],
      coaches:     coaches ?? [],
      users:       users ?? [],
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/admin/coach-assignments
// Body: { user_email, coach_id }
export async function POST(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { user_email, coach_id } = await req.json();
    if (!user_email || !coach_id) {
      return NextResponse.json({ error: "user_email and coach_id required" }, { status: 400 });
    }

    const db = getSupabaseServer();

    const { data, error } = await db
      .from("coach_assignments")
      .upsert(
        { user_email: user_email.toLowerCase(), coach_id, is_active: true, assigned_at: new Date().toISOString() },
        { onConflict: "user_email,coach_id" }
      )
      .select("id, user_email, coach_id, assigned_at, is_active")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ assignment: data });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// DELETE /api/admin/coach-assignments
// Body: { user_email, coach_id }
export async function DELETE(req: NextRequest) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { user_email, coach_id } = await req.json();
    if (!user_email || !coach_id) {
      return NextResponse.json({ error: "user_email and coach_id required" }, { status: 400 });
    }

    const db = getSupabaseServer();
    const { error } = await db
      .from("coach_assignments")
      .update({ is_active: false })
      .eq("user_email", user_email.toLowerCase())
      .eq("coach_id", coach_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
