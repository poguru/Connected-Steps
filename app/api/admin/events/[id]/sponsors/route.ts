import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET /api/admin/events/[id]/sponsors
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("event_sponsors")
    .select("*")
    .eq("event_id", id)
    .order("display_order")
    .order("created_at");
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ sponsors: data ?? [] });
}

// POST — create sponsor
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json() as { name: string; tier?: string; logo_url?: string; website_url?: string; description?: string; display_order?: number };
  if (!body.name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const db = getSupabaseServer();
  const { data, error } = await db.from("event_sponsors").insert({
    event_id:      id,
    name:          body.name.trim(),
    tier:          body.tier ?? "community",
    logo_url:      body.logo_url ?? null,
    website_url:   body.website_url ?? null,
    description:   body.description ?? null,
    display_order: body.display_order ?? 0,
    visible:       true,
  }).select().single();
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ sponsor: data });
}

// PATCH — update sponsor
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { sponsor_id, ...updates } = await req.json() as { sponsor_id: string; [k: string]: unknown };
  if (!sponsor_id) return NextResponse.json({ error: "sponsor_id required" }, { status: 400 });

  const db = getSupabaseServer();
  const { data, error } = await db.from("event_sponsors").update(updates).eq("id", sponsor_id).eq("event_id", id).select().single();
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ sponsor: data });
}

// DELETE — remove sponsor
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { sponsor_id } = await req.json() as { sponsor_id: string };
  if (!sponsor_id) return NextResponse.json({ error: "sponsor_id required" }, { status: 400 });

  const db = getSupabaseServer();
  const { error } = await db.from("event_sponsors").delete().eq("id", sponsor_id).eq("event_id", id);
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ success: true });
}
