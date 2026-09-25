import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/it-run-auth";

// Fields the admin is never allowed to change
const IMMUTABLE = new Set(["id", "slug", "created_at"]);

// Fields that require explicit confirm:true in the request body
const CRITICAL = new Set(["event_date", "registration_closes_at"]);

// Strip HTML/script tags and trim. Stored text must be plain text only.
function sanitize(val: unknown): unknown {
  if (typeof val !== "string") return val;
  return val.replace(/<[^>]*>/g, "").replace(/javascript:/gi, "").trim();
}

// Sanitize a full object recursively (one level — no nested objects expected)
function sanitizeBody(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (Array.isArray(v)) {
      out[k] = v.map(item => (typeof item === "string" ? sanitize(item) : item));
    } else {
      out[k] = sanitize(v);
    }
  }
  return out;
}

// GET /api/it-run/admin/event-settings
export async function GET(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseServer();
  const { data: event, error } = await db
    .from("it_run_events")
    .select("*")
    .eq("slug", "sprint-2")
    .single();

  if (error || !event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  return NextResponse.json({ event });
}

// PATCH /api/it-run/admin/event-settings
export async function PATCH(req: NextRequest) {
  const session = requireRole(req, ["event_admin"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rawBody = await req.json() as Record<string, unknown>;
  const { confirm, ...rest } = rawBody;

  // Strip immutable fields
  const stripped: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (!IMMUTABLE.has(k)) stripped[k] = v;
  }

  if (!Object.keys(stripped).length) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // Sanitize all text — no HTML or script tags allowed
  const editable = sanitizeBody(stripped);

  // Identify which critical fields are changing
  const criticalChanged = Object.keys(editable).filter(k => CRITICAL.has(k));
  if (criticalChanged.length > 0 && !confirm) {
    return NextResponse.json(
      { needsConfirm: true, criticalFields: criticalChanged },
      { status: 409 },
    );
  }

  const db = getSupabaseServer();

  // Fetch current values for audit log (old values)
  const { data: current } = await db
    .from("it_run_events")
    .select(Object.keys(editable).join(",") + ",id")
    .eq("slug", "sprint-2")
    .single<Record<string, unknown>>();

  const oldValues: Record<string, unknown> = {};
  if (current) {
    for (const k of Object.keys(editable)) {
      oldValues[k] = current[k] ?? null;
    }
  }

  // Perform the update
  const { data: ev, error } = await db
    .from("it_run_events")
    .update(editable)
    .eq("slug", "sprint-2")
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit log with old and new values
  db.from("it_run_audit_logs").insert({
    event_id:    ev?.id ?? null,
    actor_email: session.email,
    actor_role:  session.role,
    action:      "update_event",
    entity_type: "event",
    entity_id:   "sprint-2",
    detail: {
      updated_fields: Object.keys(editable),
      old_values:     oldValues,
      new_values:     editable,
    },
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true });
}
