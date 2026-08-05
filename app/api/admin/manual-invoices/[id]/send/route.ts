import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";
import { sendSingleEmail } from "@/lib/email-service";

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/manual-invoices/[id]/send
// Body: { to: string[], cc?: string[], bcc?: string[], subject: string, body_html: string }
export async function POST(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db   = getSupabaseServer();
  const body = await req.json() as {
    to:        string[];
    cc?:       string[];
    bcc?:      string[];
    subject:   string;
    body_html: string;
  };

  if (!body.to?.length) return NextResponse.json({ error: "At least one recipient required" }, { status: 400 });
  if (!body.subject)    return NextResponse.json({ error: "subject is required" }, { status: 400 });

  const { data: invoice } = await db.from("manual_invoices")
    .select("id, invoice_number, payment_status").eq("id", id).single();
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (invoice.payment_status === "cancelled") {
    return NextResponse.json({ error: "Cannot send a cancelled invoice" }, { status: 409 });
  }

  // Generate invoice HTML for the inline preview
  const htmlUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/admin/manual-invoices/${id}/html`;
  const emailHtml = body.body_html;

  // Send to all recipients
  let lastMessageId: string | null = null;
  let lastError: string | null = null;
  let allOk = true;

  for (const recipient of body.to) {
    const result = await sendSingleEmail({
      to:      recipient,
      subject: body.subject,
      html:    emailHtml,
      replyTo: undefined,
    });
    if (result.ok) {
      lastMessageId = result.messageId ?? null;
    } else {
      allOk = false;
      lastError = result.error ?? "Send failed";
    }
  }

  const status = allOk ? "sent" : "failed";

  // Log email
  await db.from("manual_invoice_email_logs").insert({
    invoice_id:    id,
    to_emails:     body.to,
    cc_emails:     body.cc   ?? null,
    bcc_emails:    body.bcc  ?? null,
    subject:       body.subject,
    status,
    message_id:    lastMessageId,
    failure_reason: lastError,
    sent_at:       allOk ? new Date().toISOString() : null,
    created_by:    "admin",
  });

  // Update invoice status
  if (allOk && invoice.payment_status === "draft") {
    await db.from("manual_invoices")
      .update({ payment_status: "sent" }).eq("id", id);
  }

  // History
  await db.from("manual_invoice_history").insert({
    invoice_id:  id,
    action:      allOk ? "email_sent" : "email_failed",
    description: `Invoice ${invoice.invoice_number} emailed to ${body.to.join(", ")}${allOk ? "" : ` — Error: ${lastError}`}`,
    actor:       "admin",
    metadata:    { to: body.to, cc: body.cc, subject: body.subject, htmlUrl },
  });

  if (!allOk) {
    return NextResponse.json({ error: lastError ?? "Send failed", partial: true }, { status: 500 });
  }

  return NextResponse.json({ sent: true, messageId: lastMessageId });
}
