import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";

// GET /api/admin/campaigns?status=draft&channel=email&limit=50&offset=0
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const status  = searchParams.get("status");
  const channel = searchParams.get("channel");
  const limit   = Math.min(Number(searchParams.get("limit") ?? 50), 100);
  const offset  = Number(searchParams.get("offset") ?? 0);

  const db = getSupabaseServer();
  let q = db.from("communication_campaigns")
    .select("id, name, description, channel, message_type, is_transactional, segment_type, status, recipient_count, sent_count, failed_count, delivered_count, opened_count, created_by, created_at, updated_at, sent_at, scheduled_for", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status)  q = q.eq("status", status);
  if (channel) q = q.eq("channel", channel);

  const { data, count, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ campaigns: data ?? [], total: count ?? 0 });
}

// POST /api/admin/campaigns
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminEmail = req.headers.get("x-admin-email") ?? "admin";
  const db  = getSupabaseServer();
  const body = await req.json() as Record<string, unknown>;

  if (!body.name || typeof body.name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!body.channel || !["email", "whatsapp", "push"].includes(body.channel as string)) {
    return NextResponse.json({ error: "channel must be email, whatsapp, or push" }, { status: 400 });
  }

  const { data, error } = await db.from("communication_campaigns").insert({
    name:             String(body.name).trim(),
    description:      body.description ? String(body.description) : null,
    channel:          body.channel,
    message_type:     body.message_type ?? "general_update",
    is_transactional: body.is_transactional === true,
    segment_type:     body.segment_type   ?? "all_users",
    segment_config:   body.segment_config ?? {},
    subject:          body.subject        ?? null,
    html_body:        body.html_body      ?? null,
    text_body:        body.text_body      ?? null,
    template_id:      body.template_id    ?? null,
    wa_template_name: body.wa_template_name ?? null,
    wa_template_params: body.wa_template_params ?? [],
    attachments:      body.attachments    ?? [],
    scheduled_for:    body.scheduled_for  ?? null,
    status:           "draft",
    created_by:       adminEmail,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign: data }, { status: 201 });
}
