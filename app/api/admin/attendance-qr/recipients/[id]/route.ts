import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/admin/attendance-qr/recipients/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db     = getSupabaseServer();
  const body   = await req.json() as Record<string, unknown>;

  const allowed: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.name === "string" && body.name.trim()) {
    allowed.name = body.name.trim();
  }
  if (typeof body.email === "string" && body.email.trim()) {
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRx.test(body.email.trim())) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }
    allowed.email = body.email.trim().toLowerCase();
  }
  if (typeof body.is_active === "boolean") {
    allowed.is_active = body.is_active;
  }
  if (Array.isArray(body.location_ids)) {
    allowed.location_ids = body.location_ids;
  }

  if (Object.keys(allowed).length <= 1) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await db
    .from("attendance_qr_recipients")
    .update(allowed)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Recipient not found" }, { status: 404 });

  return NextResponse.json({ recipient: data });
}

// DELETE /api/admin/attendance-qr/recipients/[id]
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db     = getSupabaseServer();

  const { error } = await db
    .from("attendance_qr_recipients")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
