import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET — per-email status breakdown for a batch, plus campaign-level tracking fields.
// ?batch_id=   required
// ?include_all=true   include every email row (not just failures) for the detail view
// ?status=delivered|failed|queued|sending   optional filter when include_all is set
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  void params;

  const batch_id    = req.nextUrl.searchParams.get("batch_id");
  const includeAll  = req.nextUrl.searchParams.get("include_all") === "true";
  const statusFilter = req.nextUrl.searchParams.get("status");

  if (!batch_id) return NextResponse.json({ error: "batch_id required" }, { status: 400 });

  const db = getSupabaseServer();

  // Fetch queue rows and campaign record in parallel
  const [{ data, error }, { data: campaign }] = await Promise.all([
    db.from("email_queue")
      .select("status, failure_code, failure_reason, is_permanent, recipient_email, recipient_name, attempts, aws_message_id, sent_at, created_at, delivered_at, opened_at, clicked_at, bounce_type, bounce_reason")
      .eq("batch_id", batch_id)
      .order("created_at"),
    db.from("email_campaigns")
      .select("status, total_count, worker_last_seen_at, started_at")
      .eq("batch_id", batch_id)
      .maybeSingle(),
  ]);

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const rows      = data ?? [];
  const total     = rows.length;
  const queued    = rows.filter(r => r.status === "queued").length;
  const sending   = rows.filter(r => r.status === "sending").length;
  const delivered = rows.filter(r => r.status === "delivered").length;
  const failed    = rows.filter(r => r.status === "failed").length;
  const retryable = rows.filter(r => r.status === "failed" && r.is_permanent === false).length;
  const opened    = rows.filter(r => r.opened_at   != null).length;
  const clicked   = rows.filter(r => r.clicked_at  != null).length;
  const bounced   = rows.filter(r => r.bounce_type != null).length;

  const failures = rows
    .filter(r => r.status === "failed")
    .map(r => ({
      email:        r.recipient_email,
      error:        r.failure_reason,
      code:         r.failure_code,
      is_permanent: r.is_permanent,
      attempts:     r.attempts,
    }));

  // Full per-email list for the delivery detail view
  const emails = includeAll
    ? rows
        .filter(r => {
          if (!statusFilter || statusFilter === "all") return true;
          if (statusFilter === "opened")  return r.opened_at  != null;
          if (statusFilter === "clicked") return r.clicked_at != null;
          if (statusFilter === "bounced") return r.bounce_type != null;
          return r.status === statusFilter;
        })
        .map(r => ({
          email:          r.recipient_email,
          name:           r.recipient_name,
          status:         r.status,
          error:          r.failure_reason,
          code:           r.failure_code,
          is_permanent:   r.is_permanent,
          attempts:       r.attempts,
          aws_message_id: r.aws_message_id,
          sent_at:        r.sent_at,
          delivered_at:   r.delivered_at,
          opened_at:      r.opened_at,
          clicked_at:     r.clicked_at,
          bounce_type:    r.bounce_type,
          bounce_reason:  r.bounce_reason,
        }))
    : undefined;

  // Campaign-level fields (null when no campaign record exists, e.g. older batches)
  const campaignStatus     = campaign?.status ?? null;
  const workerLastSeenAt   = campaign?.worker_last_seen_at ?? null;
  const workerOffline      = workerLastSeenAt
    ? (Date.now() - new Date(workerLastSeenAt).getTime()) / 1000 > 120
    : campaignStatus === "running"; // running with no heartbeat = offline

  // ETA: estimated completion based on delivery rate since campaign started
  let eta: string | null = null;
  if (campaignStatus === "running" && campaign?.started_at && delivered > 0) {
    const ageMs  = Date.now() - new Date(campaign.started_at).getTime();
    const rate   = delivered / (ageMs / 1000); // emails per second
    const pending = queued + sending;
    if (rate > 0 && pending > 0) {
      eta = new Date(Date.now() + (pending / rate) * 1000).toISOString();
    }
  }

  return NextResponse.json({
    total, queued, sending, delivered, failed, retryable, opened, clicked, bounced,
    failures, emails,
    campaign_status:      campaignStatus,
    worker_last_seen_at:  workerLastSeenAt,
    worker_offline:       workerOffline,
    eta,
  });
}

// POST — re-queue transient failed emails for retry
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  void params;

  const { batch_id } = await req.json() as { batch_id: string };
  if (!batch_id) return NextResponse.json({ error: "batch_id required" }, { status: 400 });

  const db = getSupabaseServer();

  // Only re-queue non-permanent failures with < 5 total attempts
  const { error } = await db.from("email_queue")
    .update({ status: "queued" })
    .eq("batch_id", batch_id)
    .eq("status", "failed")
    .eq("is_permanent", false)
    .lt("attempts", 5);

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const { count } = await db
    .from("email_queue")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batch_id)
    .eq("status", "queued");

  return NextResponse.json({ requeued: count ?? 0 });
}
