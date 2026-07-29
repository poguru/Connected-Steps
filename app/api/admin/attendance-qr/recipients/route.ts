import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";

// GET /api/admin/attendance-qr/recipients
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data } = await db
    .from("attendance_qr_recipients")
    .select("*")
    .order("created_at", { ascending: true });

  return NextResponse.json({ recipients: data ?? [] });
}

// POST /api/admin/attendance-qr/recipients
// Body: { name: string; email: string; location_ids?: string[]; is_active?: boolean }
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db   = getSupabaseServer();
  const body = await req.json() as Record<string, unknown>;

  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!body.email || typeof body.email !== "string" || !body.email.trim()) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }
  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRx.test(body.email.trim())) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  const adminEmail = req.headers.get("x-admin-email") ?? "admin";

  const { data, error } = await db
    .from("attendance_qr_recipients")
    .insert({
      name:         String(body.name).trim(),
      email:        String(body.email).trim().toLowerCase(),
      location_ids: Array.isArray(body.location_ids) ? body.location_ids : [],
      is_active:    body.is_active !== false,
      created_by:   adminEmail,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "This email is already a recipient" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ recipient: data }, { status: 201 });
}
