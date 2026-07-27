import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

const VALID_STATUSES = ["pending", "in_progress", "done", "skipped"] as const;
type CheckpointStatus = typeof VALID_STATUSES[number];

// GET /api/admin/events/[id]/checkpoints
export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();

  const { data, error } = await db
    .from("event_checkpoints")
    .select("id, label, description, planned_at, actual_at, status, notes, owner_email, display_order, created_at")
    .eq("event_id", id)
    .order("display_order", { ascending: true });

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ checkpoints: data ?? [] });
}

// POST /api/admin/events/[id]/checkpoints
export async function POST(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: event_id } = await params;
  const body = await req.json() as Record<string, unknown>;

  if (!body.label || typeof body.label !== "string") {
    return NextResponse.json({ error: "label is required" }, { status: 400 });
  }

  const db = getSupabaseServer();

  const { data: maxRow } = await db
    .from("event_checkpoints")
    .select("display_order")
    .eq("event_id", event_id)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const display_order = (maxRow?.display_order ?? -1) + 1;

  const { data, error } = await db
    .from("event_checkpoints")
    .insert({
      event_id,
      label:         String(body.label).trim(),
      description:   body.description  ? String(body.description).trim()  : null,
      planned_at:    body.planned_at   ? String(body.planned_at)          : null,
      owner_email:   body.owner_email  ? String(body.owner_email).trim()  : null,
      status:        VALID_STATUSES.includes(body.status as CheckpointStatus) ? body.status as CheckpointStatus : "pending",
      display_order,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ checkpoint: data }, { status: 201 });
}

// PATCH /api/admin/events/[id]/checkpoints — update a checkpoint (id required in body)
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: event_id } = await params;
  const body = await req.json() as Record<string, unknown>;
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const db = getSupabaseServer();
  const allowed: Record<string, unknown> = {};

  if (body.label        !== undefined) allowed.label        = String(body.label).trim();
  if (body.description  !== undefined) allowed.description  = body.description  ? String(body.description).trim() : null;
  if (body.planned_at   !== undefined) allowed.planned_at   = body.planned_at   ? String(body.planned_at)         : null;
  if (body.actual_at    !== undefined) allowed.actual_at    = body.actual_at    ? String(body.actual_at)          : null;
  if (body.notes        !== undefined) allowed.notes        = body.notes        ? String(body.notes).trim()       : null;
  if (body.owner_email  !== undefined) allowed.owner_email  = body.owner_email  ? String(body.owner_email).trim() : null;
  if (body.display_order !== undefined) allowed.display_order = Number(body.display_order);
  if (body.status !== undefined && VALID_STATUSES.includes(body.status as CheckpointStatus)) {
    allowed.status = body.status;
    // Auto-set actual_at when marking done
    if (body.status === "done" && !body.actual_at) allowed.actual_at = new Date().toISOString();
  }

  if (Object.keys(allowed).length === 0) return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });

  const { data, error } = await db
    .from("event_checkpoints")
    .update(allowed)
    .eq("id", String(body.id))
    .eq("event_id", event_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Checkpoint not found" }, { status: 404 });
  return NextResponse.json({ checkpoint: data });
}

// DELETE /api/admin/events/[id]/checkpoints
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: event_id } = await params;
  const body = await req.json() as { id?: string };
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const db = getSupabaseServer();
  const { error } = await db
    .from("event_checkpoints")
    .delete()
    .eq("id", body.id)
    .eq("event_id", event_id);

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
