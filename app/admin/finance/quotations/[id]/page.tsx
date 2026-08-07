"use client";

import { use, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Button, Badge, Spinner, Alert } from "@/components/ui/ds";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Quotation {
  id: string; quotation_number: string; version: number; status: string;
  company_name: string | null; client_name: string; client_designation: string | null;
  client_department: string | null; client_gst: string | null; client_pan: string | null;
  client_email: string | null; client_phone: string | null; billing_address: string | null;
  project_location: string | null; client_website: string | null;
  proposal_title: string; project_name: string | null; event_date: string | null;
  valid_until: string | null; prepared_by: string | null; reference_number: string | null;
  executive_summary: string | null; scope_of_work: string | null;
  terms_conditions: string | null; payment_terms_notes: string | null;
  deliverables: { id: string; label: string; checked: boolean }[];
  sponsorship_packages: { id: string; name: string; price: number; color: string; benefits: string[] }[];
  timeline_milestones: { id: string; title: string; date: string; description: string }[];
  payment_milestones: { id: string; label: string; percentage: number; due_days: number; notes: string }[];
  currency: string; place_of_supply: string | null; is_igst: boolean;
  advance_percentage: number | null;
  subtotal: number; discount_amount: number; taxable_amount: number;
  cgst_amount: number; sgst_amount: number; igst_amount: number;
  round_off: number; grand_total: number;
  internal_notes: string | null; customer_notes: string | null;
  converted_invoice_id: string | null; converted_at: string | null;
  created_at: string; updated_at: string;
}

interface LineItem {
  id: string; description: string; quantity: number; unit: string | null;
  rate: number; discount_pct: number; gst_pct: number; amount: number;
}

interface EmailLog {
  id: string; to_emails: string[]; cc_emails: string[] | null; subject: string;
  status: string; sent_at: string | null; failure_reason: string | null;
}

