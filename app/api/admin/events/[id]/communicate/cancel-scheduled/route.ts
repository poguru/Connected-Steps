import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// DELETE /api/admin/events/[id]/communicate/cancel-scheduled
// Body: { batch_id }
// Cancels a scheduled email batch — deletes queued rows and marks history as cancelled.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: eventId } = await params;

  const body    = await req.json().catch(() => ({})) as { batch_id?: string };
  const batchId = body.batch_id?.trim();
  if (!batchId) return NextResponse.json({ error: "batch_id is required" }, { status: 400 });

  const db = getSupabaseServer();

  // Verify the batch belongs to this event and is still scheduled
  const { data: hist } = await db
    .from("event_comm_history")
    .select("id, status")
    .eq("batch_id", batchId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (!hist) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  if (hist.status !== "scheduled")
    return NextResponse.json({ error: "Batch is not in scheduled state" }, { status: 409 });

  // Delete queued emails (only queued ones — don't affect any partially sent)
  await db.from("email_queue").delete().eq("batch_id", batchId).eq("status", "queued");

  // Mark history as cancelled
  await db.from("event_comm_history").update({ status: "cancelled" }).eq("batch_id", batchId);

  return NextResponse.json({ ok: true });
}
