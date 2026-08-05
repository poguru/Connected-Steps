import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";
import { processCampaignBatch } from "@/lib/campaign-service";

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/campaigns/[id]/process
// Manually triggers processCampaignBatch for a stuck "sending" campaign.
// Safe to call multiple times — processCampaignBatch only picks up "queued" rows.
export async function POST(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db     = getSupabaseServer();

  const { data: campaign } = await db.from("communication_campaigns")
    .select("id, status, batch_id, queued_count")
    .eq("id", id)
    .single();

  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!campaign.batch_id) return NextResponse.json({ error: "No batch_id — campaign was never queued" }, { status: 400 });
  if (!["sending", "failed"].includes(campaign.status)) {
    return NextResponse.json({ error: `Cannot process a campaign with status '${campaign.status}'` }, { status: 409 });
  }

  const batchId = campaign.batch_id;

  // Count how many queued rows actually exist to give the caller useful feedback
  const { count: queuedCount } = await db.from("email_queue")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId)
    .eq("status", "queued");

  after(() => processCampaignBatch(batchId));

  return NextResponse.json({ started: true, batchId, queuedRows: queuedCount ?? 0 });
}
