/**
 * Connected Steps — GST Invoice Service
 *
 * Generates GST-compliant invoices, stores them in the invoices table,
 * and sends them via email. Invoices are rendered as clean HTML that
 * users can print/save as PDF from any browser.
 */

import { getSupabaseServer } from "@/lib/supabase-server";
import { gstFromInclusive, getCurrentGSTRate } from "@/lib/gst";
import { sendEmail } from "@/lib/notify";

// ── Business Constants ────────────────────────────────────────────────────────
export const CS_BUSINESS = {
  name:    "Connected Steps",
  gstin:   "36AAVFC9839Q1Z4",
  type:    "Partnership Firm",
  address: "SVR Homes, 3rd Floor, Plot No. 8-169,\nIndra Reddy Allwyn Colony, Miyapur,\nHyderabad, Telangana – 500049",
  email:   "info@connectedsteps.in",
  phone:   "+91 97036 20570",
  website: "https://www.connectedsteps.in",
  logo:    "https://www.connectedsteps.in/logo.png",
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InvoiceInput {
  userEmail:      string;
  userName:       string;
  userPhone?:     string;
  productName:    string;
  productType:    "event" | "membership" | "training_plan" | "coaching";
  totalPaidRupees: number;  // the actual amount the user paid (inclusive of GST)
  paymentId?:     string;
  orderId?:       string;
  registrationId?: string;
  membershipId?:  string;
  eventId?:       string;
  eventDate?:     string;
  eventVenue?:    string;
}

export interface Invoice {
  id:             string;
  invoice_number: string;
  user_email:     string;
  user_name:      string;
  product_name:   string;
  subtotal:       number;
  gst_percentage: number;
  gst_amount:     number;
  total_amount:   number;
  invoice_status: string;
  email_sent:     boolean;
  created_at:     string;
}

// ── HTML Invoice Template ─────────────────────────────────────────────────────

function generateInvoiceHTML(inv: {
  invoiceNumber: string;
  invoiceDate:   string;
  userName:      string;
  userEmail:     string;
  userPhone:     string;
  productName:   string;
  productType:   string;
  eventDate?:    string;
  eventVenue?:   string;
  paymentId:     string;
  orderId:       string;
  registrationId: string;
  subtotal:      number;
  gstPercentage: number;
  gstAmount:     number;
  totalAmount:   number;
}): string {
  const b = CS_BUSINESS;
  const fmt = (n: number) => `₹${n.toFixed(2)}`;
  const addrLines = b.address.split("\n").join("<br/>");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Invoice ${inv.invoiceNumber} — Connected Steps</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #f5f5f5; color: #1a1a1a; font-size: 13px; }
  .page { max-width: 794px; margin: 0 auto; background: #fff; padding: 48px; position: relative; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 3px solid #e8620a; }
  .logo-area { display: flex; align-items: center; gap: 14px; }
  .logo-area img { width: 52px; height: 52px; border-radius: 50%; }
  .company-name { font-size: 22px; font-weight: 800; color: #1a1a1a; line-height: 1; }
  .company-sub { font-size: 11px; color: #666; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.08em; }
  .invoice-title { text-align: right; }
  .invoice-title h1 { font-size: 28px; font-weight: 900; color: #e8620a; letter-spacing: -0.5px; }
  .invoice-title .inv-num { font-size: 13px; color: #555; margin-top: 4px; font-family: monospace; }
  .invoice-title .inv-date { font-size: 12px; color: #888; margin-top: 2px; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
  .box { background: #fafafa; border: 1px solid #e5e5e5; border-radius: 8px; padding: 16px 18px; }
  .box-title { font-size: 10px; font-weight: 700; color: #e8620a; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; }
  .box p { font-size: 12px; color: #333; line-height: 1.7; }
  .box .name { font-size: 14px; font-weight: 700; color: #1a1a1a; margin-bottom: 3px; }
  .box .gstin { font-family: monospace; font-size: 12px; color: #444; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  thead th { background: #1a1a1a; color: #fff; padding: 10px 14px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em; }
  tbody td { padding: 12px 14px; border-bottom: 1px solid #f0f0f0; font-size: 12px; vertical-align: top; }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:nth-child(even) td { background: #fafafa; }
  .totals-row td { padding: 8px 14px; font-size: 12px; }
  .totals-row.subtotal td { border-top: 1px solid #e5e5e5; }
  .totals-row.gst td { color: #555; }
  .totals-row.grand td { background: #fff8f4; font-weight: 700; font-size: 14px; border-top: 2px solid #e8620a; color: #e8620a; }
  .totals-right { text-align: right; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 28px; }
  .meta-item { background: #fafafa; border: 1px solid #eee; border-radius: 6px; padding: 8px 12px; }
  .meta-label { font-size: 10px; color: #999; text-transform: uppercase; letter-spacing: 0.07em; }
  .meta-value { font-size: 12px; color: #333; font-weight: 600; margin-top: 2px; word-break: break-all; }
  .stamp { margin: 24px 0; padding: 16px 20px; border: 1px dashed #c8e6c9; background: #f1f8e9; border-radius: 8px; display: flex; align-items: center; gap: 12px; }
  .stamp-icon { font-size: 24px; }
  .stamp-text { font-size: 12px; color: #2e7d32; font-weight: 600; }
  .stamp-sub { font-size: 11px; color: #555; margin-top: 2px; }
  .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e5e5; display: flex; justify-content: space-between; align-items: flex-end; }
  .footer-left { font-size: 11px; color: #888; line-height: 1.7; }
  .footer-right { text-align: right; font-size: 11px; color: #aaa; }
  .signature-box { text-align: right; margin-bottom: 24px; }
  .signature-box .sig-line { display: inline-block; width: 140px; border-bottom: 1px solid #333; margin-bottom: 4px; height: 40px; }
  .signature-box .sig-label { font-size: 11px; color: #555; }
  .terms { font-size: 10px; color: #999; line-height: 1.6; margin-top: 16px; }
  @media print {
    body { background: #fff; }
    .page { padding: 32px; box-shadow: none; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div class="logo-area">
      <img src="${b.logo}" alt="Connected Steps" onerror="this.style.display='none'" />
      <div>
        <div class="company-name">${b.name}</div>
        <div class="company-sub">${b.type}</div>
        <div class="gstin" style="margin-top:6px;">GSTIN: ${b.gstin}</div>
      </div>
    </div>
    <div class="invoice-title">
      <h1>INVOICE</h1>
      <div class="inv-num">${inv.invoiceNumber}</div>
      <div class="inv-date">Date: ${inv.invoiceDate}</div>
    </div>
  </div>

  <!-- Billed To / From -->
  <div class="two-col">
    <div class="box">
      <div class="box-title">Billed To</div>
      <div class="name">${inv.userName}</div>
      <p>${inv.userEmail}<br/>${inv.userPhone || ""}</p>
    </div>
    <div class="box">
      <div class="box-title">From</div>
      <div class="name">${b.name}</div>
      <p>${addrLines}</p>
      <p style="margin-top:6px">${b.email}<br/>${b.phone}</p>
    </div>
  </div>

  <!-- Transaction Details -->
  <div class="meta-grid">
    ${inv.paymentId ? `<div class="meta-item"><div class="meta-label">Payment ID</div><div class="meta-value">${inv.paymentId}</div></div>` : ""}
    ${inv.orderId   ? `<div class="meta-item"><div class="meta-label">Order ID</div><div class="meta-value">${inv.orderId}</div></div>` : ""}
    ${inv.registrationId ? `<div class="meta-item"><div class="meta-label">Registration ID</div><div class="meta-value">${inv.registrationId}</div></div>` : ""}
    ${inv.eventDate ? `<div class="meta-item"><div class="meta-label">Event Date</div><div class="meta-value">${inv.eventDate}</div></div>` : ""}
    ${inv.eventVenue ? `<div class="meta-item"><div class="meta-label">Venue</div><div class="meta-value">${inv.eventVenue}</div></div>` : ""}
    <div class="meta-item"><div class="meta-label">Category</div><div class="meta-value">${inv.productType.replace("_"," ").replace(/\b\w/g,c=>c.toUpperCase())}</div></div>
  </div>

  <!-- Line Items -->
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Description</th>
        <th style="text-align:right">Qty</th>
        <th style="text-align:right">Rate (₹)</th>
        <th style="text-align:right">Amount (₹)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td>
        <td>${inv.productName}</td>
        <td style="text-align:right">1</td>
        <td style="text-align:right">${inv.subtotal.toFixed(2)}</td>
        <td style="text-align:right">${inv.subtotal.toFixed(2)}</td>
      </tr>
    </tbody>
  </table>

  <!-- Totals -->
  <table>
    <tbody>
      <tr class="totals-row subtotal">
        <td colspan="4" class="totals-right" style="color:#555">Subtotal</td>
        <td style="text-align:right;width:130px">${fmt(inv.subtotal)}</td>
      </tr>
      <tr class="totals-row gst">
        <td colspan="4" class="totals-right">GST @ ${inv.gstPercentage}%</td>
        <td style="text-align:right">${fmt(inv.gstAmount)}</td>
      </tr>
      <tr class="totals-row grand">
        <td colspan="4" class="totals-right">Total Amount</td>
        <td style="text-align:right">${fmt(inv.totalAmount)}</td>
      </tr>
    </tbody>
  </table>

  <!-- Payment stamp -->
  <div class="stamp">
    <div class="stamp-icon">✅</div>
    <div>
      <div class="stamp-text">PAYMENT RECEIVED</div>
      <div class="stamp-sub">Amount of ${fmt(inv.totalAmount)} received. Thank you!</div>
    </div>
  </div>

  <!-- Signature -->
  <div class="signature-box">
    <div class="sig-line"></div>
    <div class="sig-label">Authorised Signatory — Connected Steps</div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div class="footer-left">
      <strong>${b.name}</strong> · GSTIN: ${b.gstin}<br/>
      ${b.address.replace(/\n/g, " · ")}<br/>
      ${b.email} · ${b.phone}
    </div>
    <div class="footer-right">
      ${inv.invoiceNumber}<br/>
      ${inv.invoiceDate}
    </div>
  </div>

  <div class="terms">
    This is a computer-generated invoice and does not require a physical signature. · GST is payable on reverse charge basis: No.
    For support, contact ${b.email} or call ${b.phone}. · ${b.website}
  </div>

</div>
</body>
</html>`;
}

// ── Core service ──────────────────────────────────────────────────────────────

/**
 * Creates an invoice for a successful payment, stores it, and sends it via email.
 * Never throws — invoice failure must not block the payment confirmation response.
 * Returns the invoice record or null if creation failed.
 */
export async function createAndSendInvoice(input: InvoiceInput): Promise<Invoice | null> {
  const db = getSupabaseServer();

  // Idempotency: if an invoice already exists for this payment, return it
  if (input.paymentId) {
    const { data: existing } = await db.from("invoices").select("*").eq("payment_id", input.paymentId).maybeSingle();
    if (existing) { console.log(`[invoice] already exists for payment ${input.paymentId}: ${existing.invoice_number}`); return existing as Invoice; }
  }
  if (input.registrationId) {
    const { data: existing } = await db.from("invoices").select("*").eq("registration_id", input.registrationId).maybeSingle();
    if (existing) { console.log(`[invoice] already exists for registration ${input.registrationId}: ${existing.invoice_number}`); return existing as Invoice; }
  }

  try {
    const gstRate   = await getCurrentGSTRate();
    const breakdown = gstFromInclusive(input.totalPaidRupees, gstRate);
    const today     = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

    // Insert invoice row — invoice_number generated by DB default
    const { data: inv, error } = await db.from("invoices").insert({
      user_email:     input.userEmail.toLowerCase(),
      user_name:      input.userName,
      user_phone:     input.userPhone ?? null,
      product_name:   input.productName,
      product_type:   input.productType,
      payment_id:     input.paymentId     ?? null,
      order_id:       input.orderId       ?? null,
      registration_id: input.registrationId ?? null,
      membership_id:  input.membershipId  ?? null,
      event_id:       input.eventId       ?? null,
      subtotal:       breakdown.subtotal,
      gst_percentage: breakdown.gstPercentage,
      gst_amount:     breakdown.gstAmount,
      total_amount:   breakdown.totalAmount,
    }).select("*").single();

    if (error || !inv) { console.error("[invoice] DB insert failed:", error?.message); return null; }

    console.log(`[invoice] created ${inv.invoice_number} for ${input.userEmail}`);

    // Generate HTML and store it
    const html = generateInvoiceHTML({
      invoiceNumber:  inv.invoice_number,
      invoiceDate:    today,
      userName:       input.userName,
      userEmail:      input.userEmail,
      userPhone:      input.userPhone ?? "",
      productName:    input.productName,
      productType:    input.productType,
      eventDate:      input.eventDate,
      eventVenue:     input.eventVenue,
      paymentId:      input.paymentId ?? "",
      orderId:        input.orderId   ?? "",
      registrationId: input.registrationId ?? "",
      subtotal:       breakdown.subtotal,
      gstPercentage:  breakdown.gstPercentage,
      gstAmount:      breakdown.gstAmount,
      totalAmount:    breakdown.totalAmount,
    });

    await db.from("invoices").update({ invoice_html: html }).eq("id", inv.id);

    // Send email with invoice link
    void sendInvoiceEmail(inv.id, inv.invoice_number, input, html);

    return inv as Invoice;
  } catch (e: unknown) {
    console.error("[invoice] createAndSendInvoice failed:", e);
    return null;
  }
}

async function sendInvoiceEmail(
  invoiceId:     string,
  invoiceNumber: string,
  input:         InvoiceInput,
  html:          string,
): Promise<void> {
  const db       = getSupabaseServer();
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.connectedsteps.in";
  const viewUrl  = `${appUrl}/invoices/${encodeURIComponent(invoiceNumber)}`;

  const subject  = `Invoice ${invoiceNumber} — ${input.productName}`;
  const emailHtml = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0a0a0a;color:#f0f0f0;border-radius:8px;">
      <div style="font-size:18px;font-weight:700;color:#e8620a;margin-bottom:4px;">Connected Steps</div>
      <div style="font-size:12px;color:#555;margin-bottom:20px;">GSTIN: 36AAVFC9839Q1Z4</div>
      <h2 style="color:#fff;font-size:16px;margin-bottom:8px;">Invoice ${invoiceNumber}</h2>
      <p style="color:#aaa;font-size:13px;margin-bottom:20px;">Hi ${input.userName}, your GST invoice is ready for ${input.productName}.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr><td style="padding:6px 0;color:#777;font-size:12px;">Product</td><td style="padding:6px 0;color:#ddd;font-size:12px;text-align:right">${input.productName}</td></tr>
        <tr><td style="padding:6px 0;color:#777;font-size:12px;">Total Paid</td><td style="padding:6px 0;color:#e8620a;font-weight:700;font-size:13px;text-align:right">₹${input.totalPaidRupees.toFixed(2)}</td></tr>
      </table>
      <a href="${viewUrl}" style="display:inline-block;padding:12px 28px;background:#e8620a;color:#fff;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;">View & Download Invoice →</a>
      <p style="font-size:11px;color:#555;margin-top:20px;">Or copy: ${viewUrl}</p>
      <hr style="border-color:rgba(255,255,255,0.08);margin:20px 0;"/>
      <p style="font-size:11px;color:#444;">Connected Steps · Hyderabad · info@connectedsteps.in · +91 97036 20570</p>
    </div>`;

  try {
    const result = await sendEmail(input.userEmail, input.userName, subject, emailHtml, false, true);
    if (result.ok) {
      await db.from("invoices").update({
        invoice_status:       "sent",
        email_sent:           true,
        email_sent_at:        new Date().toISOString(),
        email_ses_message_id: result.messageId ?? null,
      }).eq("id", invoiceId);
      console.log(`[invoice] email sent ${invoiceNumber} → ${input.userEmail} msgId=${result.messageId}`);
    } else {
      await db.from("invoices").update({ email_error: result.error ?? "unknown", email_retry_count: 1 }).eq("id", invoiceId);
      console.error(`[invoice] email FAILED ${invoiceNumber} → ${input.userEmail}: ${result.error}`);
    }
  } catch (e) {
    console.error(`[invoice] email exception for ${invoiceNumber}:`, e);
  }
}
