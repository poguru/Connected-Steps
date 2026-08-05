import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

const MAX_REQUEUE_ATTEMPTS = 5;

// PATCH /api/admin/events/[id]/announce/campaign
// Controls the lifecycle of an active email campaign.
// body: { batch_id: string; action: "pause" | "resume" | "cancel" | "retry" }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  void params;

  const body = await req.json() as { batch_id?: string; action?: string };
  const { batch_id, action } = body;

  if (!batch_id) return NextResponse.json({ error: "batch_id required" }, { status: 400 });
  if (!["pause", "resume", "cancel", "retry"].includes(action ?? "")) {
    return NextResponse.json({ error: "action must be pause, resume, cancel, or retry" }, { status: 400 });
  }

  const db = getSupabaseServer();
  const { data: campaign } = await db
    .from("email_campaigns")
    .select("id, status")
    .eq("batch_id", batch_id)
    .single();

  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const now = new Date().toISOString();

  if (action === "pause") {
    if (campaign.status !== "running") {
      return NextResponse.json({ error: `Cannot pause a campaign with status '${campaign.status}'` }, { status: 409 });
    }
    await db.from("email_campaigns")
      .update({ status: "paused", worker_locked_at: null })
      .eq("id", campaign.id);
    return NextResponse.json({ ok: true, status: "paused" });
  }

  if (action === "resume") {
    if (campaign.status !== "paused") {
      return NextResponse.json({ error: `Cannot resume a campaign with status '${campaign.status}'` }, { status: 409 });
    }
    await db.from("email_campaigns")
      .update({ status: "running", worker_locked_at: null })
      .eq("id", campaign.id);
    return NextResponse.json({ ok: true, status: "running" });
  }

  if (action === "cancel") {
    if (!["running", "paused"].includes(campaign.status)) {
      return NextResponse.json({ error: `Cannot cancel a campaign with status '${campaign.status}'` }, { status: 409 });
    }
    await db.from("email_campaigns")
      .update({ status: "cancelled", cancelled_at: now, worker_locked_at: null })
      .eq("id", campaign.id);

    // Mark remaining queued (unsent) emails as cancelled so they don't appear as pending
    await db.from("email_queue")
      .update({ status: "cancelled", failure_reason: "Campaign cancelled by admin" })
      .eq("batch_id", batch_id)
      .eq("status", "queued");

    return NextResponse.json({ ok: true, status: "cancelled" });
  }

  if (action === "retry") {
    // Re-queue transient failures and restart the campaign
    if (!["completed", "failed", "cancelled"].includes(campaign.status)) {
      return NextResponse.json({ error: `Cannot retry a campaign with status '${campaign.status}'` }, { status: 409 });
    }
    await db.from("email_queue")
      .update({ status: "queued" })
      .eq("batch_id", batch_id)
      .eq("status", "failed")
      .eq("is_permanent", false)
      .lt("attempts", MAX_REQUEUE_ATTEMPTS);

    await db.from("email_campaigns")
      .update({ status: "running", completed_at: null, cancelled_at: null, worker_locked_at: null })
      .eq("id", campaign.id);

    return NextResponse.json({ ok: true, status: "running" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
