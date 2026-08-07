import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/contact-lists/[id]/members — add contacts
// Body: { contact_ids: string[] }
export async function POST(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db   = getSupabaseServer();
  const body = await req.json() as { contact_ids: string[] };

  if (!body.contact_ids?.length) return NextResponse.json({ error: "contact_ids required" }, { status: 400 });

  const rows = body.contact_ids.map(cid => ({ list_id: id, contact_id: cid, added_by: "admin" }));
  const { error } = await db.from("contact_list_members").upsert(rows, { onConflict: "list_id,contact_id", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ added: rows.length });
}

// DELETE /api/admin/contact-lists/[id]/members — remove contacts
// Body: { contact_ids: string[] }
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db   = getSupabaseServer();
  const body = await req.json() as { contact_ids: string[] };

  if (!body.contact_ids?.length) return NextResponse.json({ error: "contact_ids required" }, { status: 400 });

  const { error } = await db.from("contact_list_members")
    .delete()
    .eq("list_id", id)
    .in("contact_id", body.contact_ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ removed: body.contact_ids.length });
}
