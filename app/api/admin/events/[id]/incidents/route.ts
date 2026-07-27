import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

const VALID_TYPES     = ["medical", "route", "traffic", "payment", "qr", "volunteer", "food", "technical", "other"] as const;
const VALID_PRIORITIES = ["low", "medium", "high", "critical"] as const;
const VALID_STATUSES  = ["open", "in_progress", "resolved", "closed"] as const;
type IncidentType     = typeof VALID_TYPES[number];
type IncidentPriority = typeof VALID_PRIORITIES[number];
type IncidentStatus   = typeof VALID_STATUSES[number];

// GET /api/admin/events/[id]/incidents
export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseServer();

  const { data, error } = await db
    .from("event_incidents")
    .select("id, title, incident_type, priority, status, description, resolution, owner_email, created_by, created_at, resolved_at")
    .eq("event_id", id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ incidents: data ?? [] });
}

// POST /api/admin/events/[id]/incidents
export async function POST(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: event_id } = await params;
  const body = await req.json() as Record<string, unknown>;

  if (!body.title || typeof body.title !== "string") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("event_incidents")
    .insert({
      event_id,
      title:         String(body.title).trim(),
      incident_type: VALID_TYPES.includes(body.incident_type as IncidentType)         ? body.incident_type as IncidentType         : "other",
      priority:      VALID_PRIORITIES.includes(body.priority as IncidentPriority)     ? body.priority as IncidentPriority     : "medium",
      status:        VALID_STATUSES.includes(body.status as IncidentStatus)           ? body.status as IncidentStatus         : "open",
      description:   body.description  ? String(body.description).trim()  : null,
      owner_email:   body.owner_email  ? String(body.owner_email).trim()  : null,
      created_by:    body.created_by   ? String(body.created_by).trim()   : null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ incident: data }, { status: 201 });
}

// PATCH /api/admin/events/[id]/incidents — body must include id
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: event_id } = await params;
  const body = await req.json() as Record<string, unknown>;
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const db = getSupabaseServer();
  const allowed: Record<string, unknown> = {};

  if (body.title       !== undefined) allowed.title       = String(body.title).trim();
  if (body.description !== undefined) allowed.description = body.description  ? String(body.description).trim()  : null;
  if (body.resolution  !== undefined) allowed.resolution  = body.resolution   ? String(body.resolution).trim()   : null;
  if (body.owner_email !== undefined) allowed.owner_email = body.owner_email  ? String(body.owner_email).trim()  : null;
  if (body.incident_type !== undefined && VALID_TYPES.includes(body.incident_type as IncidentType)) {
    allowed.incident_type = body.incident_type;
  }
  if (body.priority !== undefined && VALID_PRIORITIES.includes(body.priority as IncidentPriority)) {
    allowed.priority = body.priority;
  }
  if (body.status !== undefined && VALID_STATUSES.includes(body.status as IncidentStatus)) {
    allowed.status = body.status;
    if ((body.status === "resolved" || body.status === "closed") && !body.resolved_at) {
      allowed.resolved_at = new Date().toISOString();
    }
  }

  if (Object.keys(allowed).length === 0) return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });

  const { data, error } = await db
    .from("event_incidents")
    .update(allowed)
    .eq("id", String(body.id))
    .eq("event_id", event_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  return NextResponse.json({ incident: data });
}

// DELETE /api/admin/events/[id]/incidents
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: event_id } = await params;
  const body = await req.json() as { id?: string };
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const db = getSupabaseServer();
  const { error } = await db
    .from("event_incidents")
    .delete()
    .eq("id", body.id)
    .eq("event_id", event_id);

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
