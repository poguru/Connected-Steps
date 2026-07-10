import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { sendSingleEmail } from "@/lib/email-service";

// Maximum auto-retry attempts for transient failures (ThrottlingException, network errors)
const MAX_ATTEMPTS = 3;

// Sends exactly ONE email from the batch queue.
// The admin UI calls this endpoint once per second to throttle sends.
// Each call is fast (<3s): auth + DB claim + send + DB update.
// When the queue is empty, returns { done: true } with final counts.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { batch_id } = await req.json() as { batch_id: string };
  if (!batch_id) return NextResponse.json({ error: "batch_id required" }, { status: 400 });

  const db = getSupabaseServer();

  // Atomically claim the next queued email (FOR UPDATE SKIP LOCKED prevents double-send)
  const { data: claimed, error: claimErr } = await db.rpc("claim_next_email", { p_batch_id: batch_id });
  if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 });

  type ClaimedRow = {
    id: string; recipient_email: string; recipient_name: string | null;
    subject: string; html_body: string; attempts: number;
  };
  const email = (claimed as ClaimedRow[] | null)?.[0];

  if (!email) {
    // Queue exhausted — finalize history record
    const { data: rows } = await db.from("email_queue").select("status").eq("batch_id", batch_id);
    const all       = rows ?? [];
    const delivered = all.filter(r => r.status === "delivered").length;
    const failed    = all.filter(r => r.status === "failed").length;
    void db.from("event_comm_history")
      .update({ sent: delivered, failed, status: delivered === 0 ? "failed" : "sent" })
      .eq("batch_id", batch_id);
    return NextResponse.json({ done: true, delivered, failed, total: all.length });
  }

  const result = await sendSingleEmail({
    to:      email.recipient_email,
    subject: email.subject,
    html:    email.html_body,
  });

  // Transient failures (network timeout, rate limit) are automatically
  // re-queued up to MAX_ATTEMPTS times. Permanent failures (invalid address)
  // are never retried.
  const willRetry  = !result.ok && result.isTransient === true && email.attempts < MAX_ATTEMPTS;
  const finalStatus = result.ok ? "delivered" : willRetry ? "queued" : "failed";

  await db.from("email_queue").update({
    status:         finalStatus,
    aws_message_id: result.messageId     ?? null,
    failure_reason: result.error         ?? null,
    failure_code:   result.errorCategory ?? null,
    is_permanent:   result.ok ? null : (result.isTransient === false ? true : false),
    provider:       result.provider      ?? null,
    http_status:    result.httpStatus    ?? null,
    sent_at:        result.ok ? new Date().toISOString() : null,
  }).eq("id", email.id);

  return NextResponse.json({
    done:           false,
    email:          email.recipient_email,
    status:         finalStatus,           // 'delivered' | 'queued' (retrying) | 'failed'
    aws_message_id: result.messageId      ?? null,
    error:          result.error          ?? null,
    error_code:     result.errorCategory  ?? null,
    is_permanent:   result.ok ? null : (result.isTransient === false ? true : false),
    attempts:       email.attempts,
    retrying:       willRetry,            // true = this email was re-queued for automatic retry
  });
}
