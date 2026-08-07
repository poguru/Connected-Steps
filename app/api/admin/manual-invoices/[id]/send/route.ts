import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";
import { sendSingleEmail } from "@/lib/email-service";
import { generateManualInvoiceHtml } from "@/lib/manual-invoice-html";
import { generatePdfBuffer, cachePdf } from "@/lib/pdf-generator";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/manual-invoices/[id]/send
// Body: { to: string[], cc?: string[], bcc?: string[], subject: string, body: string }
export async function POST(req: NextRequest, { params }: Params) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getSupabaseServer();

  const body = await req.json() as {
    to:      string[];
    cc?:     string[];
    bcc?:    string[];
    subject: string;
    body?:   string;
  };

  // ── Validate ──────────────────────────────────────────────────────────────

  if (!body.to?.length)  return NextResponse.json({ error: "At least one recipient required" }, { status: 400 });
  if (!body.subject)     return NextResponse.json({ error: "Subject is required" }, { status: 400 });

  const { data: invoice } = await db.from("manual_invoices")
    .select("id, invoice_number, payment_status, client_name, grand_total")
    .eq("id", id).single();

  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (invoice.payment_status === "cancelled") {
    return NextResponse.json({ error: "Cannot send a cancelled invoice" }, { status: 409 });
  }

  // ── Generate invoice HTML and attach it ──────────────────────────────────

  const invoiceHtml = await generateManualInvoiceHtml(id);
  if (!invoiceHtml) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 500 });
  }

  let attachmentContent:  string;
  let attachmentFilename: string;
  let attachmentMime:     string;
  let pdfWarning:         string | null = null;

  try {
    const pdfBuffer = await generatePdfBuffer(invoiceHtml);
    cachePdf(db, `manual-invoices/${id}.pdf`, pdfBuffer);
    attachmentContent  = pdfBuffer.toString("base64");
    attachmentFilename = `${invoice.invoice_number}.pdf`;
    attachmentMime     = "application/pdf";
  } catch (err) {
    const msg = (err as Error).message ?? "Unknown error";
    console.error("[ManualInvoice/send] PDF failed, sending HTML fallback:", msg);
    pdfWarning         = msg;
    attachmentContent  = Buffer.from(invoiceHtml, "utf-8").toString("base64");
    attachmentFilename = `Invoice-${invoice.invoice_number}.html`;
    attachmentMime     = "text/html";
  }

  // ── Build email body ──────────────────────────────────────────────────────

  const plainText  = body.body ?? "";
  const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? "https://connectedsteps.in";
  const viewUrl    = `${appUrl}/api/admin/manual-invoices/${id}/html`;
  const safeText   = plainText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  const emailHtml = `
<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:#1a1a2e;line-height:1.75;max-width:600px;margin:0 auto">

  <!-- Header -->
  <div style="background:#1a1a2e;padding:20px 28px;border-radius:8px 8px 0 0">
    <div style="font-size:20px;font-weight:800;color:#e8620a;letter-spacing:-0.5px">Connected Steps</div>
    <div style="font-size:11px;color:#555;margin-top:2px">Invoice from Connected Steps Events</div>
  </div>

  <!-- Invoice summary banner -->
  <div style="background:#fff8f3;border:1px solid #ffd3b5;border-top:none;padding:16px 28px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
    <div>
      <div style="font-size:12px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.08em">Invoice</div>
      <div style="font-size:18px;font-weight:800;color:#1a1a2e">${invoice.invoice_number}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:12px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.08em">Amount Due</div>
      <div style="font-size:22px;font-weight:800;color:#e8620a">₹${Number(invoice.grand_total ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
    </div>
  </div>

  <!-- Message body -->
  <div style="background:#ffffff;border:1px solid #e8e8f0;border-top:none;padding:24px 28px">
    <p style="margin:0 0 20px;color:#333;font-size:14px;line-height:1.75">${safeText}</p>

    <!-- Download button -->
    <div style="margin:24px 0;text-align:center">
      <a href="${viewUrl}"
         style="display:inline-block;padding:13px 32px;background:#e8620a;color:#fff;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.02em">
        📄 View Invoice Online →
      </a>
    </div>

    <div style="background:#f8f9fc;border:1px solid #e8e8f0;border-radius:6px;padding:12px 16px;font-size:12px;color:#555">
      <strong style="color:#1a1a2e">📎 Attached:</strong> ${attachmentFilename}<br/>
      <span style="font-size:11px;color:#888">${pdfWarning ? "The invoice is attached as an HTML file (PDF temporarily unavailable). Open it in any web browser to view." : "The invoice is attached as a PDF. You can also view it online using the button above."}</span>
    </div>
  </div>

  <!-- Footer -->
  <div style="border:1px solid #e8e8f0;border-top:none;border-radius:0 0 8px 8px;padding:14px 28px;text-align:center">
    <p style="margin:0;font-size:11px;color:#aaa">
      Connected Steps Events &nbsp;·&nbsp; Hyderabad, Telangana<br/>
      <a href="${appUrl}" style="color:#e8620a;text-decoration:none">${appUrl}</a>
    </p>
  </div>

</div>`;

  // ── Send to all primary recipients ────────────────────────────────────────
  // Each "to" recipient gets their own email. CC and BCC are included in every send.

  const ccList  = (body.cc  ?? []).filter(Boolean);
  const bccList = (body.bcc ?? []).filter(Boolean);

  let lastMessageId: string | null = null;
  let lastError:     string | null = null;
  let allOk = true;

  for (const recipient of body.to) {
    const result = await sendSingleEmail({
      to:      recipient,
      cc:      ccList.length  ? ccList  : undefined,
      bcc:     bccList.length ? bccList : undefined,
      subject: body.subject,
      html:    emailHtml,
      attachments: [{
        content:   attachmentContent,
        mime_type: attachmentMime,
        name:      attachmentFilename,
      }],
    });

    if (result.ok) {
      lastMessageId = result.messageId ?? null;
    } else {
      allOk     = false;
      lastError = result.error ?? "Send failed";
      console.error(`[ManualInvoice/send] to=${recipient} error=${lastError}`);
    }
  }

  const status = allOk ? "sent" : "failed";

  // ── Log the send attempt ──────────────────────────────────────────────────

  await db.from("manual_invoice_email_logs").insert({
    invoice_id:     id,
    to_emails:      body.to,
    cc_emails:      ccList.length  ? ccList  : null,
    bcc_emails:     bccList.length ? bccList : null,
    subject:        body.subject,
    status,
    message_id:     lastMessageId,
    failure_reason: lastError,
    sent_at:        allOk ? new Date().toISOString() : null,
    created_by:     "admin",
  });

  // ── Update invoice status ─────────────────────────────────────────────────

  if (allOk && invoice.payment_status === "draft") {
    await db.from("manual_invoices")
      .update({ payment_status: "sent" }).eq("id", id);
  }

  // ── Audit trail ───────────────────────────────────────────────────────────

  await db.from("manual_invoice_history").insert({
    invoice_id:  id,
    action:      allOk ? "email_sent" : "email_failed",
    description: `Invoice ${invoice.invoice_number} emailed to ${body.to.join(", ")}${allOk ? "" : ` — Error: ${lastError}`}`,
    actor:       "admin",
    metadata:    {
      to:         body.to,
      cc:         ccList,
      subject:    body.subject,
      attachment: attachmentFilename,
      error:      lastError,
    },
  });

  if (!allOk) {
    return NextResponse.json(
      { error: lastError ?? "Send failed", detail: "Check failure_reason in email logs" },
      { status: 500 },
    );
  }

  return NextResponse.json({ sent: true, messageId: lastMessageId, attachment: attachmentFilename, ...(pdfWarning && { pdfWarning }) });
}
