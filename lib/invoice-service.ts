/**
 * Connected Steps — GST Invoice Service
 *
 * Generates GST-compliant invoices, stores them in the invoices table,
 * and sends them via email. Invoices are rendered as clean HTML that
 * users can print/save as PDF from any browser.
 */

import { getSupabaseServer } from "@/lib/supabase-server";
import { gstFromInclusive, getCurrentGSTRate } from "@/lib/gst";
import { sendSingleEmail } from "@/lib/email-service";
import { logger } from "@/lib/logger";

import { APP_URL, LOGO_URL, SUPPORT_EMAIL } from "@/lib/config";
// ── Business Constants ────────────────────────────────────────────────────────
export const CS_BUSINESS = {
  name:    "Connected Steps",
  gstin:   "36AAVFC9839Q1Z4",
  type:    "Partnership Firm",
  address: "SVR Homes, 3rd Floor, Plot No. 8-169,\nIndra Reddy Allwyn Colony, Miyapur,\nHyderabad, Telangana – 500049",
  email:   SUPPORT_EMAIL,
  phone:   "+91 97036 20570",
  website: APP_URL,
  logo:    LOGO_URL,
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

// ── HTML Invoice Template — Professional GST-Compliant Tax Invoice ────────────

function generateInvoiceHTML(inv: {
  invoiceNumber:  string;
  invoiceDate:    string;
  userName:       string;
  userEmail:      string;
  userPhone:      string;
  productName:    string;
  productType:    string;
  eventDate?:     string;
  eventVenue?:    string;
  paymentId:      string;
  orderId:        string;
  registrationId: string;
  subtotal:       number;
  gstPercentage:  number;
  gstAmount:      number;
  totalAmount:    number;
}): string {
  const b       = CS_BUSINESS;
  const appUrl = APP_URL;
  const fmt     = (n: number) => `₹${n.toFixed(2)}`;
  const inWords = amountInWords(inv.totalAmount);
  const typeLabel = inv.productType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  // Bill of Supply verification URL for QR code
  const verifyUrl = `${appUrl}/invoices/${encodeURIComponent(inv.invoiceNumber)}`;
  // Public QR code image (works in emails — not a data URL)
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&margin=4&data=${encodeURIComponent(verifyUrl)}`;

  // COMPOSITION SCHEME: total paid = total amount (no tax collected from customer)
  const totalAmt = inv.totalAmount;

  // Format address lines
  const addrParts = b.address.split("\n");

  // Service detail rows based on product type
  const serviceRows = inv.eventDate || inv.eventVenue ? `
    ${inv.eventDate  ? `<tr><td style="padding:5px 0;color:#666;font-size:11px;width:130px">Event Date</td><td style="padding:5px 0;font-size:11px;color:#222;font-weight:600">${inv.eventDate}</td></tr>` : ""}
    ${inv.eventVenue ? `<tr><td style="padding:5px 0;color:#666;font-size:11px">Venue</td><td style="padding:5px 0;font-size:11px;color:#222;font-weight:600">${inv.eventVenue}</td></tr>` : ""}
    ${inv.registrationId ? `<tr><td style="padding:5px 0;color:#666;font-size:11px">Registration ID</td><td style="padding:5px 0;font-size:11px;color:#e8620a;font-family:monospace">${inv.registrationId}</td></tr>` : ""}
  ` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Bill of Supply ${inv.invoiceNumber} — ${b.name}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#eef0f3;color:#1a1a1a;font-size:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{max-width:800px;margin:20px auto;background:#fff;box-shadow:0 2px 24px rgba(0,0,0,0.10);position:relative;page-break-inside:avoid}
  /* Orange top bar */
  .topbar{background:#e8620a;height:6px}
  .content{padding:36px 40px 28px}

  /* Header */
  .inv-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px}
  .brand{display:flex;align-items:center;gap:14px}
  .brand img{width:54px;height:54px;border-radius:50%;border:2px solid #e8620a}
  .brand-name{font-size:22px;font-weight:900;color:#1a1a1a;letter-spacing:-0.5px;line-height:1}
  .brand-type{font-size:10px;color:#888;margin-top:3px;text-transform:uppercase;letter-spacing:.1em}
  .brand-gstin{font-size:11px;color:#555;margin-top:6px;font-family:monospace;font-weight:600}
  .inv-badge{text-align:right}
  .inv-badge .title{font-size:26px;font-weight:900;color:#e8620a;letter-spacing:1px;line-height:1}
  .inv-badge .subtitle{font-size:10px;color:#888;letter-spacing:.15em;text-transform:uppercase;margin-top:2px}
  .inv-badge .num{font-size:13px;font-family:monospace;color:#333;margin-top:8px;font-weight:700}
  .inv-badge .date{font-size:11px;color:#888;margin-top:3px}

  /* Status banner */
  .status-bar{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;margin-bottom:24px}
  .status-paid{font-size:11px;font-weight:800;color:#16a34a;text-transform:uppercase;letter-spacing:.1em;display:flex;align-items:center;gap:6px}
  .status-details{font-size:11px;color:#555}

  /* Two-column grid */
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px}
  .info-box{border:1px solid #e5e5e5;border-radius:8px;overflow:hidden}
  .info-box-head{background:#f8f8f8;border-bottom:1px solid #e5e5e5;padding:8px 14px;font-size:9px;font-weight:800;color:#888;text-transform:uppercase;letter-spacing:.12em}
  .info-box-head.orange{background:#fff7f0;border-bottom-color:#fde8d2;color:#b8530a}
  .info-box-body{padding:12px 14px}
  .info-box-body .name{font-size:14px;font-weight:800;color:#1a1a1a;margin-bottom:4px}
  .info-box-body p{font-size:11px;color:#555;line-height:1.7}
  .info-box-body .gstin-tag{display:inline-block;background:#fff7f0;border:1px solid #fde8d2;color:#b8530a;font-family:monospace;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;margin-top:6px}

  /* Meta grid */
  .meta-section{margin-bottom:22px}
  .meta-section-title{font-size:9px;font-weight:800;color:#999;text-transform:uppercase;letter-spacing:.12em;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #f0f0f0}
  .meta-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
  .meta-item{background:#fafafa;border:1px solid #eeeeee;border-radius:6px;padding:8px 10px}
  .meta-label{font-size:9px;color:#aaa;text-transform:uppercase;letter-spacing:.08em}
  .meta-value{font-size:11px;color:#222;font-weight:700;margin-top:3px;word-break:break-all;font-family:monospace}
  .meta-value.normal{font-family:inherit;font-size:12px}

  /* Service details */
  .service-box{background:#fff7f0;border:1px solid #fde8d2;border-radius:8px;padding:14px 16px;margin-bottom:22px}
  .service-title{font-size:9px;font-weight:800;color:#b8530a;text-transform:uppercase;letter-spacing:.12em;margin-bottom:10px}
  .service-name{font-size:15px;font-weight:800;color:#1a1a1a;margin-bottom:8px}
  .service-type-badge{display:inline-block;background:#e8620a;color:#fff;font-size:9px;font-weight:700;padding:2px 8px;border-radius:20px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px}

  /* Line items table */
  .items-table{width:100%;border-collapse:collapse;margin-bottom:0}
  .items-table thead th{background:#1a1a1a;color:#fff;padding:9px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em}
  .items-table thead th:last-child{text-align:right}
  .items-table tbody td{padding:11px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;vertical-align:top;color:#333}
  .items-table tbody tr:last-child td{border-bottom:none}
  .items-table .desc-name{font-weight:700;color:#1a1a1a}
  .items-table .desc-sub{font-size:10px;color:#888;margin-top:2px}
  .items-table .tr,.items-table .amt{text-align:right}
  .items-table tfoot td{padding:9px 12px;font-size:12px}
  .items-table tfoot .lbl{text-align:right;color:#666}
  .items-table tfoot .amt{text-align:right;font-weight:600}
  .items-table tfoot .gst-row{background:#fff7f0}
  .items-table tfoot .gst-row .lbl{color:#b8530a}
  .items-table tfoot .gst-row .amt{color:#e8620a;font-weight:800}
  .items-table tfoot .total-row{background:#e8620a}
  .items-table tfoot .total-row td{font-size:14px;font-weight:900;color:#fff;padding:12px}

  /* Amount in words */
  .in-words{background:#f8f8f8;border:1px solid #e5e5e5;border-radius:6px;padding:9px 14px;margin-top:14px;font-size:11px;color:#555}
  .in-words strong{color:#1a1a1a}

  /* Signature + QR */
  .sig-qr{display:flex;justify-content:space-between;align-items:flex-end;margin-top:28px;padding-top:20px;border-top:1px solid #e5e5e5}
  .sig-block{text-align:left}
  .sig-line{display:block;width:160px;border-bottom:1.5px solid #333;height:44px;margin-bottom:4px}
  .sig-label{font-size:10px;color:#555;font-weight:600}
  .sig-sub{font-size:9px;color:#aaa;margin-top:2px}
  .qr-block{text-align:center}
  .qr-block img{width:90px;height:90px;border:1px solid #e5e5e5;border-radius:6px;display:block}
  .qr-caption{font-size:9px;color:#aaa;margin-top:4px}

  /* Terms */
  .terms{margin-top:20px;padding:12px 16px;background:#fafafa;border:1px solid #eee;border-radius:6px}
  .terms-title{font-size:9px;font-weight:800;color:#888;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px}
  .terms p{font-size:10px;color:#999;line-height:1.7}
  .terms li{font-size:10px;color:#999;line-height:1.7;margin-left:14px}

  /* Footer */
  .inv-footer{background:#1a1a1a;padding:14px 40px;display:flex;justify-content:space-between;align-items:center}
  .inv-footer .left{font-size:10px;color:#aaa;line-height:1.8}
  .inv-footer .left strong{color:#e8620a}
  .inv-footer .right{font-size:10px;color:#555;text-align:right}
  .watermark{font-size:10px;color:#bbb;font-style:italic;text-align:center;padding:8px;background:#f8f8f8;border-top:1px solid #e5e5e5}

  @media print{
    body{background:#fff}
    .page{margin:0;box-shadow:none;max-width:none}
  }
</style>
</head>
<body>
<div class="page">
  <div class="topbar"></div>
  <div class="content">

    <!-- HEADER -->
    <div class="inv-header">
      <div class="brand">
        <img src="${b.logo}" alt="${b.name}" onerror="this.style.display='none'" />
        <div>
          <div class="brand-name">${b.name}</div>
          <div class="brand-type">${b.type}</div>
          <div class="brand-gstin">GSTIN: ${b.gstin}</div>
          <div style="font-size:10px;color:#888;margin-top:3px">${addrParts[0]}, ${addrParts[1] ?? ""}</div>
          <div style="font-size:10px;color:#888">${addrParts.slice(2).join(", ")}</div>
        </div>
      </div>
      <div class="inv-badge">
        <div class="title">BILL OF SUPPLY</div>
        <div class="subtitle">Composition Taxable Person</div>
        <div class="num">${inv.invoiceNumber}</div>
        <div class="date">Date: ${inv.invoiceDate}</div>
        <div style="margin-top:8px;display:inline-block;background:#fff7f0;border:1px solid #fde8d2;border-radius:4px;padding:3px 10px;font-size:9px;font-weight:700;color:#b8530a;letter-spacing:.08em">Place of Supply: Telangana (36)</div>
      </div>
    </div>

    <!-- PAYMENT STATUS BANNER -->
    <div class="status-bar">
      <div class="status-paid">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
        PAYMENT RECEIVED — PAID
      </div>
      <div class="status-details">
        ${inv.paymentId ? `Payment ID: <strong>${inv.paymentId.slice(0,20)}…</strong>` : ""}
        &nbsp;·&nbsp; Currency: <strong>INR (₹)</strong>
        &nbsp;·&nbsp; Payment Date: <strong>${inv.invoiceDate}</strong>
      </div>
    </div>

    <!-- BILLED TO / FROM -->
    <div class="two-col">
      <div class="info-box">
        <div class="info-box-head">Billed To</div>
        <div class="info-box-body">
          <div class="name">${inv.userName}</div>
          <p>${inv.userEmail}</p>
          ${inv.userPhone ? `<p>${inv.userPhone}</p>` : ""}
        </div>
      </div>
      <div class="info-box">
        <div class="info-box-head orange">Supplier Details</div>
        <div class="info-box-body">
          <div class="name">${b.name}</div>
          <p>${addrParts.join(", ")}</p>
          <p style="margin-top:4px">${b.email} · ${b.phone}</p>
          <p><a href="${b.website}" style="color:#e8620a;text-decoration:none">${b.website}</a></p>
          <div class="gstin-tag">GSTIN: ${b.gstin}</div>
        </div>
      </div>
    </div>

    <!-- TRANSACTION REFERENCE -->
    <div class="meta-section">
      <div class="meta-section-title">Transaction Reference</div>
      <div class="meta-grid">
        <div class="meta-item"><div class="meta-label">Bill of Supply No.</div><div class="meta-value">${inv.invoiceNumber}</div></div>
        <div class="meta-item"><div class="meta-label">Date</div><div class="meta-value normal">${inv.invoiceDate}</div></div>
        <div class="meta-item"><div class="meta-label">Service Type</div><div class="meta-value normal">${typeLabel}</div></div>
        ${inv.orderId        ? `<div class="meta-item"><div class="meta-label">Order ID</div><div class="meta-value">${inv.orderId}</div></div>` : ""}
        ${inv.paymentId      ? `<div class="meta-item"><div class="meta-label">Payment ID</div><div class="meta-value">${inv.paymentId}</div></div>` : ""}
        ${inv.registrationId ? `<div class="meta-item"><div class="meta-label">Registration ID</div><div class="meta-value">${inv.registrationId}</div></div>` : ""}
      </div>
    </div>

    <!-- SERVICE DETAILS -->
    <div class="service-box">
      <div class="service-title">Service Details</div>
      <div class="service-type-badge">${typeLabel}</div>
      <div class="service-name">${inv.productName}</div>
      ${serviceRows ? `<table style="width:auto"><tbody>${serviceRows}</tbody></table>` : ""}
    </div>

    <!-- MANDATORY COMPOSITION SCHEME DECLARATION -->
    <div style="background:#fffbeb;border:1.5px solid #f59e0b;border-radius:7px;padding:10px 14px;margin-bottom:16px;display:flex;align-items:flex-start;gap:10px">
      <span style="font-size:16px;flex-shrink:0">⚠️</span>
      <div>
        <div style="font-size:10px;font-weight:800;color:#92400e;text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px">Statutory Declaration</div>
        <div style="font-size:11px;color:#78350f;font-weight:600;line-height:1.5">
          "Composition taxable person, not eligible to collect tax on supplies."
        </div>
      </div>
    </div>

    <!-- LINE ITEMS — Composition Scheme (no tax columns) -->
    <table class="items-table">
      <thead>
        <tr>
          <th style="width:32px">#</th>
          <th>Description of Service (SAC Code)</th>
          <th style="text-align:right;width:50px">Qty</th>
          <th style="text-align:right;width:120px">Rate (₹)</th>
          <th style="text-align:right;width:130px">Amount (₹)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>1</td>
          <td>
            <div class="desc-name">${inv.productName}</div>
            <div class="desc-sub">${typeLabel} · ${b.name}</div>
            <div class="desc-sub" style="margin-top:2px">SAC: 999723</div>
          </td>
          <td class="tr">1</td>
          <td class="amt">${totalAmt.toFixed(2)}</td>
          <td class="amt">${totalAmt.toFixed(2)}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr class="total-row">
          <td colspan="4" style="text-align:right;font-weight:900">Total Amount Payable</td>
          <td style="text-align:right;font-size:15px;font-weight:900">${fmt(totalAmt)}</td>
        </tr>
      </tfoot>
    </table>

    <!-- AMOUNT IN WORDS -->
    <div class="in-words">
      <strong>Amount in words:</strong> ${inWords} Only
    </div>

    <!-- SIGNATURE + QR -->
    <div class="sig-qr">
      <div class="sig-block">
        <span class="sig-line"></span>
        <div class="sig-label">Authorised Signatory</div>
        <div class="sig-sub">for ${b.name}</div>
      </div>
      <div class="qr-block">
        <img src="${qrUrl}" alt="Invoice QR" />
        <div class="qr-caption">Scan to verify Bill of Supply</div>
        <div class="qr-caption" style="margin-top:2px;color:#e8620a;font-weight:600">${inv.invoiceNumber}</div>
      </div>
    </div>

    <!-- TERMS -->
    <div class="terms">
      <div class="terms-title">Terms &amp; Conditions</div>
      <ul>
        <li>Payment has been received in full. This Bill of Supply is your official receipt.</li>
        <li>Connected Steps is registered under the GST Composition Scheme. No tax is charged to the customer separately.</li>
        <li>Refunds are subject to the Connected Steps Refund Policy. Contact ${b.email} for queries.</li>
        <li>For corrections, contact support within 7 days of the date of this document.</li>
        <li>This Bill of Supply is computer-generated and valid without a physical signature.</li>
      </ul>
    </div>

  </div><!-- /content -->

  <!-- FOOTER -->
  <div class="inv-footer">
    <div class="left">
      <strong>${b.name}</strong> · GSTIN: ${b.gstin}<br/>
      ${b.email} · ${b.phone} · <a href="${b.website}" style="color:#e8620a;text-decoration:none">${b.website}</a>
    </div>
    <div class="right">
      Bill of Supply: ${inv.invoiceNumber}<br/>
      Date: ${inv.invoiceDate}
    </div>
  </div>
  <div class="watermark">This is a computer-generated Bill of Supply and does not require a physical signature. · Composition taxable person — no tax collected on supplies. · Verify at ${verifyUrl}</div>

</div><!-- /page -->
</body>
</html>`;
}

// ── Amount in words helper ────────────────────────────────────────────────────

function amountInWords(amount: number): string {
  const ones = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  function toWords(n: number): string {
    if (n === 0) return "";
    if (n < 20)  return ones[n];
    if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? " " + ones[n%10] : "");
    if (n < 1000) return ones[Math.floor(n/100)] + " Hundred" + (n%100 ? " " + toWords(n%100) : "");
    if (n < 100000) return toWords(Math.floor(n/1000)) + " Thousand" + (n%1000 ? " " + toWords(n%1000) : "");
    if (n < 10000000) return toWords(Math.floor(n/100000)) + " Lakh" + (n%100000 ? " " + toWords(n%100000) : "");
    return toWords(Math.floor(n/10000000)) + " Crore" + (n%10000000 ? " " + toWords(n%10000000) : "");
  }
  const rupees = Math.floor(amount);
  const paise  = Math.round((amount - rupees) * 100);
  let result   = `Rupees ${toWords(rupees)}`;
  if (paise > 0) result += ` and ${toWords(paise)} Paise`;
  return result;
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
    if (existing) { logger.info("invoice", "Already exists for payment", { paymentId: input.paymentId, invoiceNumber: existing.invoice_number }); return existing as Invoice; }
  }
  if (input.registrationId) {
    const { data: existing } = await db.from("invoices").select("*").eq("registration_id", input.registrationId).maybeSingle();
    if (existing) { logger.info("invoice", "Already exists for registration", { registrationId: input.registrationId, invoiceNumber: existing.invoice_number }); return existing as Invoice; }
  }

  try {
    // COMPOSITION SCHEME: customer pays total amount, no tax breakdown shown.
    // subtotal = total_amount, gst_percentage = 0, gst_amount = 0
    // (Business pays composition tax to govt internally — not collected from customer)
    const totalAmt = input.totalPaidRupees;
    const today    = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

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
      subtotal:       totalAmt,   // same as total — composition scheme
      gst_percentage: 0,          // no tax collected from customer
      gst_amount:     0,
      total_amount:   totalAmt,
    }).select("*").single();

    if (error || !inv) { logger.error("invoice", "DB insert failed", { error: error?.message }); return null; }

    logger.info("invoice", "Bill of Supply created", { invoiceNumber: inv.invoice_number, email: input.userEmail });

    // Generate HTML
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
      subtotal:       totalAmt,
      gstPercentage:  0,
      gstAmount:      0,
      totalAmount:    totalAmt,
    });

    // Upload HTML to Supabase Storage (private bucket) instead of storing in DB column.
    // Fallback: if upload fails, store in invoice_html column so download still works.
    const storagePath = await uploadBillToStorage(db, inv.invoice_number, html);
    if (storagePath) {
      await db.from("invoices").update({ storage_path: storagePath }).eq("id", inv.id);
      logger.info("invoice", "Uploaded to storage", { storagePath });
    } else {
      // Fallback: store HTML in DB column (legacy path) so existing download flow works
      await db.from("invoices").update({ invoice_html: html }).eq("id", inv.id);
      logger.warn("invoice", "Storage upload failed — stored HTML in DB column", { invoiceNumber: inv.invoice_number });
    }

    // Send email with invoice link
    void sendInvoiceEmail(inv.id, inv.invoice_number, input, html);

    return inv as Invoice;
  } catch (e: unknown) {
    logger.error("invoice", "createAndSendInvoice failed", { error: String(e) });
    return null;
  }
}

