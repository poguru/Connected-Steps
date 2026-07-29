import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

// GET /api/admin/campaigns/[id]/status
// Returns live delivery stats + per-recipient rows (paginated)
export async function GET(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id }       = await params;
  const { searchParams } = req.nextUrl;
  const limit  = Math.min(Number(searchParams.get("limit") ?? 100), 500);
  const offset = Number(searchParams.get("offset") ?? 0);
  const statusFilter = searchParams.get("status"); // queued|delivering|delivered|failed

  const db = getSupabaseServer();

  const { data: campaign } = await db.from("communication_campaigns")
    .select("id, status, batch_id, recipient_count, sent_count, failed_count, delivered_count, opened_count, clicked_count, bounced_count, queued_count")
    .eq("id", id).single();

  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let recipients = null;
  let total = 0;

  if (campaign.batch_id) {
    let q = db.from("email_queue")
      .select("id, recipient_email, recipient_name, status, attempts, failure_reason, failure_code, sent_at, opened_at, clicked_at, bounce_type", { count: "exact" })
      .eq("batch_id", campaign.batch_id)
      .order("created_at")
      .range(offset, offset + limit - 1);
    if (statusFilter) q = q.eq("status", statusFilter);

    const { data, count } = await q;
    recipients = data;
    total = count ?? 0;
  }

  return NextResponse.json({ campaign, recipients: recipients ?? [], total });
}

// POST /api/admin/campaigns/[id]/status/retry
// Retry all failed emails in this campaign's batch
export async function POST(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db     = getSupabaseServer();

  const { data: campaign } = await db.from("communication_campaigns")
    .select("batch_id").eq("id", id).single();
  if (!campaign?.batch_id) return NextResponse.json({ error: "No batch found" }, { status: 404 });

  const { data: updated } = await db.from("email_queue")
    .update({ status: "queued", attempts: 0, failure_reason: null, failure_code: null, is_permanent: false })
    .eq("batch_id", campaign.batch_id)
    .eq("status", "failed")
    .eq("is_permanent", false)
    .select("id");

  return NextResponse.json({ retried: updated?.length ?? 0 });
}
