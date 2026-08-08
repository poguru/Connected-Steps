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

  // Count queued rows
  const { data: queuedRows } = await db.from("email_queue")
    .select("id")
    .eq("batch_id", batchId)
    .eq("status", "queued");

  const queuedCount = queuedRows?.length ?? 0;

  if (queuedCount > 200) {
    // Large campaign: ensure email_campaigns row exists so the cron picks it up.
    // The initial send may have failed to insert it — this is self-healing.
    const { data: existing } = await db.from("email_campaigns")
      .select("id, status")
      .eq("batch_id", batchId)
      .maybeSingle();

    if (existing) {
      if (existing.status !== "running") {
        await db.from("email_campaigns")
          .update({ status: "running", worker_locked_at: null })
          .eq("id", existing.id);
      }
    } else {
      await db.from("email_campaigns").insert({
        batch_id:    batchId,
        status:      "running",
        total_count: queuedCount,
        created_by:  id,
      });
    }
    // Cron picks up within 60s — no after() needed
    return NextResponse.json({ started: true, batchId, queuedRows: queuedCount, via: "cron" });
  }

  // Small campaign: process inline after response
  after(() => processCampaignBatch(batchId));

  return NextResponse.json({ started: true, batchId, queuedRows: queuedCount, via: "inline" });
}
