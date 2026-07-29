import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// GET /api/admin/campaigns/[id]
export async function GET(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getSupabaseServer();

  const { data, error } = await db.from("communication_campaigns")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ campaign: data });
}

// PATCH /api/admin/campaigns/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db     = getSupabaseServer();
  const body   = await req.json() as Record<string, unknown>;

  // Only draft campaigns can be edited
  const { data: existing } = await db.from("communication_campaigns")
    .select("status").eq("id", id).single();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!["draft", "scheduled"].includes(existing.status)) {
    return NextResponse.json({ error: "Only draft or scheduled campaigns can be edited" }, { status: 409 });
  }

  const allowed: Record<string, unknown> = {};
  const editable = [
    "name", "description", "channel", "message_type", "is_transactional",
    "segment_type", "segment_config", "subject", "html_body", "text_body",
    "template_id", "wa_template_name", "wa_template_params", "attachments", "scheduled_for",
  ];
  for (const key of editable) {
    if (key in body) allowed[key] = body[key];
  }

  if (!Object.keys(allowed).length) {
    return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
  }

  const { data, error } = await db.from("communication_campaigns")
    .update(allowed).eq("id", id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign: data });
}

// DELETE /api/admin/campaigns/[id]
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db     = getSupabaseServer();

  const { data: existing } = await db.from("communication_campaigns")
    .select("status").eq("id", id).single();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!["draft", "cancelled"].includes(existing.status)) {
    return NextResponse.json({ error: "Only draft or cancelled campaigns can be deleted" }, { status: 409 });
  }

  // Nullify campaign_id on any queue rows before deleting
  await db.from("email_queue").update({ campaign_id: null }).eq("campaign_id", id);

  const { error } = await db.from("communication_campaigns").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
