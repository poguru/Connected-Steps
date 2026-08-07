import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// GET /api/admin/contact-lists/[id]
export async function GET(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();

  const { searchParams } = req.nextUrl;
  const limit  = Math.min(Number(searchParams.get("limit")  ?? 100), 500);
  const offset = Number(searchParams.get("offset") ?? 0);
  const q      = searchParams.get("q") ?? "";

  const { data: list, error } = await db.from("contact_lists").select("*").eq("id", id).single();
  if (error || !list) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Members
  const { data: memberRows, count } = await db.from("contact_list_members")
    .select("contact_id, added_at, external_contacts(id, full_name, company_name, email, mobile, city, state, tags, email_consent, whatsapp_consent, is_active)", { count: "exact" })
    .eq("list_id", id)
    .order("added_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const members = (memberRows ?? []).map(m => ({ ...m.external_contacts, added_at: m.added_at }));

  return NextResponse.json({ list: { ...list, member_count: count ?? 0 }, members });
}

// PUT /api/admin/contact-lists/[id]
export async function PUT(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db   = getSupabaseServer();
  const body = await req.json() as Record<string, unknown>;

  const { data, error } = await db.from("contact_lists").update({
    name:        body.name        ?? undefined,
    description: body.description ?? null,
    category:    body.category    ?? null,
    color:       body.color       ?? "#6b7280",
    is_active:   body.is_active   !== false,
    updated_at:  new Date().toISOString(),
  }).eq("id", id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ list: data });
}

// DELETE /api/admin/contact-lists/[id]
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();

  const { error } = await db.from("contact_lists").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
