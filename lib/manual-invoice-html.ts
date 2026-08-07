/**
 * Shared HTML generation for manual GST invoices.
 * Used by:
 *   GET /api/admin/manual-invoices/[id]/html  — iframe preview + print-to-PDF
 *   POST /api/admin/manual-invoices/[id]/send — email attachment
 */

import { getSupabaseServer } from "@/lib/supabase-server";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function esc(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function fmtRupees(n: number | null | undefined): string {
  if (n == null) return "0.00";
  return Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDateInv(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const INVOICE_TYPE_LABELS: Record<string, string> = {
  tax_invoice: "TAX INVOICE",
  proforma:    "PROFORMA INVOICE",
  credit_note: "CREDIT NOTE",
  debit_note:  "DEBIT NOTE",
};

// ── Main generator ────────────────────────────────────────────────────────────

/**
 * Queries the DB and returns a self-contained HTML string for the invoice.
 * Returns null if the invoice is not found.
 */
export async function generateManualInvoiceHtml(id: string): Promise<string | null> {
  const db = getSupabaseServer();

  const [invRes, itemsRes, settingsRes] = await Promise.all([
    db.from("manual_invoices").select("*").eq("id", id).single(),
    db.from("manual_invoice_items").select("*").eq("invoice_id", id).order("sort_order"),
    db.from("billing_settings").select("*").eq("id", 1).single(),
  ]);

  if (!invRes.data) return null;

  const inv   = invRes.data;
  const items = itemsRes.data ?? [];
  const org   = settingsRes.data;

  const typeLabel       = INVOICE_TYPE_LABELS[inv.invoice_type] ?? "TAX INVOICE";
  const isCreditOrDebit = ["credit_note", "debit_note"].includes(inv.invoice_type);

  const itemsHtml = items.map((it: Record<string, unknown>, i: number) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td>${esc(it.description)}${it.unit ? `<span class="unit"> (${esc(it.unit)})</span>` : ""}</td>
      <td class="c">${Number(it.quantity).toLocaleString("en-IN")}</td>
      <td class="r">₹${fmtRupees(it.rate as number)}</td>
      <td class="c">${Number(it.discount_pct) > 0 ? `${it.discount_pct}%` : "—"}</td>
      <td class="c">${it.gst_pct}%</td>
      <td class="r num">₹${fmtRupees(it.amount as number)}</td>
    </tr>
  `).join("");

  const hasDiscount = Number(inv.discount_amount) > 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(typeLabel)} ${esc(inv.invoice_number)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 11px;
    color: #1a1a2e;
    background: #fff;
    line-height: 1.45;
  }
  .page {
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    padding: 14mm 14mm 16mm;
    position: relative;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 3px solid #e8620a;
  }
  .org-logo img { height: 52px; object-fit: contain; }
  .org-logo-text { font-size: 22px; font-weight: 800; color: #e8620a; letter-spacing: -0.5px; }
  .org-details { font-size: 10px; color: #555; margin-top: 4px; line-height: 1.6; }
  .invoice-meta { text-align: right; }
  .inv-type-badge {
    display: inline-block;
    background: #e8620a; color: #fff;
    font-size: 12px; font-weight: 700;
    letter-spacing: 0.08em;
    padding: 5px 14px; border-radius: 4px;
    margin-bottom: 10px;
  }
  .inv-number { font-size: 18px; font-weight: 800; color: #1a1a2e; }
  .inv-dates { font-size: 10px; color: #555; margin-top: 6px; line-height: 1.8; }
  .inv-dates strong { color: #1a1a2e; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 18px; }
  .party-box { padding: 12px 14px; border: 1px solid #e8e8f0; border-radius: 6px; background: #fafafa; }
  .party-label { font-size: 9px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #e8620a; margin-bottom: 6px; }
  .party-name { font-size: 13px; font-weight: 700; color: #1a1a2e; }
  .party-company { font-size: 11px; font-weight: 600; color: #333; margin-bottom: 2px; }
  .party-meta { font-size: 10px; color: #555; line-height: 1.7; }
  .gst-highlight { display: inline-block; background: #fff3e0; border: 1px solid #ffb74d; font-size: 10px; font-weight: 700; color: #e65100; padding: 2px 8px; border-radius: 3px; margin-top: 4px; }
  .refs { display: flex; gap: 16px; margin-bottom: 16px; font-size: 10px; color: #555; }
  .refs .ref-item strong { color: #1a1a2e; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
  thead th { background: #1a1a2e; color: #fff; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 8px 8px; }
  tbody tr { border-bottom: 1px solid #eef0f5; }
  tbody tr:nth-child(even) td { background: #f7f8fc; }
  tbody td { padding: 7px 8px; font-size: 11px; color: #333; vertical-align: top; }
  tfoot td { padding: 6px 8px; }
  .c { text-align: center; }
  .r { text-align: right; }
  .num { font-variant-numeric: tabular-nums; }
  .unit { color: #888; font-size: 9.5px; }
  .totals-wrap { display: grid; grid-template-columns: 1fr 240px; gap: 16px; margin-top: 0; align-items: start; }
  .notes-box { font-size: 10px; color: #555; line-height: 1.7; padding: 12px 14px; border: 1px solid #e8e8f0; border-radius: 6px; }
  .notes-box strong { color: #1a1a2e; font-size: 10px; display: block; margin-bottom: 3px; }
  .totals-table { width: 100%; border-collapse: collapse; }
  .totals-table td { padding: 5px 8px; font-size: 11px; }
  .totals-table .tot-label { color: #555; }
  .totals-table .tot-val { text-align: right; font-variant-numeric: tabular-nums; }
  .totals-table .grand-row td { background: #1a1a2e; color: #fff; font-size: 13px; font-weight: 800; padding: 8px 10px; border-radius: 4px; }
  .totals-table .gst-row td { color: #e8620a; font-weight: 600; }
  .divider { border: none; border-top: 1px solid #eef0f5; margin: 2px 0; }
  .amount-words { margin-top: 10px; padding: 8px 12px; background: #fff8f3; border: 1px solid #ffd3b5; border-radius: 4px; font-size: 10px; color: #4a2700; }
  .bank-sig { display: grid; grid-template-columns: 1fr auto; gap: 16px; margin-top: 16px; align-items: end; }
  .bank-box { padding: 12px 14px; border: 1px solid #e8e8f0; border-radius: 6px; background: #fafafa; }
  .bank-label { font-size: 9px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #e8620a; margin-bottom: 6px; }
  .bank-row { display: flex; gap: 6px; font-size: 10px; margin-bottom: 3px; }
  .bank-key { color: #888; min-width: 80px; }
  .bank-val { font-weight: 600; color: #1a1a2e; }
  .upi-row { margin-top: 6px; display: flex; align-items: center; gap: 10px; }
  .upi-label { font-size: 10px; color: #555; }
  .upi-id { font-size: 11px; font-weight: 700; color: #1a1a2e; }
  .sig-box { text-align: center; min-width: 140px; }
  .sig-box img { height: 48px; object-fit: contain; display: block; margin: 0 auto 6px; }
  .sig-line { border-top: 1px solid #1a1a2e; padding-top: 6px; font-size: 10px; font-weight: 700; color: #1a1a2e; }
  .sig-sub { font-size: 9px; color: #888; margin-top: 2px; }
  .footer { margin-top: 18px; padding-top: 10px; border-top: 1px solid #e8e8f0; text-align: center; font-size: 9px; color: #aaa; letter-spacing: 0.04em; }
  .status-badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 9px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; margin-left: 10px; }
  .status-paid     { background: #e8f5e9; color: #2e7d32; border: 1px solid #a5d6a7; }
  .status-draft    { background: #f3f4f6; color: #6b7280; border: 1px solid #d1d5db; }
  .status-overdue  { background: #fef2f2; color: #991b1b; border: 1px solid #fca5a5; }
  .status-sent     { background: #eff6ff; color: #1d4ed8; border: 1px solid #93c5fd; }
  .status-cancelled { background: #f3f4f6; color: #6b7280; border: 1px solid #d1d5db; text-decoration: line-through; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { width: 100%; padding: 10mm 10mm 12mm; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
<div class="page">

  <div class="header">
    <div>
      ${org?.logo_url
        ? `<div class="org-logo"><img src="${esc(org.logo_url)}" alt="${esc(org?.org_name)}"/></div>`
        : `<div class="org-logo-text">${esc(org?.org_name ?? "Connected Steps")}</div>`
      }
      <div class="org-details">
        ${org?.address ? esc(org.address) + "<br/>" : ""}
        ${org?.city ? esc(org.city) + (org?.state ? ", " + esc(org.state) : "") + (org?.pincode ? " – " + esc(org.pincode) : "") + "<br/>" : ""}
        ${org?.phone ? "📞 " + esc(org.phone) + "<br/>" : ""}
        ${org?.email ? "✉ " + esc(org.email) + "<br/>" : ""}
        ${org?.website ? esc(org.website) : ""}
        ${org?.gst_number ? "<br/>GSTIN: " + esc(org.gst_number) : ""}
      </div>
    </div>
    <div class="invoice-meta">
      <div class="inv-type-badge">${esc(typeLabel)}</div>
      <div class="inv-number"># ${esc(inv.invoice_number)}</div>
      ${inv.payment_status ? `<span class="status-badge status-${inv.payment_status}">${esc(inv.payment_status)}</span>` : ""}
      <div class="inv-dates">
        <strong>Invoice Date:</strong> ${fmtDateInv(inv.invoice_date)}<br/>
        ${inv.due_date ? `<strong>Due Date:</strong> ${fmtDateInv(inv.due_date)}<br/>` : ""}
        ${inv.place_of_supply ? `<strong>Place of Supply:</strong> ${esc(inv.place_of_supply)}<br/>` : ""}
        ${inv.service_period ? `<strong>Service Period:</strong> ${esc(inv.service_period)}` : ""}
      </div>
    </div>
  </div>

  <div class="parties">
    <div class="party-box">
      <div class="party-label">Bill To</div>
      ${inv.company_name ? `<div class="party-company">${esc(inv.company_name)}</div>` : ""}
      <div class="party-name">${esc(inv.client_name)}</div>
      <div class="party-meta">
        ${inv.client_email ? `✉ ${esc(inv.client_email)}<br/>` : ""}
        ${inv.client_phone ? `📞 ${esc(inv.client_phone)}<br/>` : ""}
        ${inv.billing_address ? esc(inv.billing_address) + "<br/>" : ""}
        ${inv.client_state ? esc(inv.client_state) + (inv.client_pincode ? " – " + esc(inv.client_pincode) : "") + "<br/>" : ""}
        ${inv.client_country && inv.client_country !== "India" ? esc(inv.client_country) + "<br/>" : ""}
        ${inv.client_pan ? `PAN: <strong>${esc(inv.client_pan)}</strong><br/>` : ""}
      </div>
      ${inv.client_gst ? `<span class="gst-highlight">GSTIN: ${esc(inv.client_gst)}</span>` : ""}
    </div>
    <div class="party-box">
      <div class="party-label">From (Supplier)</div>
      <div class="party-name">${esc(org?.org_name ?? "Connected Steps")}</div>
      <div class="party-meta">
        ${org?.address ? esc(org.address) + "<br/>" : ""}
        ${org?.city ? esc(org.city) + (org?.state ? ", " + esc(org.state) : "") + "<br/>" : ""}
        ${org?.phone ? `📞 ${esc(org.phone)}<br/>` : ""}
        ${org?.email ? `✉ ${esc(org.email)}<br/>` : ""}
        ${org?.pan_number ? `PAN: <strong>${esc(org.pan_number)}</strong><br/>` : ""}
      </div>
      ${org?.gst_number ? `<span class="gst-highlight">GSTIN: ${esc(org.gst_number)}</span>` : ""}
    </div>
  </div>

  ${(inv.po_number || inv.quotation_ref || inv.project_name) ? `
  <div class="refs">
    ${inv.po_number     ? `<span class="ref-item"><strong>PO #:</strong> ${esc(inv.po_number)}</span>` : ""}
    ${inv.quotation_ref ? `<span class="ref-item"><strong>Quotation Ref:</strong> ${esc(inv.quotation_ref)}</span>` : ""}
    ${inv.project_name  ? `<span class="ref-item"><strong>Project:</strong> ${esc(inv.project_name)}</span>` : ""}
  </div>` : ""}

  <table>
    <thead>
      <tr>
        <th class="c" style="width:32px">#</th>
        <th>Description</th>
        <th class="c" style="width:52px">Qty</th>
        <th class="r" style="width:80px">Rate</th>
        <th class="c" style="width:52px">Disc%</th>
        <th class="c" style="width:48px">GST%</th>
        <th class="r" style="width:88px">Amount</th>
      </tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
  </table>

  <div class="totals-wrap" style="margin-top:0; border-top: 2px solid #1a1a2e;">
    <div class="notes-box" style="margin-top:12px;">
      ${inv.customer_notes
        ? `<strong>Notes to Client</strong>${esc(inv.customer_notes)}`
        : inv.thank_you_message
          ? `<strong>Message</strong>${esc(inv.thank_you_message)}`
          : `<strong>Notes</strong><span style="color:#aaa">—</span>`}
      ${inv.terms_conditions
        ? `<br/><br/><strong>Terms &amp; Conditions</strong><br/>${esc(inv.terms_conditions)}`
        : ""}
    </div>
    <div style="margin-top:12px;">
      <table class="totals-table">
        <tr>
          <td class="tot-label">Subtotal</td>
          <td class="tot-val num">₹${fmtRupees(inv.subtotal)}</td>
        </tr>
        ${hasDiscount ? `<tr>
          <td class="tot-label" style="color:#ef4444">Discount</td>
          <td class="tot-val num" style="color:#ef4444">– ₹${fmtRupees(inv.discount_amount)}</td>
        </tr>` : ""}
        <tr>
          <td class="tot-label">Taxable Amount</td>
          <td class="tot-val num">₹${fmtRupees(inv.taxable_amount)}</td>
        </tr>
        <tr><td colspan="2"><hr class="divider"/></td></tr>
        ${!inv.is_igst ? `
        <tr class="gst-row">
          <td class="tot-label">CGST</td>
          <td class="tot-val num">₹${fmtRupees(inv.cgst_amount)}</td>
        </tr>
        <tr class="gst-row">
          <td class="tot-label">SGST</td>
          <td class="tot-val num">₹${fmtRupees(inv.sgst_amount)}</td>
        </tr>` : `
        <tr class="gst-row">
          <td class="tot-label">IGST</td>
          <td class="tot-val num">₹${fmtRupees(inv.igst_amount)}</td>
        </tr>`}
        ${Number(inv.round_off) !== 0 ? `<tr>
          <td class="tot-label">Round Off</td>
          <td class="tot-val num">${Number(inv.round_off) >= 0 ? "+" : ""}₹${fmtRupees(Math.abs(Number(inv.round_off)))}</td>
        </tr>` : ""}
        <tr><td colspan="2"><hr class="divider"/></td></tr>
        <tr class="grand-row">
          <td class="tot-label">Grand Total</td>
          <td class="tot-val num">₹${fmtRupees(inv.grand_total)}</td>
        </tr>
        ${Number(inv.advance_received) > 0 ? `
        <tr style="margin-top:6px">
          <td class="tot-label" style="padding-top:6px">Advance Received</td>
          <td class="tot-val num" style="padding-top:6px">– ₹${fmtRupees(inv.advance_received)}</td>
        </tr>
        <tr>
          <td class="tot-label" style="font-weight:700;color:#1a1a2e">Balance Due</td>
          <td class="tot-val num" style="font-weight:700;color:#e8620a">₹${fmtRupees(inv.balance_due)}</td>
        </tr>` : ""}
      </table>
    </div>
  </div>

  <div class="bank-sig">
    <div class="bank-box">
      <div class="bank-label">Payment Details</div>
      ${org?.bank_name      ? `<div class="bank-row"><span class="bank-key">Bank</span><span class="bank-val">${esc(org.bank_name)}</span></div>` : ""}
      ${org?.account_number ? `<div class="bank-row"><span class="bank-key">Account No.</span><span class="bank-val">${esc(org.account_number)}</span></div>` : ""}
      ${org?.ifsc_code      ? `<div class="bank-row"><span class="bank-key">IFSC</span><span class="bank-val">${esc(org.ifsc_code)}</span></div>` : ""}
      ${org?.upi_id ? `
      <div class="upi-row">
        <div>
          <div class="upi-label">UPI / Scan &amp; Pay</div>
          <div class="upi-id">${esc(org.upi_id)}</div>
        </div>
        ${org?.upi_qr_url ? `<img src="${esc(org.upi_qr_url)}" alt="UPI QR" style="height:60px;border:1px solid #eee;border-radius:4px;padding:2px;"/>` : ""}
      </div>` : ""}
    </div>
    <div class="sig-box">
      ${org?.signature_url ? `<img src="${esc(org.signature_url)}" alt="Signature"/>` : `<div style="height:48px;"></div>`}
      <div class="sig-line">For ${esc(org?.org_name ?? "Connected Steps")}</div>
      ${org?.authorized_signatory ? `<div class="sig-sub">${esc(org.authorized_signatory)}</div>` : ""}
      <div class="sig-sub">Authorized Signatory</div>
    </div>
  </div>

  <div class="footer">
    This is a computer-generated ${isCreditOrDebit ? "document" : "GST invoice"} and does not require a physical signature.
    ${org?.gst_number ? `&nbsp;·&nbsp; GSTIN: ${esc(org.gst_number)}` : ""}
  </div>

</div>
</body>
</html>`;
}
