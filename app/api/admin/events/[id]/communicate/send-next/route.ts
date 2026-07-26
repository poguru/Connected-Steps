import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdminOrCoach } from "@/lib/admin-auth";
import { sendSingleEmail } from "@/lib/email-service";
import { loadAttachmentsAsBase64, type AttachmentMeta } from "@/lib/email-attachments";

const MAX_ATTEMPTS = 3;

// Sends exactly ONE email from the batch queue.
// Called every 1.1s by the communicate page UI to drive delivery sequentially.
// Does NOT use claim_next_email RPC — uses direct DB queries to avoid RPC dependency.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminOrCoach(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { batch_id } = await req.json() as { batch_id: string };
  if (!batch_id) return NextResponse.json({ error: "batch_id required" }, { status: 400 });

  const db = getSupabaseServer();

  // Pick the oldest queued email in this batch.
  // Also re-pick emails stuck in "sending" for > 60s (covers Vercel timeouts).
  const { data: rows, error: selectErr } = await db
    .from("email_queue")
    .select("id, recipient_email, recipient_name, subject, html_body, attempts, status, attachments")
    .eq("batch_id", batch_id)
    .in("status", ["queued", "sending"])
    .order("created_at")
    .limit(1);

  if (selectErr) {
    console.error("[send-next] select failed:", selectErr.message, "batch:", batch_id);
    return NextResponse.json({ error: "Database error", detail: selectErr.message }, { status: 500 });
  }

  const email = rows?.[0] ?? null;

  if (!email) {
    // Queue exhausted — finalize history record
    const { data: allRows } = await db.from("email_queue").select("status").eq("batch_id", batch_id);
    const all       = allRows ?? [];
    const delivered = all.filter(r => r.status === "delivered").length;
    const failed    = all.filter(r => r.status === "failed").length;
    const { error: histErr } = await db.from("event_comm_history")
      .update({ sent: delivered, failed, status: delivered === 0 ? "failed" : "sent" })
      .eq("batch_id", batch_id);
    if (histErr) console.error("[send-next] history update failed:", histErr.message, "batch:", batch_id);
    return NextResponse.json({ done: true, delivered, failed, total: all.length });
  }

  // Mark as "sending" to prevent double-send if tab reloads mid-flight.
  // Guard: .eq("status", email.status) skips if already re-claimed by concurrent call.
  const { error: claimErr } = await db
    .from("email_queue")
    .update({ status: "sending", attempts: email.attempts + 1 })
    .eq("id", email.id)
    .eq("status", email.status);

  if (claimErr) {
    console.error("[send-next] claim failed:", claimErr.message, "id:", email.id);
    return NextResponse.json({ error: "Database error", detail: claimErr.message }, { status: 500 });
  }

  const emailAttachments = await loadAttachmentsAsBase64((email.attachments ?? []) as AttachmentMeta[]);
  const result = await sendSingleEmail({
    to:          email.recipient_email,
    subject:     email.subject,
    html:        email.html_body,
    attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
  });

  const attempts    = email.attempts + 1;
  const willRetry   = !result.ok && result.isTransient === true && attempts < MAX_ATTEMPTS;
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

  console.log(`[send-next] batch=${batch_id} to=${email.recipient_email} status=${finalStatus} attempt=${attempts}`);

  return NextResponse.json({
    done:         false,
    email:        email.recipient_email,
    status:       finalStatus,
    error:        result.error          ?? null,
    error_code:   result.errorCategory  ?? null,
    is_permanent: result.ok ? null : (result.isTransient === false ? true : false),
    attempts,
    retrying:     willRetry,
  });
}
