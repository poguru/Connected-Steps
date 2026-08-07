/**
 * Premium proposal / quotation HTML generator.
 * Produces a self-contained A4-printable document suitable for
 * corporate clients.  Attach as Proposal-CS-QUO-XXXX.html and open
 * in any browser → File › Print › Save as PDF.
 */

import { getSupabaseServer } from "@/lib/supabase-server";

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(n: number | null | undefined): string {
  return Number(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

// ── Types mirroring DB ────────────────────────────────────────────────────────

interface Deliverable  { id: string; label: string; checked: boolean }
interface Milestone    { id: string; milestone: string; date: string; notes: string }
interface SponsorPkg   { id: string; name: string; price: number; color: string; benefits: string[] }
interface PaymentMile  { id: string; label: string; pct: number; due: string }

// ── Main generator ────────────────────────────────────────────────────────────

export async function generateQuotationHtml(id: string): Promise<string | null> {
  const db = getSupabaseServer();

  const [quoRes, itemsRes, settingsRes] = await Promise.all([
    db.from("quotations").select("*").eq("id", id).single(),
    db.from("quotation_items").select("*").eq("quotation_id", id).order("sort_order"),
    db.from("billing_settings").select("*").eq("id", 1).single(),
  ]);

  if (!quoRes.data) return null;

  const q     = quoRes.data;
  const items = itemsRes.data ?? [];
  const org   = settingsRes.data;

  const deliverables: Deliverable[]  = Array.isArray(q.deliverables)          ? q.deliverables          : [];
  const timeline:     Milestone[]    = Array.isArray(q.timeline_milestones)    ? q.timeline_milestones    : [];
  const sponsors:     SponsorPkg[]   = Array.isArray(q.sponsorship_packages)   ? q.sponsorship_packages   : [];
  const payMiles:     PaymentMile[]  = Array.isArray(q.payment_milestones)     ? q.payment_milestones     : [];

  const checked = deliverables.filter(d => d.checked);
  const hasSponsor  = sponsors.length > 0;
  const hasTimeline = timeline.length > 0;
  const hasDelivery = checked.length > 0;
  const hasPayMiles = payMiles.length > 0;

  // ── Items table ──────────────────────────────────────────────────────────
  const itemsHtml = items.map((it: Record<string, unknown>, i: number) => `
    <tr class="item-row">
      <td class="tc">${i + 1}</td>
      <td>${esc(it.description)}${it.unit ? `<br/><span class="unit">${esc(it.unit)}</span>` : ""}</td>
      <td class="tc num">${Number(it.quantity).toLocaleString("en-IN")}</td>
      <td class="tr num">₹${fmt(it.rate as number)}</td>
      <td class="tc">${Number(it.discount_pct) > 0 ? `${it.discount_pct}%` : "—"}</td>
      <td class="tc">${it.gst_pct}%</td>
      <td class="tr num fw7">₹${fmt(it.amount as number)}</td>
    </tr>`).join("");

  // ── Sponsor packages ─────────────────────────────────────────────────────
  const sponsorHtml = hasSponsor ? sponsors.map(pkg => `
    <div class="pkg-card">
      <div class="pkg-header" style="border-left:4px solid ${esc(pkg.color ?? "#e8620a")}">
        <div class="pkg-name">${esc(pkg.name)}</div>
        <div class="pkg-price">₹${Number(pkg.price ?? 0).toLocaleString("en-IN")} <span class="pkg-unit">+ GST</span></div>
      </div>
      <ul class="pkg-benefits">
        ${(pkg.benefits ?? []).map((b: string) => `<li>${esc(b)}</li>`).join("")}
      </ul>
    </div>`).join("") : "";

  // ── Timeline ─────────────────────────────────────────────────────────────
  const timelineHtml = hasTimeline ? timeline.map((m, i) => `
    <tr>
      <td class="tl-num">${i + 1}</td>
      <td class="tl-ms">${esc(m.milestone)}</td>
      <td class="tl-dt">${m.date ? fmtDate(m.date) : "—"}</td>
      <td class="tl-nt">${esc(m.notes)}</td>
    </tr>`).join("") : "";

  // ── Payment milestones ────────────────────────────────────────────────────
  const payMileHtml = hasPayMiles ? payMiles.map(m => `
    <tr>
      <td>${esc(m.label)}</td>
      <td class="tc">${m.pct}%</td>
      <td class="tr num">₹${fmt((Number(q.grand_total) * (m.pct / 100)))}</td>
      <td>${m.due ? fmtDate(m.due) : "—"}</td>
    </tr>`).join("") : "";

  const hasDiscount = Number(q.discount_amount) > 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Proposal ${esc(q.quotation_number)} — ${esc(q.proposal_title)}</title>
<style>
/* ── Reset ── */
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;color:#1a1a2e;background:#fff;line-height:1.55;-webkit-print-color-adjust:exact;print-color-adjust:exact}

/* ── Page ── */
.page{width:210mm;min-height:297mm;margin:0 auto;position:relative}

/* ── Cover Page ── */
.cover{width:210mm;min-height:297mm;background:linear-gradient(160deg,#0d1b2a 0%,#1a1a2e 55%,#0d1225 100%);display:flex;flex-direction:column;position:relative;overflow:hidden;page-break-after:always}
.cover-accent-1{position:absolute;top:-80px;right:-80px;width:340px;height:340px;border-radius:50%;background:rgba(232,98,10,0.08);border:1px solid rgba(232,98,10,0.15)}
.cover-accent-2{position:absolute;bottom:60px;left:-60px;width:260px;height:260px;border-radius:50%;background:rgba(232,98,10,0.05);border:1px solid rgba(232,98,10,0.1)}
.cover-stripe{position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#e8620a,#ff8c42,#e8620a)}
.cover-body{flex:1;padding:52px 52px 40px;display:flex;flex-direction:column;position:relative;z-index:2}
.cover-logo img{height:54px;object-fit:contain;filter:brightness(10)}
.cover-logo-text{font-size:26px;font-weight:800;color:#e8620a;letter-spacing:-0.5px;margin-top:8px}
.cover-org-sub{font-size:11px;color:rgba(255,255,255,0.3);letter-spacing:.14em;text-transform:uppercase;margin-top:2px}
.cover-divider{width:60px;height:3px;background:#e8620a;border-radius:2px;margin:36px 0}
.cover-label{font-size:10px;color:rgba(255,255,255,0.3);letter-spacing:.2em;text-transform:uppercase;margin-bottom:8px}
.cover-title{font-size:28px;font-weight:800;color:#fff;line-height:1.25;letter-spacing:-0.5px;max-width:380px}
.cover-project{font-size:14px;color:rgba(255,255,255,0.55);margin-top:10px;font-style:italic}
.cover-client-section{margin-top:auto;padding:28px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px}
.cover-client-label{font-size:9px;color:rgba(232,98,10,0.8);letter-spacing:.18em;text-transform:uppercase;margin-bottom:8px;font-weight:700}
.cover-client-name{font-size:18px;font-weight:800;color:#fff;line-height:1.2}
.cover-client-co{font-size:13px;color:rgba(255,255,255,0.45);margin-top:3px}
.cover-meta{display:flex;gap:28px;margin-top:28px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.08)}
.cover-meta-item .mlabel{font-size:9px;color:rgba(255,255,255,0.25);letter-spacing:.12em;text-transform:uppercase}
.cover-meta-item .mval{font-size:11px;color:rgba(255,255,255,0.65);margin-top:3px;font-weight:600}
.cover-footer{padding:20px 52px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid rgba(255,255,255,0.07);position:relative;z-index:2}
.cover-footer .cf-left{font-size:9.5px;color:rgba(255,255,255,0.3);line-height:1.7}
.cover-footer .cf-left strong{color:rgba(232,98,10,0.7)}
.cover-badge{background:rgba(232,98,10,0.15);border:1px solid rgba(232,98,10,0.3);border-radius:20px;padding:5px 14px;font-size:10px;font-weight:700;color:#e8620a;letter-spacing:.08em;text-transform:uppercase}

/* ── Inner pages ── */
.inner{padding:14mm 14mm 16mm;page-break-inside:avoid}
.page-header{display:flex;justify-content:space-between;align-items:center;padding-bottom:12px;border-bottom:2px solid #e8620a;margin-bottom:24px}
.ph-left .org-name{font-size:14px;font-weight:800;color:#1a1a2e}
.ph-left .org-sub{font-size:9px;color:#888;letter-spacing:.1em;text-transform:uppercase;margin-top:1px}
.ph-right{text-align:right}
.ph-right .quo-num{font-size:13px;font-weight:800;color:#e8620a;font-variant-numeric:tabular-nums}
.ph-right .quo-status{display:inline-block;margin-top:4px;padding:2px 10px;border-radius:20px;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.s-draft{background:#f3f4f6;color:#6b7280;border:1px solid #d1d5db}
.s-sent{background:#eff6ff;color:#1d4ed8;border:1px solid #93c5fd}
.s-accepted{background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7}
.s-rejected{background:#fef2f2;color:#991b1b;border:1px solid #fca5a5}
.s-expired{background:#fefce8;color:#854d0e;border:1px solid #fde68a}
.s-converted{background:#f0fdf4;color:#15803d;border:1px solid #86efac}

/* ── Section titles ── */
.sec-title{font-size:10px;font-weight:800;color:#e8620a;text-transform:uppercase;letter-spacing:.15em;margin-bottom:14px;padding-bottom:6px;border-bottom:1px solid rgba(232,98,10,0.2)}

/* ── Parties ── */
.parties{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
.party-box{padding:14px 16px;border:1px solid #eef0f8;border-radius:8px;background:#fafbff}
.party-label{font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#e8620a;margin-bottom:8px}
.party-co{font-size:13px;font-weight:700;color:#1a1a2e;margin-bottom:2px}
.party-name{font-size:11px;color:#555;margin-bottom:2px}
.party-meta{font-size:10px;color:#777;line-height:1.7}
.gst-tag{display:inline-block;background:#fff3e0;border:1px solid #ffb74d;font-size:9px;font-weight:700;color:#e65100;padding:2px 8px;border-radius:3px;margin-top:5px}

/* ── Rich text content ── */
.rich-content{font-size:11px;color:#333;line-height:1.7;margin-bottom:22px}
.rich-content h1,.rich-content h2,.rich-content h3{font-size:12px;font-weight:700;color:#1a1a2e;margin:12px 0 6px}
.rich-content h3{font-size:11px;font-weight:700}
.rich-content p{margin-bottom:6px}
.rich-content ul,.rich-content ol{padding-left:18px;margin-bottom:8px}
.rich-content li{margin-bottom:3px}
.rich-content table{width:100%;border-collapse:collapse;margin-bottom:10px}
.rich-content table td,.rich-content table th{border:1px solid #e0e0e0;padding:5px 8px;font-size:10px}
.rich-content table th{background:#f8f8f8;font-weight:700}
.rich-content strong{font-weight:700;color:#1a1a2e}

/* ── Deliverables ── */
.deliver-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:24px}
.deliver-item{display:flex;align-items:center;gap:7px;padding:7px 10px;background:#f8f9fc;border:1px solid #eef0f8;border-radius:6px;font-size:10px;color:#1a1a2e;font-weight:600}
.deliver-check{width:14px;height:14px;border-radius:3px;background:#e8620a;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.deliver-check svg{display:block}

/* ── Line items table ── */
table{width:100%;border-collapse:collapse}
thead th{background:#1a1a2e;color:#fff;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:9px 8px}
.item-row td{padding:8px 8px;border-bottom:1px solid #f0f0f8;font-size:11px;color:#333;vertical-align:top}
.item-row:nth-child(even) td{background:#f9faff}
.tc{text-align:center}
.tr{text-align:right}
.num{font-variant-numeric:tabular-nums}
.fw7{font-weight:700}
.unit{font-size:9.5px;color:#888;margin-top:2px;display:block}

/* ── Totals ── */
.totals-wrap{display:grid;grid-template-columns:1fr 240px;gap:20px;margin-top:0;align-items:start;border-top:2px solid #1a1a2e}
.notes-cell{margin-top:12px;font-size:10px;color:#555;line-height:1.75;padding:12px 14px;border:1px solid #eef0f8;border-radius:7px}
.notes-cell strong{font-size:10px;color:#1a1a2e;display:block;margin-bottom:3px}
.tot-tbl{width:100%;border-collapse:collapse;margin-top:12px}
.tot-tbl td{padding:5px 8px;font-size:11px}
.tot-label{color:#555}
.tot-val{text-align:right;font-variant-numeric:tabular-nums}
.tot-divider{border:none;border-top:1px solid #f0f0f8;margin:2px 0}
.gst-row td{color:#e8620a;font-weight:600}
.grand-row td{background:#1a1a2e;color:#fff;font-size:14px;font-weight:800;padding:10px 10px;border-radius:5px}

/* ── Sponsor packages ── */
.pkg-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-bottom:24px}
.pkg-card{border:1px solid #eef0f8;border-radius:8px;overflow:hidden}
.pkg-header{padding:14px 16px;background:#fafbff;border-left:4px solid #e8620a}
.pkg-name{font-size:14px;font-weight:800;color:#1a1a2e}
.pkg-price{font-size:16px;font-weight:800;color:#e8620a;margin-top:4px}
.pkg-unit{font-size:11px;font-weight:400;color:#888}
.pkg-benefits{padding:10px 16px 14px;list-style:none}
.pkg-benefits li{font-size:10px;color:#444;padding:3px 0;border-bottom:1px dashed #f0f0f8;display:flex;align-items:center;gap:6px}
.pkg-benefits li::before{content:"✓";color:#e8620a;font-weight:800;font-size:10px;flex-shrink:0}

/* ── Timeline ── */
.tl-tbl{margin-bottom:24px}
.tl-tbl thead th{background:#1a1a2e;color:#fff;font-size:10px;font-weight:700;padding:8px 10px;text-transform:uppercase;letter-spacing:.06em}
.tl-num{text-align:center;font-weight:700;color:#e8620a;font-size:11px;padding:8px 10px;background:#fff8f3;border-bottom:1px solid #fde8d2}
.tl-ms{font-weight:700;color:#1a1a2e;font-size:11px;padding:8px 10px;border-bottom:1px solid #f0f0f8}
.tl-dt{color:#555;font-size:10px;padding:8px 10px;border-bottom:1px solid #f0f0f8;white-space:nowrap}
.tl-nt{color:#888;font-size:10px;padding:8px 10px;border-bottom:1px solid #f0f0f8}

/* ── Payment milestones ── */
.pay-tbl thead th{background:#1a1a2e;color:#fff;font-size:10px;font-weight:700;padding:8px 10px;text-align:left}
.pay-tbl td{padding:8px 10px;border-bottom:1px solid #f0f0f8;font-size:11px}

/* ── Signature ── */
.sig-section{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:24px;padding-top:20px;border-top:1px solid #eef0f8}
.sig-box{text-align:center}
.sig-img{height:52px;object-fit:contain;display:block;margin:0 auto 8px}
.sig-line{border-top:1.5px solid #1a1a2e;padding-top:8px;font-size:10px;font-weight:700;color:#1a1a2e}
.sig-sub{font-size:9px;color:#888;margin-top:3px}
.sig-client-box{border:1px dashed #ccc;border-radius:6px;padding:14px;text-align:center}
.sig-client-line{height:48px;margin-bottom:8px}
.accept-badge{display:inline-block;background:#e8f5e9;border:1px solid #a5d6a7;border-radius:20px;padding:3px 12px;font-size:9px;font-weight:700;color:#2e7d32;letter-spacing:.08em;margin-bottom:6px}

/* ── Footer ── */
.page-footer{margin-top:20px;padding-top:10px;border-top:1px solid #eef0f8;display:flex;justify-content:space-between;align-items:center;font-size:9px;color:#aaa}
.page-footer .pf-co{font-weight:700;color:#888}

/* ── Print ── */
@media print {
  body{background:#fff}
  .page{width:100%}
  .inner{padding:10mm 10mm 12mm}
  .no-print{display:none!important}
}
</style>
</head>
<body>

<!-- ██ COVER PAGE ██ -->
<div class="cover">
  <div class="cover-stripe"></div>
  <div class="cover-accent-1"></div>
  <div class="cover-accent-2"></div>

  <div class="cover-body">
    <!-- Logo -->
    ${org?.logo_url
      ? `<div class="cover-logo"><img src="${esc(org.logo_url)}" alt="${esc(org?.org_name)}"/></div>`
      : `<div class="cover-logo-text">${esc(org?.org_name ?? "Connected Steps")}</div>`
    }
    <div class="cover-org-sub">Event Management &amp; Sports</div>

    <div class="cover-divider"></div>

    <div class="cover-label">Proposal</div>
    <h1 class="cover-title">${esc(q.proposal_title)}</h1>
    ${q.project_name ? `<div class="cover-project">${esc(q.project_name)}</div>` : ""}

    <div class="cover-client-section">
      <div class="cover-client-label">Prepared For</div>
      ${q.company_name ? `<div class="cover-client-name">${esc(q.company_name)}</div>` : ""}
      <div class="cover-client-co">${esc(q.client_name)}${q.client_designation ? `, ${esc(q.client_designation)}` : ""}</div>
    </div>

    <div class="cover-meta">
      <div class="cover-meta-item">
        <div class="mlabel">Quotation No.</div>
        <div class="mval">${esc(q.quotation_number)}</div>
      </div>
      ${q.event_date ? `<div class="cover-meta-item"><div class="mlabel">Event Date</div><div class="mval">${fmtDate(q.event_date)}</div></div>` : ""}
      ${q.valid_until ? `<div class="cover-meta-item"><div class="mlabel">Valid Until</div><div class="mval">${fmtDate(q.valid_until)}</div></div>` : ""}
      <div class="cover-meta-item">
        <div class="mlabel">Version</div>
        <div class="mval">v${q.version ?? 1}.0</div>
      </div>
    </div>
  </div>

  <div class="cover-footer">
    <div class="cf-left">
      <strong>${esc(org?.org_name ?? "Connected Steps")}</strong><br/>
      ${org?.address ? esc(org.address) + " · " : ""}${org?.city ?? "Hyderabad"}, India<br/>
      ${org?.email ? `${esc(org.email)} · ` : ""}${org?.phone ? esc(org.phone) : ""}
    </div>
    <div class="cover-badge">${esc(q.quotation_number)}</div>
  </div>
</div>

<!-- ██ PROPOSAL BODY ██ -->
<div class="page inner">

  <!-- Page header (repeated on every page via CSS) -->
  <div class="page-header">
    <div class="ph-left">
      <div class="org-name">${esc(org?.org_name ?? "Connected Steps")}</div>
      <div class="org-sub">Event Management &amp; Sports</div>
    </div>
    <div class="ph-right">
      <div class="quo-num">${esc(q.quotation_number)}</div>
      <div class="quo-status s-${esc(q.status)}">${esc(q.status)}</div>
    </div>
  </div>

  <!-- ── Parties ── -->
  <div class="parties">
    <div class="party-box">
      <div class="party-label">Prepared For</div>
      ${q.company_name ? `<div class="party-co">${esc(q.company_name)}</div>` : ""}
      <div class="party-name">${esc(q.client_name)}${q.client_designation ? ` · ${esc(q.client_designation)}` : ""}</div>
      <div class="party-meta">
        ${q.client_email  ? `✉ ${esc(q.client_email)}<br/>` : ""}
        ${q.client_phone  ? `📞 ${esc(q.client_phone)}<br/>` : ""}
        ${q.billing_address ? esc(q.billing_address) + "<br/>" : ""}
        ${q.project_location ? `📍 ${esc(q.project_location)}<br/>` : ""}
      </div>
      ${q.client_gst ? `<span class="gst-tag">GSTIN: ${esc(q.client_gst)}</span>` : ""}
    </div>
    <div class="party-box">
      <div class="party-label">Prepared By</div>
      <div class="party-co">${esc(org?.org_name ?? "Connected Steps")}</div>
      <div class="party-meta">
        ${org?.address ? esc(org.address) + "<br/>" : ""}
        ${org?.city ? esc(org.city) + (org?.state ? ", " + esc(org.state) : "") + "<br/>" : ""}
        ${org?.email ? `✉ ${esc(org.email)}<br/>` : ""}
        ${org?.phone ? `📞 ${esc(org.phone)}<br/>` : ""}
        ${q.prepared_by ? `Prepared by: <strong>${esc(q.prepared_by)}</strong><br/>` : ""}
      </div>
      ${org?.gst_number ? `<span class="gst-tag">GSTIN: ${esc(org.gst_number)}</span>` : ""}
    </div>
  </div>

  ${(q.reference_number || q.event_date) ? `
  <div style="display:flex;gap:24px;margin-bottom:18px;font-size:10px;color:#555;flex-wrap:wrap">
    ${q.reference_number ? `<span><strong style="color:#1a1a2e">Ref No.:</strong> ${esc(q.reference_number)}</span>` : ""}
    ${q.event_date       ? `<span><strong style="color:#1a1a2e">Event Date:</strong> ${fmtDate(q.event_date)}</span>` : ""}
    ${q.valid_until      ? `<span><strong style="color:#1a1a2e">Valid Until:</strong> ${fmtDate(q.valid_until)}</span>` : ""}
    ${q.place_of_supply  ? `<span><strong style="color:#1a1a2e">Place of Supply:</strong> ${esc(q.place_of_supply)}</span>` : ""}
  </div>` : ""}

  <!-- ── Executive Summary ── -->
  ${q.executive_summary && stripHtml(q.executive_summary) ? `
  <div class="sec-title">Executive Summary</div>
  <div class="rich-content">${q.executive_summary}</div>` : ""}

  <!-- ── Scope of Work ── -->
  ${q.scope_of_work && stripHtml(q.scope_of_work) ? `
  <div class="sec-title">Scope of Work</div>
  <div class="rich-content">${q.scope_of_work}</div>` : ""}

  <!-- ── Deliverables ── -->
  ${hasDelivery ? `
  <div class="sec-title">Deliverables Included</div>
  <div class="deliver-grid" style="margin-bottom:24px">
    ${checked.map(d => `
    <div class="deliver-item">
      <div class="deliver-check">
        <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      ${esc(d.label)}
    </div>`).join("")}
  </div>` : ""}

  <!-- ── Line Items ── -->
  ${items.length > 0 ? `
  <div class="sec-title">Pricing &amp; Line Items</div>
  <table style="margin-bottom:0">
    <thead>
      <tr>
        <th class="tc" style="width:32px">#</th>
        <th>Description</th>
        <th class="tc" style="width:50px">Qty</th>
        <th class="tr" style="width:80px">Rate</th>
        <th class="tc" style="width:50px">Disc%</th>
        <th class="tc" style="width:46px">GST%</th>
        <th class="tr" style="width:88px">Amount</th>
      </tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
  </table>

  <!-- Totals -->
  <div class="totals-wrap">
    <div class="notes-cell">
      ${q.customer_notes
        ? `<strong>Notes</strong>${esc(q.customer_notes)}`
        : `<strong>Tax Type</strong>${q.is_igst ? "IGST (Inter-state)" : "CGST + SGST (Same-state)"}`
      }
    </div>
    <div>
      <table class="tot-tbl">
        <tr><td class="tot-label">Subtotal</td><td class="tot-val">₹${fmt(q.subtotal)}</td></tr>
        ${hasDiscount ? `<tr><td class="tot-label" style="color:#ef4444">Discount</td><td class="tot-val" style="color:#ef4444">– ₹${fmt(q.discount_amount)}</td></tr>` : ""}
        <tr><td class="tot-label">Taxable Amount</td><td class="tot-val">₹${fmt(q.taxable_amount)}</td></tr>
        <tr><td colspan="2"><hr class="tot-divider"/></td></tr>
        ${!q.is_igst ? `
        <tr class="gst-row"><td class="tot-label">CGST</td><td class="tot-val">₹${fmt(q.cgst_amount)}</td></tr>
        <tr class="gst-row"><td class="tot-label">SGST</td><td class="tot-val">₹${fmt(q.sgst_amount)}</td></tr>
        ` : `
        <tr class="gst-row"><td class="tot-label">IGST</td><td class="tot-val">₹${fmt(q.igst_amount)}</td></tr>
        `}
        ${Number(q.round_off) !== 0 ? `<tr><td class="tot-label">Round Off</td><td class="tot-val">${Number(q.round_off) >= 0 ? "+" : ""}₹${fmt(Math.abs(Number(q.round_off)))}</td></tr>` : ""}
        <tr><td colspan="2"><hr class="tot-divider"/></td></tr>
        <tr class="grand-row"><td class="tot-label">Grand Total</td><td class="tot-val">₹${fmt(q.grand_total)}</td></tr>
      </table>
    </div>
  </div>` : ""}

  <!-- ── Sponsorship Packages ── -->
  ${hasSponsor ? `
  <div class="sec-title" style="margin-top:24px">Sponsorship Packages</div>
  <div class="pkg-grid">${sponsorHtml}</div>` : ""}

  <!-- ── Timeline ── -->
  ${hasTimeline ? `
  <div class="sec-title" style="margin-top:24px">Event Timeline</div>
  <table class="tl-tbl" style="margin-bottom:24px">
    <thead>
      <tr>
        <th style="width:36px">#</th>
        <th>Milestone</th>
        <th style="width:110px">Date</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>${timelineHtml}</tbody>
  </table>` : ""}

  <!-- ── Payment Terms ── -->
  ${(q.payment_terms_notes && stripHtml(q.payment_terms_notes)) || hasPayMiles || q.advance_percentage ? `
  <div class="sec-title" style="margin-top:${hasTimeline ? 0 : 24}px">Payment Terms</div>
  ${q.advance_percentage ? `<div style="margin-bottom:10px;font-size:11px;color:#333"><strong>Advance Required:</strong> ${q.advance_percentage}% of Grand Total = ₹${fmt((Number(q.grand_total) * Number(q.advance_percentage)) / 100)}</div>` : ""}
  ${hasPayMiles ? `
  <table class="pay-tbl" style="margin-bottom:14px">
    <thead><tr><th>Milestone</th><th class="tc" style="width:60px">%</th><th class="tr" style="width:100px">Amount</th><th style="width:110px">Due Date</th></tr></thead>
    <tbody>${payMileHtml}</tbody>
  </table>` : ""}
  ${q.payment_terms_notes && stripHtml(q.payment_terms_notes) ? `<div class="rich-content">${q.payment_terms_notes}</div>` : ""}
  ` : ""}

  <!-- ── Terms & Conditions ── -->
  ${q.terms_conditions && stripHtml(q.terms_conditions) ? `
  <div class="sec-title">Terms &amp; Conditions</div>
  <div class="rich-content" style="font-size:10px;color:#555">${q.terms_conditions}</div>` : ""}

  <!-- ── Signature ── -->
  <div class="sig-section">
    <div class="sig-box">
      ${org?.signature_url
        ? `<img class="sig-img" src="${esc(org.signature_url)}" alt="Signature"/>`
        : `<div style="height:52px"></div>`
      }
      <div class="sig-line">For ${esc(org?.org_name ?? "Connected Steps")}</div>
      ${org?.authorized_signatory ? `<div class="sig-sub">${esc(org.authorized_signatory)}</div>` : ""}
      <div class="sig-sub">Authorized Signatory</div>
    </div>
    <div class="sig-box">
      <div class="sig-client-box">
        <div class="accept-badge">Client Acceptance</div>
        <div class="sig-client-line"></div>
        <div class="sig-line">${esc(q.client_name)}${q.company_name ? ` / ${esc(q.company_name)}` : ""}</div>
        <div class="sig-sub">Authorized Signatory &amp; Date</div>
      </div>
    </div>
  </div>

  <!-- ── Footer ── -->
  <div class="page-footer">
    <div>
      <span class="pf-co">${esc(org?.org_name ?? "Connected Steps")}</span>
      ${org?.gst_number ? ` &nbsp;·&nbsp; GSTIN: ${esc(org.gst_number)}` : ""}
      ${org?.email ? ` &nbsp;·&nbsp; ${esc(org.email)}` : ""}
    </div>
    <div>${esc(q.quotation_number)} &nbsp;·&nbsp; v${q.version ?? 1}.0</div>
  </div>

</div>
</body>
</html>`;
}
