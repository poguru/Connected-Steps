import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/campaigns/[id]/cancel
// Cancels all pending (queued) emails in a campaign without affecting already-sent rows.
export async function POST(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db     = getSupabaseServer();

  const { data: campaign } = await db.from("communication_campaigns")
    .select("id, status, batch_id").eq("id", id).single();

  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  if (!["draft", "sending", "scheduled", "queued"].includes(campaign.status)) {
    return NextResponse.json(
      { error: `Cannot cancel a campaign with status '${campaign.status}'` },
      { status: 409 },
    );
  }

  let cancelledCount = 0;

  if (campaign.batch_id) {
    // Cancel all queued email_queue rows for this batch
    const { data: cancelled } = await db.from("email_queue")
      .update({ status: "cancelled" })
      .eq("batch_id", campaign.batch_id)
      .eq("status", "queued")
      .select("id");

    cancelledCount = cancelled?.length ?? 0;

    // Update email_campaigns row if it exists
    await db.from("email_campaigns")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("batch_id", campaign.batch_id)
      .in("status", ["running", "paused"]);
  }

  await db.from("communication_campaigns")
    .update({ status: "cancelled" })
    .eq("id", id);

  return NextResponse.json({ cancelled: true, cancelledEmailCount: cancelledCount });
}