async function uploadBillToStorage(
  db: ReturnType<typeof getSupabaseServer>,
  invoiceNumber: string,
  html: string,
): Promise<string | null> {
  try {
    const fileName = `${invoiceNumber}.html`;
    const { error } = await db.storage
      .from("bills-of-supply")
      .upload(fileName, Buffer.from(html, "utf-8"), {
        contentType: "text/html; charset=utf-8",
        upsert: true,
      });
    if (error) { logger.error("invoice", "Storage upload error", { error: error.message }); return null; }
    return fileName;
  } catch (e) {
    logger.error("invoice", "Storage upload exception", { error: String(e) });
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
  const appUrl = APP_URL;
  const viewUrl  = `${appUrl}/invoices/${encodeURIComponent(invoiceNumber)}`;

  const subject  = `Bill of Supply ${invoiceNumber} — ${input.productName}`;
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
    const result = await sendSingleEmail({
      to:      input.userEmail,
      subject,
      html:    emailHtml,
      attachments: [{
        name:      `${invoiceNumber}.html`,
        mime_type: "text/html",
        content:   Buffer.from(html, "utf-8").toString("base64"),
      }],
    });
    if (result.ok) {
      await db.from("invoices").update({
        invoice_status:       "sent",
        email_sent:           true,
        email_sent_at:        new Date().toISOString(),
        email_ses_message_id: result.messageId ?? null,
      }).eq("id", invoiceId);
      logger.info("invoice", "Email sent with attachment", { invoiceNumber, email: input.userEmail, messageId: result.messageId });
    } else {
      await db.from("invoices").update({ email_error: result.error ?? "unknown", email_retry_count: 1 }).eq("id", invoiceId);
      logger.error("invoice", "Email failed", { invoiceNumber, email: input.userEmail, error: result.error });
    }
  } catch (e) {
    logger.error("invoice", "Email exception", { invoiceNumber, error: String(e) });
  }
}