interface HistoryEntry {
  id: string; action: string; description: string | null; actor: string | null; created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  draft: "#6b7280", sent: "#60a5fa", viewed: "#a78bfa", accepted: "#4ade80",
  rejected: "#f87171", expired: "#facc15", converted: "#fb923c", cancelled: "#6b7280",
};

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateShort(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtRupees(n: number) {
  return `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

const inp: React.CSSProperties = {
  padding: "7px 11px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6, color: "#fff", fontSize: "0.82rem", outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box",
};

// ── Send Modal ─────────────────────────────────────────────────────────────────

function SendModal({ quo, onClose, onSent }: { quo: Quotation; onClose: () => void; onSent: () => void }) {
  const [to,      setTo]      = useState(quo.client_email ?? "");
  const [cc,      setCc]      = useState("");
  const [bcc,     setBcc]     = useState("");
  const [subject, setSubject] = useState(`Proposal: ${quo.proposal_title} – ${quo.quotation_number}`);
  const [body,    setBody]    = useState(`Dear ${quo.client_name},\n\nPlease find attached our event proposal for your review. The proposal document is attached to this email.\n\nIf you have any questions, please don't hesitate to reach out.\n\nWarm regards,\nConnected Steps Team`);
  const [sending, setSending] = useState(false);
  const [error,   setError]   = useState("");

  async function send() {
    if (!to.trim()) { setError("Recipient email is required"); return; }
    setSending(true); setError("");
    const res = await fetch(`/api/admin/quotations/${quo.id}/send`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to:      to.split(",").map(s => s.trim()).filter(Boolean),
        cc:      cc  ? cc.split(",").map(s => s.trim()).filter(Boolean)  : undefined,
        bcc:     bcc ? bcc.split(",").map(s => s.trim()).filter(Boolean) : undefined,
        subject, body,
      }),
    });
    const data = await res.json();
    setSending(false);
    if (!res.ok) { setError(data.error ?? "Send failed"); return; }
    onSent();
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, background: "#111", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: "24px", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
        <div style={{ fontWeight: 800, fontSize: "1rem", color: "#fff", marginBottom: 16 }}>Send Proposal via Email</div>

        {error && <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid #f87171", borderRadius: 6, padding: "8px 12px", fontSize: "0.8rem", color: "#f87171", marginBottom: 12 }}>{error}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { label: "To *", value: to, set: setTo, placeholder: "client@example.com (comma-separated)" },
            { label: "CC",   value: cc, set: setCc, placeholder: "cc@example.com" },
            { label: "BCC",  value: bcc,set: setBcc,placeholder: "bcc@example.com" },
          ].map(f => (
            <div key={f.label}>
              <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 600, color: "#555", textTransform: "uppercase", marginBottom: 4 }}>{f.label}</label>
              <input value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} style={inp} />
            </div>
          ))}
          <div>
            <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 600, color: "#555", textTransform: "uppercase", marginBottom: 4 }}>Subject *</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 600, color: "#555", textTransform: "uppercase", marginBottom: 4 }}>Message</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={6} style={{ ...inp, resize: "vertical" }} />
          </div>
          <div style={{ fontSize: "0.72rem", color: "#555", background: "rgba(255,255,255,0.02)", borderRadius: 6, padding: "8px 10px" }}>
            📎 Proposal-{quo.quotation_number}.html will be attached automatically
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={send} disabled={sending}>
            {sending ? "Sending…" : "Send Proposal"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Status Change Modal ────────────────────────────────────────────────────────

function StatusModal({ id, currentStatus, onClose, onChanged }: { id: string; currentStatus: string; onClose: () => void; onChanged: () => void }) {
  const transitions: Record<string, string[]> = {
    draft: ["sent", "cancelled"], sent: ["viewed", "accepted", "rejected", "expired", "cancelled"],
    viewed: ["accepted", "rejected", "expired", "cancelled"], accepted: ["converted", "cancelled"],
    rejected: ["draft"], expired: ["draft"], converted: [], cancelled: ["draft"],
  };
  const options = transitions[currentStatus] ?? [];
  const [target, setTarget] = useState(options[0] ?? "");
  const [notes,  setNotes]  = useState("");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  async function save() {
    if (!target) return;
    setSaving(true); setError("");
    const res = await fetch(`/api/admin/quotations/${id}/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: target, notes }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed"); return; }
    onChanged();
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 400, background: "#111", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "20px" }}>
        <div style={{ fontWeight: 800, color: "#fff", marginBottom: 14 }}>Change Status</div>
        {error && <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid #f87171", borderRadius: 6, padding: "8px 12px", fontSize: "0.8rem", color: "#f87171", marginBottom: 10 }}>{error}</div>}
        {options.length === 0 ? (
          <div style={{ color: "#555", fontSize: "0.85rem" }}>No transitions available from "{currentStatus}"</div>
        ) : (
          <>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 600, color: "#555", textTransform: "uppercase", marginBottom: 4 }}>New Status</label>
              <select value={target} onChange={e => setTarget(e.target.value)} style={inp}>
                {options.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 600, color: "#555", textTransform: "uppercase", marginBottom: 4 }}>Notes (optional)</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reason for change" style={inp} />
            </div>
          </>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          {options.length > 0 && <Button variant="primary" size="sm" onClick={save} disabled={saving}>{saving ? "…" : "Update"}</Button>}
        </div>
      </div>
    </div>
  );
}

// ── Convert Confirm Modal ─────────────────────────────────────────────────────

function ConvertModal({ id, qno, onClose, onConverted }: { id: string; qno: string; onClose: () => void; onConverted: (invId: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  async function confirm() {
    setLoading(true); setError("");
    const res  = await fetch(`/api/admin/quotations/${id}/convert`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Failed"); return; }
    onConverted(data.invoice_id);
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 400, background: "#111", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "20px" }}>
        <div style={{ fontWeight: 800, color: "#fff", marginBottom: 10 }}>Convert to Invoice</div>
        <div style={{ fontSize: "0.85rem", color: "#888", marginBottom: 16 }}>
          This will create a new Manual Invoice from <strong style={{ color: "#fff" }}>{qno}</strong> and mark this quotation as Converted. This cannot be undone.
        </div>
        {error && <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid #f87171", borderRadius: 6, padding: "8px 12px", fontSize: "0.8rem", color: "#f87171", marginBottom: 10 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={confirm} disabled={loading}>{loading ? "Converting…" : "Convert"}</Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Detail Page ───────────────────────────────────────────────────────────

export default function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }  = use(params);
  const router  = useRouter();

  const [data,        setData]        = useState<{ quotation: Quotation; items: LineItem[]; emails: EmailLog[]; history: HistoryEntry[] } | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [alert,       setAlert]       = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [showSend,    setShowSend]    = useState(false);
  const [showStatus,  setShowStatus]  = useState(false);
  const [showConvert, setShowConvert] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/quotations/${id}`);
    if (!res.ok) { setLoading(false); return; }
    setData(await res.json());
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function duplicate() {
    const res  = await fetch(`/api/admin/quotations/${id}/duplicate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const data = await res.json();
    if (!res.ok) { setAlert({ type: "error", msg: data.error ?? "Failed" }); return; }
    router.push(`/admin/finance/quotations/${data.quotation?.id}`);
  }

  async function deleteQuo() {
    if (!confirm("Delete this quotation? This cannot be undone.")) return;
    const res = await fetch(`/api/admin/quotations/${id}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json(); setAlert({ type: "error", msg: d.error ?? "Delete failed" }); return; }
    router.push("/admin/finance/quotations");
  }

  if (loading) return <div style={{ padding: "3rem", textAlign: "center" }}><Spinner /></div>;
  if (!data)   return <div style={{ padding: "3rem", color: "#f87171", textAlign: "center" }}>Quotation not found.</div>;

  const { quotation: q, items, emails, history } = data;
  const isExpired  = q.valid_until && new Date(q.valid_until) < new Date();
  const canConvert = q.status === "accepted";
  const isConverted = q.status === "converted";

  return (
    <div style={{ padding: "1.5rem", maxWidth: 1000, margin: "0 auto" }}>

      {/* Modals */}
      {showSend    && <SendModal    quo={q} onClose={() => setShowSend(false)} onSent={() => { setShowSend(false); setAlert({ type: "success", msg: "Proposal sent!" }); load(); }} />}
      {showStatus  && <StatusModal  id={id} currentStatus={q.status} onClose={() => setShowStatus(false)} onChanged={() => { setShowStatus(false); load(); }} />}
      {showConvert && <ConvertModal id={id} qno={q.quotation_number} onClose={() => setShowConvert(false)} onConverted={(invId) => { setShowConvert(false); router.push(`/admin/finance/manual-invoices/${invId}`); }} />}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: "0.72rem", color: "#555", marginBottom: 4 }}>
            <Link href="/admin/finance/quotations" style={{ color: "#555", textDecoration: "none" }}>Quotations</Link> /
          </div>
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "#fff" }}>{q.quotation_number}</h1>
          <div style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "#888" }}>
            {q.proposal_title}
            {q.version > 1 && <span style={{ marginLeft: 8, fontSize: "0.7rem", color: "#555" }}>v{q.version}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <a href={`/api/admin/quotations/${id}/html`} target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="sm">🖨 View/Print</Button>
          </a>
          <Button variant="ghost" size="sm" onClick={duplicate}>⧉ Duplicate</Button>
          {!isConverted && (
            <Link href={`/admin/finance/quotations/new?edit=${id}`}>
              <Button variant="outline" size="sm">✎ Edit</Button>
            </Link>
          )}
          <Button variant="ghost" size="sm" onClick={() => setShowStatus(true)}>⤷ Status</Button>
          {!isConverted && <Button variant="primary" size="sm" onClick={() => setShowSend(true)}>✉ Send</Button>}
          {canConvert    && <Button variant="primary" size="sm" onClick={() => setShowConvert(true)}>→ Convert to Invoice</Button>}
          {!isConverted  && (
            <button onClick={deleteQuo}
              style={{ padding: "5px 10px", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 6, color: "#f87171", fontSize: "0.78rem", cursor: "pointer", fontFamily: "inherit" }}>
              🗑
            </button>
          )}
        </div>
      </div>

      {alert && <Alert variant={alert.type === "success" ? "success" : "error"} style={{ marginBottom: 14 }}>{alert.msg}</Alert>}

      {/* Status bar */}
      <Card style={{ padding: "12px 16px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ display: "inline-block", padding: "3px 12px", borderRadius: 100, background: STATUS_COLOR[q.status] + "22", border: `1px solid ${STATUS_COLOR[q.status]}44`, color: STATUS_COLOR[q.status], fontSize: "0.78rem", fontWeight: 700 }}>
              {q.status.charAt(0).toUpperCase() + q.status.slice(1)}
            </span>
          </div>
          {isExpired && q.status === "sent" && (
            <span style={{ fontSize: "0.72rem", color: "#facc15", background: "rgba(250,204,21,0.1)", padding: "2px 8px", borderRadius: 4 }}>
              ⚠ Validity expired {fmtDate(q.valid_until)}
            </span>
          )}
          {isConverted && q.converted_invoice_id && (
            <Link href={`/admin/finance/manual-invoices/${q.converted_invoice_id}`} style={{ fontSize: "0.78rem", color: "#fb923c", textDecoration: "none" }}>
              → View Invoice
            </Link>
          )}
          <div style={{ marginLeft: "auto", fontSize: "0.72rem", color: "#444" }}>
            Created {fmtDate(q.created_at)} · Valid until <span style={{ color: isExpired ? "#f87171" : "#888" }}>{fmtDate(q.valid_until)}</span>
          </div>
        </div>
      </Card>

      {/* Financial summary */}
      <Card style={{ padding: "1rem 1.25rem", marginBottom: 16, background: "rgba(232,98,10,0.04)", border: "1px solid rgba(232,98,10,0.15)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: "0.68rem", color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Grand Total</div>
            <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#e8620a", fontVariantNumeric: "tabular-nums" }}>{fmtRupees(q.grand_total)}</div>
          </div>
          {[
            { l: "Subtotal",      v: q.subtotal },
            q.is_igst
              ? { l: "IGST",      v: q.igst_amount }
              : { l: "GST (CGST+SGST)", v: q.cgst_amount + q.sgst_amount },
          ].map(r => (
            <div key={r.l}>
              <div style={{ fontSize: "0.68rem", color: "#555", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{r.l}</div>
              <div style={{ fontSize: "1rem", fontWeight: 700, color: "#888", fontVariantNumeric: "tabular-nums" }}>{fmtRupees(r.v)}</div>
            </div>
          ))}
          {q.advance_percentage && (
            <div>
              <div style={{ fontSize: "0.68rem", color: "#555", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Advance ({q.advance_percentage}%)</div>
              <div style={{ fontSize: "1rem", fontWeight: 700, color: "#60a5fa", fontVariantNumeric: "tabular-nums" }}>
                {fmtRupees(q.grand_total * q.advance_percentage / 100)}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Main two-column */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, alignItems: "start" }}>

        {/* LEFT: Client + Proposal details */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Client card */}
          <Card style={{ padding: "1rem 1.25rem" }}>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Client</div>
            <div style={{ fontWeight: 700, fontSize: "1rem", color: "#fff" }}>{q.company_name || q.client_name}</div>
            {q.company_name && <div style={{ fontSize: "0.82rem", color: "#888", marginTop: 1 }}>{q.client_name}{q.client_designation ? `, ${q.client_designation}` : ""}</div>}
            {q.client_department && <div style={{ fontSize: "0.78rem", color: "#555" }}>{q.client_department}</div>}
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
              {q.client_email && <div style={{ fontSize: "0.78rem", color: "#60a5fa" }}>✉ {q.client_email}</div>}
              {q.client_phone && <div style={{ fontSize: "0.78rem", color: "#888" }}>📞 {q.client_phone}</div>}
              {q.client_gst   && <div style={{ fontSize: "0.72rem", color: "#555" }}>GST: {q.client_gst}</div>}
              {q.client_pan   && <div style={{ fontSize: "0.72rem", color: "#555" }}>PAN: {q.client_pan}</div>}
              {q.billing_address && <div style={{ fontSize: "0.72rem", color: "#555", marginTop: 6, lineHeight: 1.5 }}>{q.billing_address}</div>}
              {q.project_location && <div style={{ fontSize: "0.72rem", color: "#555" }}>📍 {q.project_location}</div>}
            </div>
          </Card>

          {/* Executive Summary */}
          {q.executive_summary && (
            <Card style={{ padding: "1rem 1.25rem" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Executive Summary</div>
              <div dangerouslySetInnerHTML={{ __html: q.executive_summary }} style={{ fontSize: "0.84rem", color: "#c0c0c0", lineHeight: 1.7 }} />
            </Card>
          )}

          {/* Scope of Work */}
          {q.scope_of_work && (
            <Card style={{ padding: "1rem 1.25rem" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Scope of Work</div>
              <div dangerouslySetInnerHTML={{ __html: q.scope_of_work }} style={{ fontSize: "0.84rem", color: "#c0c0c0", lineHeight: 1.7 }} />
            </Card>
          )}

          {/* Deliverables */}
          {q.deliverables?.length > 0 && (
            <Card style={{ padding: "1rem 1.25rem" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Deliverables</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 6 }}>
                {q.deliverables.map(d => (
                  <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: d.checked ? "#fff" : "#444" }}>
                    <span style={{ fontSize: 14 }}>{d.checked ? "✅" : "☐"}</span> {d.label}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Line items */}
          {items?.length > 0 && (
            <Card style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: "0.72rem", fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Line Items
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      {["Description", "Qty", "Rate", "Disc%", "GST%", "Amount"].map(h => (
                        <th key={h} style={{ padding: "7px 12px", textAlign: "left", fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(255,255,255,0.3)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(it => (
                      <tr key={it.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ padding: "8px 12px", color: "#fff" }}>{it.description}</td>
                        <td style={{ padding: "8px 12px", color: "#888", fontVariantNumeric: "tabular-nums" }}>{it.quantity}{it.unit ? ` ${it.unit}` : ""}</td>
                        <td style={{ padding: "8px 12px", color: "#888", fontVariantNumeric: "tabular-nums" }}>{fmtRupees(it.rate)}</td>
                        <td style={{ padding: "8px 12px", color: "#555", fontVariantNumeric: "tabular-nums" }}>{it.discount_pct}%</td>
                        <td style={{ padding: "8px 12px", color: "#555", fontVariantNumeric: "tabular-nums" }}>{it.gst_pct}%</td>
                        <td style={{ padding: "8px 12px", fontWeight: 700, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{fmtRupees(it.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Sponsorship packages */}
          {q.sponsorship_packages?.length > 0 && (
            <Card style={{ padding: "1rem 1.25rem" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Sponsorship Packages</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                {q.sponsorship_packages.map(p => (
                  <div key={p.id} style={{ border: `1px solid ${p.color}44`, borderTop: `3px solid ${p.color}`, borderRadius: 8, padding: "12px" }}>
                    <div style={{ fontWeight: 700, color: p.color, fontSize: "0.85rem" }}>{p.name}</div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#fff", fontVariantNumeric: "tabular-nums", margin: "4px 0 8px" }}>{fmtRupees(p.price)}</div>
                    <ul style={{ margin: 0, padding: "0 0 0 14px", fontSize: "0.72rem", color: "#888", lineHeight: 1.8 }}>
                      {p.benefits.filter(Boolean).map((b, bi) => <li key={bi}>{b}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Timeline */}
          {q.timeline_milestones?.length > 0 && (
            <Card style={{ padding: "1rem 1.25rem" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Event Timeline</div>
              {q.timeline_milestones.map(m => (
                <div key={m.id} style={{ display: "flex", gap: 10, marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ minWidth: 100, fontSize: "0.75rem", color: "#e8620a", fontWeight: 600 }}>{fmtDateShort(m.date)}</div>
                  <div>
                    <div style={{ fontSize: "0.82rem", color: "#fff", fontWeight: 600 }}>{m.title}</div>
                    {m.description && <div style={{ fontSize: "0.72rem", color: "#555" }}>{m.description}</div>}
                  </div>
                </div>
              ))}
            </Card>
          )}

          {/* Payment milestones */}
          {q.payment_milestones?.length > 0 && (
            <Card style={{ padding: "1rem 1.25rem" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Payment Milestones</div>
              {q.payment_milestones.map(m => (
                <div key={m.id} style={{ display: "flex", gap: 12, marginBottom: 6, alignItems: "center" }}>
                  <div style={{ minWidth: 40, fontSize: "1rem", fontWeight: 800, color: "#e8620a" }}>{m.percentage}%</div>
                  <div>
                    <div style={{ fontSize: "0.82rem", color: "#fff" }}>{m.label}</div>
                    {m.notes && <div style={{ fontSize: "0.72rem", color: "#555" }}>{m.notes}</div>}
                    {m.due_days > 0 && <div style={{ fontSize: "0.68rem", color: "#444" }}>{m.due_days} days before event</div>}
                  </div>
                  <div style={{ marginLeft: "auto", fontWeight: 700, color: "#888", fontVariantNumeric: "tabular-nums", fontSize: "0.82rem" }}>
                    {fmtRupees(q.grand_total * m.percentage / 100)}
                  </div>
                </div>
              ))}
            </Card>
          )}

          {/* Terms */}
          {q.payment_terms_notes && (
            <Card style={{ padding: "1rem 1.25rem" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Payment Terms</div>
              <div dangerouslySetInnerHTML={{ __html: q.payment_terms_notes }} style={{ fontSize: "0.82rem", color: "#888", lineHeight: 1.7 }} />
            </Card>
          )}

          {q.terms_conditions && (
            <Card style={{ padding: "1rem 1.25rem" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Terms & Conditions</div>
              <div dangerouslySetInnerHTML={{ __html: q.terms_conditions }} style={{ fontSize: "0.82rem", color: "#888", lineHeight: 1.7 }} />
            </Card>
          )}
        </div>

        {/* RIGHT SIDEBAR */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Proposal meta */}
          <Card style={{ padding: "1rem" }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Proposal Info</div>
            {[
              ["Reference",      q.reference_number],
              ["Project",        q.project_name],
              ["Event Date",     fmtDate(q.event_date)],
              ["Valid Until",    fmtDate(q.valid_until)],
              ["Prepared By",    q.prepared_by],
              ["Place of Supply",q.place_of_supply],
              ["GST Type",       q.is_igst ? "IGST (Interstate)" : "CGST + SGST"],
            ].filter(r => r[1]).map(([k, v]) => (
              <div key={String(k)} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "0.75rem", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ color: "#555" }}>{k}</span>
                <span style={{ color: "#888", textAlign: "right", maxWidth: 160 }}>{v}</span>
              </div>
            ))}
          </Card>

          {/* Quick actions */}
          <Card style={{ padding: "1rem" }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Quick Actions</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Button variant="primary"  size="sm" onClick={() => setShowSend(true)}   disabled={isConverted}>✉ Send Proposal</Button>
              <Button variant="outline"  size="sm" onClick={() => setShowStatus(true)} disabled={isConverted}>⤷ Change Status</Button>
              {canConvert && <Button variant="primary" size="sm" onClick={() => setShowConvert(true)}>→ Convert to Invoice</Button>}
              <Link href={`/admin/finance/quotations/new?edit=${id}`}><Button variant="ghost" size="sm" style={{ width: "100%" }} disabled={isConverted}>✎ Edit</Button></Link>
              <Button variant="ghost" size="sm" onClick={duplicate}>⧉ Duplicate</Button>
            </div>
          </Card>

          {/* PDF actions */}
          <Card style={{ padding: "1rem" }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>PDF</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <a href={`/api/admin/quotations/${id}/pdf?disposition=inline`} target="_blank" rel="noopener noreferrer" style={{ display: "block" }}>
                <Button variant="ghost" size="sm" style={{ width: "100%" }}>👁 Preview PDF</Button>
              </a>
              <a href={`/api/admin/quotations/${id}/pdf`} download style={{ display: "block" }}>
                <Button variant="ghost" size="sm" style={{ width: "100%" }}>⬇ Download PDF</Button>
              </a>
              <a href={`/api/admin/quotations/${id}/pdf?disposition=inline`} target="_blank" rel="noopener noreferrer" style={{ display: "block" }}
                onClick={e => { e.preventDefault(); const w = window.open(`/api/admin/quotations/${id}/pdf?disposition=inline`, "_blank"); w?.addEventListener("load", () => w.print()); }}>
                <Button variant="ghost" size="sm" style={{ width: "100%" }}>🖨 Print PDF</Button>
              </a>
              <a href={`/api/admin/quotations/${id}/pdf?regen=1&disposition=inline`} target="_blank" rel="noopener noreferrer" style={{ display: "block" }}>
                <Button variant="ghost" size="sm" style={{ width: "100%", color: "#888" }}>↺ Regenerate PDF</Button>
              </a>
            </div>
          </Card>

          {/* Internal notes */}
          {q.internal_notes && (
            <Card style={{ padding: "1rem", background: "rgba(250,204,21,0.03)", border: "1px solid rgba(250,204,21,0.12)" }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#facc15", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Internal Notes</div>
              <div style={{ fontSize: "0.78rem", color: "#888", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{q.internal_notes}</div>
            </Card>
          )}
        </div>
      </div>

      {/* Communication History */}
      <Card style={{ marginTop: 16, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#fff" }}>Communication History</div>
          <Button size="sm" variant="ghost" onClick={() => setShowSend(true)}>+ Send</Button>
        </div>
        {emails?.length === 0 ? (
          <div style={{ padding: "24px", textAlign: "center", color: "#333", fontSize: "0.82rem" }}>No emails sent yet.</div>
        ) : (
          emails?.map(e => (
            <div key={e.id} style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                <div>
                  <span style={{ fontSize: "0.78rem", color: "#fff", fontWeight: 600 }}>{e.subject}</span>
                  <div style={{ fontSize: "0.7rem", color: "#555", marginTop: 2 }}>
                    To: {e.to_emails.join(", ")}
                    {e.cc_emails?.length ? <> · CC: {e.cc_emails.join(", ")}</> : null}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: "0.68rem", color: "#555" }}>{fmtDate(e.sent_at)}</span>
                  <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 100, fontSize: "0.68rem", fontWeight: 700,
                    background: e.status === "sent" ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
                    color:      e.status === "sent" ? "#4ade80"              : "#f87171",
                    border:    `1px solid ${e.status === "sent" ? "#4ade8044" : "#f8717144"}`,
                  }}>
                    {e.status}
                  </span>
                </div>
              </div>
              {e.status === "failed" && e.failure_reason && (
                <div style={{ marginTop: 8, padding: "8px 10px", background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 6, fontSize: "0.72rem", color: "#f87171" }}>
                  Error: {e.failure_reason}
                  <button onClick={() => setShowSend(true)} style={{ marginLeft: 12, background: "none", border: "none", color: "#e8620a", cursor: "pointer", fontSize: "0.72rem", fontFamily: "inherit" }}>Resend →</button>
                </div>
              )}
            </div>
          ))
        )}
      </Card>

      {/* Audit Trail */}
      <Card style={{ marginTop: 16, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: "0.85rem", fontWeight: 700, color: "#fff" }}>Audit Trail</div>
        {history?.length === 0 ? (
          <div style={{ padding: "24px", textAlign: "center", color: "#333", fontSize: "0.82rem" }}>No history.</div>
        ) : (
          history?.map(h => (
            <div key={h.id} style={{ padding: "8px 16px", borderBottom: "1px solid rgba(255,255,255,0.03)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <span style={{ fontSize: "0.75rem", color: "#fff", fontWeight: 600 }}>{h.action}</span>
                {h.description && <span style={{ fontSize: "0.72rem", color: "#555", marginLeft: 8 }}>{h.description}</span>}
              </div>
              <span style={{ fontSize: "0.68rem", color: "#333" }}>{fmtDate(h.created_at)}</span>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
