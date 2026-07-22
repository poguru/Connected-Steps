import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// Default service definitions — shown even when no DB rows exist yet
const DEFAULT_SERVICES = [
  { service_name: "checkin",     label: "Check-In",     emoji: "✅", enabled: true,  display_order: 1 },
  { service_name: "tshirt",      label: "T-Shirts",     emoji: "👕", enabled: false, display_order: 2 },
  { service_name: "breakfast",   label: "Breakfast",    emoji: "🍽️", enabled: false, display_order: 3 },
  { service_name: "bib",         label: "BIB",          emoji: "🏷️", enabled: false, display_order: 4 },
  { service_name: "medal",       label: "Medals",       emoji: "🏅", enabled: false, display_order: 5 },
  { service_name: "certificate", label: "Certificates", emoji: "📜", enabled: false, display_order: 6 },
];

// GET /api/admin/events/[id]/service-config
// Returns current service configs merged with defaults.
export async function GET(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const db = getSupabaseServer();

  const { data: configs } = await db
    .from("event_service_configs")
    .select("service_name, enabled, config, display_order")
    .eq("event_id", eventId);

  type DbRow = { service_name: string; enabled: boolean; config: Record<string, unknown>; display_order: number };
  const configMap: Record<string, DbRow> = {};
  for (const c of configs ?? []) configMap[c.service_name] = c as DbRow;

  const merged = DEFAULT_SERVICES.map(def => {
    const stored = configMap[def.service_name];
    return {
      service_name:  def.service_name,
      label:         def.label,
      emoji:         def.emoji,
      enabled:       stored ? stored.enabled : def.enabled,
      display_order: stored ? stored.display_order : def.display_order,
      config:        stored?.config ?? {},
    };
  });

  return NextResponse.json({ services: merged });
}

// PUT /api/admin/events/[id]/service-config
// Body: { services: [{ service_name, enabled, display_order?, config? }] }
// Upserts all service configs in one call.
export async function PUT(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const body = await req.json().catch(() => ({})) as {
    services?: Array<{ service_name: string; enabled: boolean; display_order?: number; config?: Record<string, unknown> }>;
  };

  if (!Array.isArray(body.services) || body.services.length === 0) {
    return NextResponse.json({ error: "services array is required" }, { status: 400 });
  }

  const db = getSupabaseServer();
  const rows = body.services.map((s, i) => ({
    event_id:      eventId,
    service_name:  s.service_name,
    enabled:       s.enabled,
    display_order: s.display_order ?? i + 1,
    config:        s.config ?? {},
  }));

  const { error } = await db
    .from("event_service_configs")
    .upsert(rows, { onConflict: "event_id,service_name", ignoreDuplicates: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
