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
    to:         string[];
    cc?:        string[];
    bcc?:       string[];
    subject:    string;
    body?:      string;       // plain text from textarea
    body_html?: string;       // pre-formatted HTML (takes precedence)
  };

  if (!body.to?.length) return NextResponse.json({ error: "At least one recipient required" }, { status: 400 });
  if (!body.subject)    return NextResponse.json({ error: "subject is required" }, { status: 400 });

  const { data: invoice } = await db.from("manual_invoices")
    .select("id, invoice_number, payment_status, client_name").eq("id", id).single();
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (invoice.payment_status === "cancelled") {
    return NextResponse.json({ error: "Cannot send a cancelled invoice" }, { status: 409 });
  }

  // Build email HTML — accept pre-built HTML or convert plain text
  const plainText = body.body ?? "";
  const emailHtml = body.body_html ?? [
    `<div style="font-family:Arial,sans-serif;font-size:14px;color:#333;line-height:1.75;max-width:580px;margin:0 auto">`,
    plainText
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>"),
    `<br><br><hr style="border:none;border-top:1px solid #eee;margin:20px 0">`,
    `<p style="font-size:11px;color:#999;margin:0">`,
    `This email was sent by Connected Steps Events. `,
    `<a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://connectedsteps.in"}/api/admin/manual-invoices/${id}/html" style="color:#e8620a">View invoice online</a>`,
    `</p></div>`,
  ].join("");

  const htmlUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/admin/manual-invoices/${id}/html`;

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
