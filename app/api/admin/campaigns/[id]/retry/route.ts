import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";
import { processCampaignBatch } from "@/lib/campaign-service";

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/campaigns/[id]/retry
// Re-queues only TRANSIENT failures (is_permanent = false) and triggers processing.
// Never retries permanent failures (bad addresses, bounces) or unsubscribes.
export async function POST(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db     = getSupabaseServer();

  const { data: campaign } = await db.from("communication_campaigns")
    .select("id, status, batch_id").eq("id", id).single();

  if (!campaign)            return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!campaign.batch_id)   return NextResponse.json({ error: "Campaign has no batch_id — never queued" }, { status: 400 });
  if (!["sent", "failed", "sending"].includes(campaign.status)) {
    return NextResponse.json(
      { error: `Retry is not applicable for campaigns with status '${campaign.status}'` },
      { status: 409 },
    );
  }

  const batchId = campaign.batch_id;

  // Reset only transient failures (is_permanent = false / NULL means unknown → retry)
  const { data: retried } = await db.from("email_queue")
    .update({ status: "queued", failure_reason: null, failure_code: null })
    .eq("batch_id", batchId)
    .eq("status", "failed")
    .or("is_permanent.is.null,is_permanent.eq.false")
    .select("id");

  const retriedCount = retried?.length ?? 0;

  if (!retriedCount) {
    return NextResponse.json({ retried: false, message: "No transient failures to retry" });
  }

  // Put campaign back to sending
  await db.from("communication_campaigns")
    .update({ status: "sending" }).eq("id", id);

  // Resume processing in the background
  after(() => processCampaignBatch(batchId));

  return NextResponse.json({ retried: true, retriedCount, batchId });
}
