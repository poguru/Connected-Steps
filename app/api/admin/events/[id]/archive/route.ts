import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// POST /api/admin/events/[id]/archive
// Soft-archives a completed event. Sets status = 'archived'.
// Archived events are hidden from default listings but never deleted.
// Body: { action: 'archive' | 'restore' }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { action } = await req.json() as { action?: "archive" | "restore" };

  if (!["archive", "restore"].includes(action ?? "")) {
    return NextResponse.json({ error: "action must be 'archive' or 'restore'" }, { status: 400 });
  }

  const db = getSupabaseServer();

  const { data: ev } = await db.from("events").select("status").eq("id", id).single();
  if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  if (action === "archive" && ev.status === "archived")
    return NextResponse.json({ message: "Already archived", status: "archived" });

  if (action === "restore" && ev.status !== "archived")
    return NextResponse.json({ message: "Not archived", status: ev.status });

  const newStatus = action === "archive" ? "archived" : "draft";

  const { error } = await db.from("events").update({ status: newStatus }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit log
  void (async () => {
    try {
      await db.from("audit_logs").insert({
        action:     `event_${action}`,
        table_name: "events",
        record_id:  id,
        metadata:   { previous_status: ev.status, new_status: newStatus },
      });
    } catch { /* never block */ }
  })();

  return NextResponse.json({ success: true, status: newStatus });
}
