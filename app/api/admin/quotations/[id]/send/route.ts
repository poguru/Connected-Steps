import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/admin-auth";
import { sendSingleEmail } from "@/lib/email-service";
import { generateQuotationHtml } from "@/lib/quotation-html";
import { generatePdfBuffer, cachePdf } from "@/lib/pdf-generator";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/quotations/[id]/send
// Body: { to: string[], cc?: string[], bcc?: string[], subject: string, body?: string }
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

  if (!body.to?.length) return NextResponse.json({ error: "At least one recipient required" }, { status: 400 });
  if (!body.subject)    return NextResponse.json({ error: "Subject is required" }, { status: 400 });

  const { data: quo } = await db.from("quotations")
    .select("id, quotation_number, status, proposal_title, client_name, grand_total")
    .eq("id", id).single();
  if (!quo) return NextResponse.json({ error: "Quotation not found" }, { status: 404 });

  // Generate proposal HTML → PDF
  const proposalHtml = await generateQuotationHtml(id);
  if (!proposalHtml) return NextResponse.json({ error: "Proposal generation failed" }, { status: 500 });

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generatePdfBuffer(proposalHtml);
  } catch (err) {
    const msg = (err as Error).message ?? "Unknown error";
    const stack = (err as Error).stack ?? "";
    console.error("[Quotation/send] PDF generation failed:\n", stack);
    return NextResponse.json({ error: `PDF generation failed: ${msg}` }, { status: 500 });
  }

  // Cache PDF for download later
  cachePdf(db, `quotations/${id}.pdf`, pdfBuffer);

  const attachmentContent  = pdfBuffer.toString("base64");
  const attachmentFilename = `${quo.quotation_number}.pdf`;

  const plainText = body.body ?? "";
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? "https://connectedsteps.in";
  const viewUrl   = `${appUrl}/api/admin/quotations/${id}/html`;
  const safeText  = plainText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  const emailHtml = `
<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:#1a1a2e;line-height:1.75;max-width:600px;margin:0 auto">

  <!-- Header -->
  <div style="background:#1a1a2e;padding:20px 28px;border-radius:8px 8px 0 0">
    <div style="font-size:20px;font-weight:800;color:#e8620a;letter-spacing:-0.5px">Connected Steps</div>
    <div style="font-size:11px;color:#888;margin-top:2px">Event Management &amp; Sports Solutions</div>
  </div>

  <!-- Proposal banner -->
  <div style="background:#fff8f3;border:1px solid #ffd3b5;border-top:none;padding:16px 28px">
    <div style="font-size:12px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.08em">Proposal</div>
    <div style="font-size:18px;font-weight:800;color:#1a1a2e;margin:4px 0">${quo.proposal_title ?? quo.quotation_number}</div>
    <div style="font-size:13px;color:#555">${quo.quotation_number} &nbsp;·&nbsp; Prepared for <strong>${quo.client_name}</strong></div>
    <div style="margin-top:8px;font-size:22px;font-weight:800;color:#e8620a">₹${Number(quo.grand_total ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
  </div>

  <!-- Message body -->
  <div style="background:#ffffff;border:1px solid #e8e8f0;border-top:none;padding:24px 28px">
    <p style="margin:0 0 20px;color:#333;font-size:14px;line-height:1.75">${safeText}</p>

    <div style="margin:24px 0;text-align:center">
      <a href="${viewUrl}"
         style="display:inline-block;padding:13px 32px;background:#e8620a;color:#fff;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px">
        📄 View Proposal Online →
      </a>
    </div>

    <div style="background:#f8f9fc;border:1px solid #e8e8f0;border-radius:6px;padding:12px 16px;font-size:12px;color:#555">
      <strong style="color:#1a1a2e">📎 Attached:</strong> ${attachmentFilename}<br/>
      <span style="font-size:11px;color:#888">The proposal is attached as a PDF. You can also view it online using the button above.</span>
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
        mime_type: "application/pdf",
        name:      attachmentFilename,
      }],
    });
    if (result.ok) {
      lastMessageId = result.messageId ?? null;
    } else {
      allOk     = false;
      lastError = result.error ?? "Send failed";
      console.error(`[Quotation/send] to=${recipient} error=${lastError}`);
    }
  }

  const status = allOk ? "sent" : "failed";

  // Log
  await db.from("quotation_email_logs").insert({
    quotation_id:   id,
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

  // Advance status if still draft
  if (allOk && quo.status === "draft") {
    await db.from("quotations").update({ status: "sent", updated_at: new Date().toISOString() }).eq("id", id);
    await db.from("quotation_status_history").insert({
      quotation_id: id, from_status: "draft", to_status: "sent", actor: "admin",
    });
  }

  await db.from("quotation_history").insert({
    quotation_id: id,
    action:       allOk ? "email_sent" : "email_failed",
    description:  `Proposal ${quo.quotation_number} emailed to ${body.to.join(", ")}${allOk ? "" : ` — ${lastError}`}`,
    actor:        "admin",
    metadata:     { to: body.to, cc: ccList, subject: body.subject, attachment: attachmentFilename, error: lastError },
  });

  if (!allOk) {
    return NextResponse.json({ error: lastError ?? "Send failed" }, { status: 500 });
  }

  return NextResponse.json({ sent: true, messageId: lastMessageId, attachment: attachmentFilename });
}
