import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string; vid: string }> };

// POST /api/admin/events/[id]/versions/[vid]/restore
// Restores an event to a historical snapshot.
// Registration data, payments, and participants are NEVER touched.
export async function POST(req: NextRequest, { params }: Params) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: event_id, vid } = await params;
  const db = getSupabaseServer();

  // Fetch the version
  const { data: version, error: vErr } = await db
    .from("event_versions")
    .select("id, version_number, snapshot, label")
    .eq("id", vid)
    .eq("event_id", event_id)
    .single();

  if (vErr || !version) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  const snapshot = version.snapshot as Record<string, unknown>;

  // Strip non-updatable fields from snapshot before writing
  const BLOCKED = new Set(["id", "created_at", "updated_at", "share_slug", "featured", "participant_count"]);
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(snapshot)) {
    if (!BLOCKED.has(k)) patch[k] = v;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Snapshot contains no restorable fields" }, { status: 422 });
  }

  const { error: upErr } = await db
    .from("events")
    .update(patch)
    .eq("id", event_id);

  if (upErr) return NextResponse.json({ error: "Database error" }, { status: 500 });

  // Audit
  void (async () => {
    try {
      await db.from("audit_logs").insert({
        action:     "event_version_restore",
        table_name: "events",
        record_id:  event_id,
        metadata:   { version_id: vid, version_number: version.version_number, label: version.label },
      });
    } catch { /* non-critical */ }
  })();

  return NextResponse.json({ ok: true, restored_version: version.version_number });
}
