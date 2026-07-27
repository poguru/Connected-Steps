import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

const VALID_TYPES = [
  "text", "textarea", "select", "number", "date", "checkbox",
  "email", "phone", "radio", "multi_select", "address", "waiver", "signature", "file",
] as const;
type FieldType = typeof VALID_TYPES[number];

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
}

// GET /api/admin/events/[id]/form-fields
// Returns all form fields for the event, ordered by display_order.
export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getSupabaseServer();

  const { data, error } = await db
    .from("event_form_fields")
    .select("id, field_key, field_type, label, placeholder, help_text, required, options, display_order, is_active, created_at, conditions, default_value, max_length, validation_pattern, editable_after_reg, section")
    .eq("event_id", id)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ fields: data ?? [] });
}

// POST /api/admin/events/[id]/form-fields
// Creates a new form field.
// Body: { label, field_type?, field_key?, placeholder?, help_text?, required?, options? }
export async function POST(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: event_id } = await params;
  const body = await req.json() as Record<string, unknown>;

  if (!body.label || typeof body.label !== "string" || !body.label.trim()) {
    return NextResponse.json({ error: "label is required" }, { status: 400 });
  }
  const fieldType: FieldType = VALID_TYPES.includes(body.field_type as FieldType) ? (body.field_type as FieldType) : "text";
  const label     = String(body.label).trim();
  const fieldKey  = body.field_key ? String(body.field_key).trim() : slugify(label);

  if (!fieldKey) return NextResponse.json({ error: "Could not generate a valid field_key from the label" }, { status: 400 });

  const db = getSupabaseServer();

  // Verify event exists
  const { data: ev } = await db.from("events").select("id").eq("id", event_id).single();
  if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Determine display_order = max + 1
  const { data: maxRow } = await db
    .from("event_form_fields")
    .select("display_order")
    .eq("event_id", event_id)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const display_order = (maxRow?.display_order ?? -1) + 1;

  const options = Array.isArray(body.options)
    ? (body.options as unknown[]).filter(o => typeof o === "string").map(o => String(o).trim()).filter(Boolean)
    : [];

  const { data, error } = await db
    .from("event_form_fields")
    .insert({
      event_id,
      field_key:     fieldKey,
      field_type:    fieldType,
      label,
      placeholder:   body.placeholder ? String(body.placeholder).trim() : null,
      help_text:     body.help_text   ? String(body.help_text).trim()   : null,
      required:      body.required === true,
      options,
      display_order,
      is_active:     true,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: `A field with key "${fieldKey}" already exists. Choose a different label or key.` }, { status: 409 });
    return NextResponse.json({ error: "Database error: " + error.message }, { status: 500 });
  }

  return NextResponse.json({ field: data }, { status: 201 });
}

// PATCH /api/admin/events/[id]/form-fields
// Updates a field. Body must include id.
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: event_id } = await params;
  const body = await req.json() as Record<string, unknown>;

  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const db = getSupabaseServer();

  const allowed: Record<string, unknown> = {};
  if (body.label              !== undefined) allowed.label              = String(body.label).trim();
  if (body.field_type         !== undefined && VALID_TYPES.includes(body.field_type as FieldType)) allowed.field_type = body.field_type;
  if (body.placeholder        !== undefined) allowed.placeholder        = body.placeholder        ? String(body.placeholder).trim()        : null;
  if (body.help_text          !== undefined) allowed.help_text          = body.help_text          ? String(body.help_text).trim()          : null;
  if (body.required           !== undefined) allowed.required           = body.required           === true;
  if (body.is_active          !== undefined) allowed.is_active          = body.is_active          === true;
  if (body.editable_after_reg !== undefined) allowed.editable_after_reg = body.editable_after_reg !== false;
  if (body.display_order      !== undefined) allowed.display_order      = Number(body.display_order);
  if (body.max_length         !== undefined) allowed.max_length         = body.max_length != null ? Number(body.max_length) : null;
  if (body.default_value      !== undefined) allowed.default_value      = body.default_value      ? String(body.default_value)      : null;
  if (body.validation_pattern !== undefined) allowed.validation_pattern = body.validation_pattern ? String(body.validation_pattern) : null;
  if (body.section            !== undefined) allowed.section            = body.section            ? String(body.section).trim()     : null;
  if (body.conditions !== undefined && Array.isArray(body.conditions)) {
    allowed.conditions = body.conditions;
  }
  if (body.options !== undefined && Array.isArray(body.options)) {
    allowed.options = (body.options as unknown[]).filter(o => typeof o === "string").map(o => String(o).trim()).filter(Boolean);
  }

  if (Object.keys(allowed).length === 0) return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });

  const { data, error } = await db
    .from("event_form_fields")
    .update(allowed)
    .eq("id", String(body.id))
    .eq("event_id", event_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Field not found" }, { status: 404 });

  return NextResponse.json({ field: data });
}

// DELETE /api/admin/events/[id]/form-fields
// Body: { id }
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: event_id } = await params;
  const body = await req.json() as { id?: string };
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const db = getSupabaseServer();
  const { error } = await db
    .from("event_form_fields")
    .delete()
    .eq("id", body.id)
    .eq("event_id", event_id);

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
