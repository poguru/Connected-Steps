import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";

// GET — per-email status breakdown for a batch.
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
  const { data, error } = await db
    .from("email_queue")
    .select("status, failure_code, failure_reason, is_permanent, recipient_email, recipient_name, attempts, aws_message_id, sent_at, created_at")
    .eq("batch_id", batch_id)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows      = data ?? [];
  const total     = rows.length;
  const queued    = rows.filter(r => r.status === "queued").length;
  const sending   = rows.filter(r => r.status === "sending").length;
  const delivered = rows.filter(r => r.status === "delivered").length;
  const failed    = rows.filter(r => r.status === "failed").length;
  const retryable = rows.filter(r => r.status === "failed" && r.is_permanent === false).length;

  const failures = rows
    .filter(r => r.status === "failed")
    .map(r => ({
      email:         r.recipient_email,
      error:         r.failure_reason,
      code:          r.failure_code,
      is_permanent:  r.is_permanent,
      attempts:      r.attempts,
    }));

  // Full per-email list for the delivery detail view
  const emails = includeAll
    ? rows
        .filter(r => !statusFilter || r.status === statusFilter)
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
        }))
    : undefined;

  return NextResponse.json({ total, queued, sending, delivered, failed, retryable, failures, emails });
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { count } = await db
    .from("email_queue")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batch_id)
    .eq("status", "queued");

  return NextResponse.json({ requeued: count ?? 0 });
}
