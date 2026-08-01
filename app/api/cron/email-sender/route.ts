import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { sendSingleEmail } from "@/lib/email-service";
import { loadAttachmentsAsBase64, type AttachmentMeta } from "@/lib/email-attachments";

// Background worker — runs every minute via Vercel cron (maxDuration: 300s).
// Claims email_campaigns with status='running', sends emails in concurrent batches
// using claim_batch_emails (FOR UPDATE SKIP LOCKED — no double-sends).
// Closing the browser does NOT affect delivery: this worker runs on the server.

const BATCH_SIZE     = 5;   // emails sent concurrently per claim cycle
const WORKER_TIMEOUT = 275; // seconds before breaking the inner loop; leaves 25s buffer
const LOCK_TTL       = 120; // seconds after which a worker_locked_at is considered stale

export const maxDuration = 300;

type ClaimedEmail = {
  id:              string;
  recipient_email: string;
  recipient_name:  string | null;
  subject:         string;
  html_body:       string;
  attempts:        number;
  attachments:     AttachmentMeta[];
};

export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET) {
    if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const startMs = Date.now();
  const db      = getSupabaseServer();

  const { data: campaigns } = await db
    .from("email_campaigns")
    .select("id, batch_id, total_count, worker_locked_at")
    .eq("status", "running")
    .order("created_at");

  if (!campaigns?.length) {
    return NextResponse.json({ msg: "no active campaigns", elapsed: 0 });
  }

  let totalProcessed = 0;
  const log: string[] = [];

  for (const campaign of campaigns) {
    if ((Date.now() - startMs) / 1000 > WORKER_TIMEOUT) break;

    // Skip if another worker holds a fresh lock on this campaign
    if (campaign.worker_locked_at) {
      const lockAgeSecs = (Date.now() - new Date(campaign.worker_locked_at).getTime()) / 1000;
      if (lockAgeSecs < LOCK_TTL) {
        log.push(`skip ${campaign.batch_id.slice(0, 8)}: locked ${Math.round(lockAgeSecs)}s ago`);
        continue;
      }
    }

    // Claim worker lock; guard .eq("status","running") so we don't re-lock a paused campaign
    const now = new Date().toISOString();
    await db.from("email_campaigns")
      .update({ worker_locked_at: now, worker_last_seen_at: now })
      .eq("id", campaign.id)
      .eq("status", "running");

    // Load attachments once — same files go to every recipient in the batch
    const { data: histRow } = await db.from("event_comm_history")
      .select("attachments")
      .eq("batch_id", campaign.batch_id)
      .maybeSingle();
    const batchAttachments = await loadAttachmentsAsBase64(
      ((histRow?.attachments ?? []) as AttachmentMeta[])
    );

    log.push(`start ${campaign.batch_id.slice(0, 8)}`);

    // Inner loop: claim → send concurrently → update heartbeat → repeat
    while (true) {
      if ((Date.now() - startMs) / 1000 > WORKER_TIMEOUT) break;

      // Re-read campaign status — admin may have paused or cancelled
      const { data: fresh } = await db.from("email_campaigns")
        .select("status")
        .eq("id", campaign.id)
        .single();

      if (fresh?.status !== "running") {
        log.push(`halt ${campaign.batch_id.slice(0, 8)}: ${fresh?.status}`);
        break;
      }

      // Atomically mark BATCH_SIZE queued emails as 'sending'
      const { data: batch, error: claimErr } = await db.rpc("claim_batch_emails", {
        p_batch_id: campaign.batch_id,
        p_limit:    BATCH_SIZE,
      });

      if (claimErr) {
        log.push(`claim err ${campaign.batch_id.slice(0, 8)}: ${claimErr.message}`);
        break;
      }

      const emails = (batch as ClaimedEmail[] | null) ?? [];

      if (!emails.length) {
        // Queue exhausted — verify no rows remain in-flight before completing
        const { data: queueRows } = await db
          .from("email_queue")
          .select("status")
          .eq("batch_id", campaign.batch_id);

        const all     = queueRows ?? [];
        const pending = all.filter(r => r.status === "queued" || r.status === "sending").length;

        if (pending === 0) {
          const delivered = all.filter(r => r.status === "delivered").length;
          const failed    = all.filter(r => r.status === "failed").length;

          await Promise.all([
            db.from("email_campaigns").update({
              status:              "completed",
              completed_at:        new Date().toISOString(),
              worker_locked_at:    null,
              worker_last_seen_at: new Date().toISOString(),
            }).eq("id", campaign.id),
            db.from("event_comm_history")
              .update({ sent: delivered, failed, status: delivered === 0 ? "failed" : "sent" })
              .eq("batch_id", campaign.batch_id),
          ]);

          log.push(`done ${campaign.batch_id.slice(0, 8)}: ${delivered}ok ${failed}fail`);
        }
        break;
      }

      // Send all claimed emails concurrently; failures are isolated per-email
      await Promise.allSettled(
        emails.map(async (email) => {
          const atts = batchAttachments.length > 0
            ? batchAttachments
            : await loadAttachmentsAsBase64((email.attachments ?? []) as AttachmentMeta[]);

          const result = await sendSingleEmail({
            to:          email.recipient_email,
            subject:     email.subject,
            html:        email.html_body,
            attachments: atts.length > 0 ? atts : undefined,
          });

          const willRetry   = !result.ok && result.isTransient === true && email.attempts < 3;
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
        })
      );

      totalProcessed += emails.length;

      // Refresh worker heartbeat so concurrent invocations don't steal this campaign
      await db.from("email_campaigns").update({
        worker_locked_at:    new Date().toISOString(),
        worker_last_seen_at: new Date().toISOString(),
      }).eq("id", campaign.id);
    }
  }

  return NextResponse.json({
    processed: totalProcessed,
    elapsed:   Math.round((Date.now() - startMs) / 1000),
    log,
  });
}
