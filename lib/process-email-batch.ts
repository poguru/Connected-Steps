import { getSupabaseServer } from "@/lib/supabase-server";
import { sendSingleEmail } from "@/lib/email-service";

const MAX_ATTEMPTS = 3;

// Processes all queued emails for a batch on the server side.
// Called via after() so it runs after the HTTP response is sent,
// independent of whether the admin keeps the browser tab open.
export async function processEmailBatch(batchId: string): Promise<void> {
  const db = getSupabaseServer();

  type ClaimedRow = {
    id: string; recipient_email: string; recipient_name: string | null;
    subject: string; html_body: string; attempts: number;
  };

  while (true) {
    const { data: claimed, error: claimErr } = await db.rpc("claim_next_email", { p_batch_id: batchId });
    if (claimErr) {
      console.error("[processEmailBatch] claim_next_email RPC failed:", claimErr.message, "batch:", batchId);
      break;
    }

    const email = (claimed as ClaimedRow[] | null)?.[0];

    if (!email) {
      // Queue exhausted — finalize history record
      const { data: rows } = await db.from("email_queue").select("status").eq("batch_id", batchId);
      const all       = rows ?? [];
      const delivered = all.filter(r => r.status === "delivered").length;
      const failed    = all.filter(r => r.status === "failed").length;
      const { error: histErr } = await db.from("event_comm_history")
        .update({ sent: delivered, failed, status: delivered === 0 ? "failed" : "sent" })
        .eq("batch_id", batchId);
      if (histErr) console.error("[processEmailBatch] history update failed:", histErr.message, "batch:", batchId);
      break;
    }

    const result = await sendSingleEmail({
      to:      email.recipient_email,
      subject: email.subject,
      html:    email.html_body,
    });

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
  }
}
