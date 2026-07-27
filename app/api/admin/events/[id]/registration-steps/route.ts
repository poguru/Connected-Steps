import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

const VALID_STEP_TYPES = ["standard", "custom", "payment", "confirmation"] as const;
type StepType = typeof VALID_STEP_TYPES[number];

// GET /api/admin/events/[id]/registration-steps
// Returns all steps ordered by display_order.
export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();

  const { data, error } = await db
    .from("event_registration_steps")
    .select("id, step_key, label, description, display_order, is_visible, is_required, step_type, icon, field_scope, created_at")
    .eq("event_id", id)
    .order("display_order", { ascending: true });

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ steps: data ?? [] });
}

// POST /api/admin/events/[id]/registration-steps
// Body: { step_key, label, description?, step_type?, icon?, field_scope?, display_order? }
export async function POST(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: event_id } = await params;
  const body = await req.json() as Record<string, unknown>;

  if (!body.label || typeof body.label !== "string") {
    return NextResponse.json({ error: "label is required" }, { status: 400 });
  }

  const db = getSupabaseServer();
  const { data: ev } = await db.from("events").select("id").eq("id", event_id).single();
  if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Determine next display_order
  const { data: maxRow } = await db
    .from("event_registration_steps")
    .select("display_order")
    .eq("event_id", event_id)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const display_order = (maxRow?.display_order ?? -1) + 1;

  const stepType: StepType = VALID_STEP_TYPES.includes(body.step_type as StepType)
    ? (body.step_type as StepType) : "standard";

  // Auto-generate step_key if not provided
  const rawKey = body.step_key ? String(body.step_key).trim() : String(body.label).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);

  const { data, error } = await db
    .from("event_registration_steps")
    .insert({
      event_id,
      step_key:     rawKey,
      label:        String(body.label).trim(),
      description:  body.description ? String(body.description).trim() : null,
      display_order: typeof body.display_order === "number" ? body.display_order : display_order,
      is_visible:   body.is_visible !== false,
      is_required:  body.is_required !== false,
      step_type:    stepType,
      icon:         body.icon ? String(body.icon).trim() : "📋",
      field_scope:  Array.isArray(body.field_scope) ? (body.field_scope as string[]).filter(s => typeof s === "string") : [],
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: `A step with key "${rawKey}" already exists.` }, { status: 409 });
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  return NextResponse.json({ step: data }, { status: 201 });
}

// PATCH /api/admin/events/[id]/registration-steps
// Body must include id. Partial update of any field.
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: event_id } = await params;
  const body = await req.json() as Record<string, unknown>;
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const db = getSupabaseServer();
  const allowed: Record<string, unknown> = {};
  if (body.label        !== undefined) allowed.label        = String(body.label).trim();
  if (body.description  !== undefined) allowed.description  = body.description ? String(body.description).trim() : null;
  if (body.display_order !== undefined) allowed.display_order = Number(body.display_order);
  if (body.is_visible   !== undefined) allowed.is_visible   = body.is_visible === true;
  if (body.is_required  !== undefined) allowed.is_required  = body.is_required === true;
  if (body.step_type    !== undefined && VALID_STEP_TYPES.includes(body.step_type as StepType)) allowed.step_type = body.step_type;
  if (body.icon         !== undefined) allowed.icon         = body.icon ? String(body.icon).trim() : null;
  if (body.field_scope  !== undefined && Array.isArray(body.field_scope)) {
    allowed.field_scope = (body.field_scope as unknown[]).filter(s => typeof s === "string") as string[];
  }

  if (Object.keys(allowed).length === 0) return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });

  const { data, error } = await db
    .from("event_registration_steps")
    .update(allowed)
    .eq("id", String(body.id))
    .eq("event_id", event_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Step not found" }, { status: 404 });
  return NextResponse.json({ step: data });
}

// DELETE /api/admin/events/[id]/registration-steps
// Body: { id }
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: event_id } = await params;
  const body = await req.json() as { id?: string };
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const db = getSupabaseServer();
  const { error } = await db
    .from("event_registration_steps")
    .delete()
    .eq("id", body.id)
    .eq("event_id", event_id);

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
