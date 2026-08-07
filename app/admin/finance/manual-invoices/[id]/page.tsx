"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Button, Badge, Spinner, Alert } from "@/components/ui/ds";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Invoice {
  id: string; invoice_number: string; invoice_date: string; due_date: string | null;
  invoice_type: string; client_type: string; company_name: string | null;
  client_name: string; client_gst: string | null; client_pan: string | null;
  client_email: string | null; client_phone: string | null; billing_address: string | null;
  client_state: string | null; client_country: string | null; client_pincode: string | null;
  place_of_supply: string | null; is_igst: boolean; currency: string;
  subtotal: number; discount_amount: number; taxable_amount: number;
  cgst_amount: number; sgst_amount: number; igst_amount: number;
  round_off: number; grand_total: number; advance_received: number; balance_due: number;
  payment_status: string; payment_method: string | null; reference_number: string | null;
  po_number: string | null; quotation_ref: string | null; project_name: string | null;
  service_period: string | null; payment_terms: string | null;
  internal_notes: string | null; customer_notes: string | null;
  terms_conditions: string | null; thank_you_message: string | null;
  created_at: string;
}

interface LineItem {
  id: string; description: string; quantity: number; unit: string;
  rate: number; discount_pct: number; gst_pct: number; amount: number;
}

interface HistoryEntry {
  id: string; action: string; description: string; actor: string; created_at: string;
}

interface EmailLog {
  id: string; to_emails: string[]; cc_emails: string[] | null; subject: string;
  status: string; sent_at: string | null; failure_reason: string | null;
}

interface Payment {
  id: string; amount: number; payment_date: string; payment_method: string;
  reference_number: string | null; notes: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, "green" | "blue" | "yellow" | "red" | "gray" | "purple"> = {
  draft: "gray", sent: "blue", viewed: "purple", partially_paid: "yellow",
  paid: "green", cancelled: "gray", overdue: "red",
};

const TYPE_LABELS: Record<string, string> = {
  tax_invoice: "Tax Invoice", proforma: "Proforma Invoice",
  credit_note: "Credit Note", debit_note: "Debit Note",
};

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function fmtR(n: number | null | undefined) {
  return Number(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 });
}

const inp: React.CSSProperties = {
  padding: "8px 11px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6, color: "#fff", fontSize: "0.82rem", outline: "none", fontFamily: "inherit", width: "100%",
};
const label: React.CSSProperties = {
  fontSize: "0.72rem", fontWeight: 600, color: "rgba(255,255,255,0.4)",
  textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 5,
};
const section: React.CSSProperties = {
  fontSize: "0.78rem", fontWeight: 700, color: "#e8620a",
  textTransform: "uppercase", letterSpacing: "0.1em",
  borderBottom: "1px solid rgba(232,98,10,0.2)", paddingBottom: 6, marginBottom: 14,
};

// ── Send modal ────────────────────────────────────────────────────────────────

function SendModal({ invoice, onClose, onSent }: { invoice: Invoice; onClose: () => void; onSent: () => void }) {
  const [to,      setTo]      = useState(invoice.client_email ?? "");
  const [cc,      setCc]      = useState("");
  const [subject, setSubject] = useState(`Invoice ${invoice.invoice_number} from Connected Steps`);
  const [body,    setBody]    = useState(`Dear ${invoice.client_name},\n\nPlease find attached invoice ${invoice.invoice_number} for ₹${fmtR(invoice.grand_total)}.\n\nPayment due by ${fmtDate(invoice.due_date)}.\n\nThank you for your business!\n\nBest regards,\nConnected Steps`);
  const [sending, setSending] = useState(false);
  const [error,   setError]   = useState("");

  async function send() {
    if (!to.trim()) { setError("To address is required"); return; }
    setSending(true); setError("");
    const res = await fetch(`/api/admin/manual-invoices/${invoice.id}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: to.split(",").map(s => s.trim()).filter(Boolean), cc: cc.split(",").map(s => s.trim()).filter(Boolean), subject, body }),
    });
    const data = await res.json();
    setSending(false);
    if (!res.ok) { setError(data.error ?? "Send failed"); return; }
    onSent();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <Card style={{ padding: "1.5rem", width: "min(540px, 95vw)", maxHeight: "90vh", overflowY: "auto" }}>
        <h2 style={{ margin: "0 0 16px", fontSize: "1rem", fontWeight: 800, color: "#fff" }}>📤 Send Invoice</h2>
        {error && <div style={{ background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: "0.82rem", color: "#f87171" }}>{error}</div>}
        <div style={{ marginBottom: 12 }}>
          <label style={label}>To (comma-separated)</label>
          <input style={inp} value={to} onChange={e => setTo(e.target.value)} placeholder="client@company.com" />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={label}>CC (optional)</label>
          <input style={inp} value={cc} onChange={e => setCc(e.target.value)} placeholder="accounts@company.com" />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={label}>Subject</label>
          <input style={inp} value={subject} onChange={e => setSubject(e.target.value)} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={label}>Message</label>
          <textarea style={{ ...inp, height: 150, resize: "vertical" }} value={body} onChange={e => setBody(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="primary" onClick={send} loading={sending}>Send Invoice</Button>
        </div>
      </Card>
    </div>
  );
}

// ── Mark Paid modal ───────────────────────────────────────────────────────────

function MarkPaidModal({ invoice, onClose, onPaid }: { invoice: Invoice; onClose: () => void; onPaid: () => void }) {
  const [status,   setStatus]   = useState("paid");
  const [amount,   setAmount]   = useState(Number(invoice.balance_due));
  const [date,     setDate]     = useState(new Date().toISOString().slice(0, 10));
  const [method,   setMethod]   = useState("bank_transfer");
  const [ref,      setRef]      = useState("");
  const [notes,    setNotes]    = useState("");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  async function save() {
    setSaving(true); setError("");
    const res = await fetch(`/api/admin/manual-invoices/${invoice.id}/mark-paid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, amount, payment_date: date, payment_method: method, reference_number: ref || null, notes: notes || null }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed"); return; }
    onPaid();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <Card style={{ padding: "1.5rem", width: "min(460px, 95vw)" }}>
        <h2 style={{ margin: "0 0 16px", fontSize: "1rem", fontWeight: 800, color: "#fff" }}>💰 Record Payment</h2>
        {error && <div style={{ background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: "0.82rem", color: "#f87171" }}>{error}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={label}>Status</label>
            <select style={inp} value={status} onChange={e => setStatus(e.target.value)}>
              <option value="paid">Fully Paid</option>
              <option value="partially_paid">Partially Paid</option>
            </select>
          </div>
          <div>
            <label style={label}>Amount (₹)</label>
            <input type="number" style={inp} value={amount} min={0} step="0.01" onChange={e => setAmount(Number(e.target.value))} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={label}>Payment Date</label>
            <input type="date" style={inp} value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label style={label}>Method</label>
            <select style={inp} value={method} onChange={e => setMethod(e.target.value)}>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="upi">UPI</option>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
              <option value="online">Online</option>
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={label}>Reference / UTR</label>
          <input style={inp} value={ref} onChange={e => setRef(e.target.value)} placeholder="NEFT/IMPS reference" />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={label}>Notes</label>
          <input style={inp} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="primary" onClick={save} loading={saving}>Record Payment</Button>
        </div>
      </Card>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [invoice,  setInvoice]  = useState<Invoice | null>(null);
  const [items,    setItems]    = useState<LineItem[]>([]);
  const [history,  setHistory]  = useState<HistoryEntry[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [alert,    setAlert]    = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const [showSend,     setShowSend]     = useState(false);
  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const [acting,       setActing]       = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res  = await fetch(`/api/admin/manual-invoices/${id}`);
    const data = await res.json();
    setInvoice(data.invoice ?? null);
    setItems(data.items ?? []);
    setHistory(data.history ?? []);
    setEmailLogs(data.emails ?? []);
    setPayments(data.payments ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  async function cancel() {
    if (!confirm("Cancel this invoice? It cannot be edited after cancellation.")) return;
    setActing("cancel");
    const res = await fetch(`/api/admin/manual-invoices/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment_status: "cancelled" }),
    });
    setActing(null);
    if (res.ok) { setAlert({ type: "success", msg: "Invoice cancelled" }); load(); }
    else { const d = await res.json(); setAlert({ type: "error", msg: d.error ?? "Failed" }); }
  }

  async function duplicate() {
    setActing("dup");
    const res  = await fetch(`/api/admin/manual-invoices/${id}/duplicate`, { method: "POST" });
    const data = await res.json();
    setActing(null);
    if (res.ok) router.push(`/admin/finance/manual-invoices/${data.invoice.id}`);
    else setAlert({ type: "error", msg: data.error ?? "Duplicate failed" });
  }

  if (loading) return <div style={{ padding: "4rem", textAlign: "center" }}><Spinner /></div>;
  if (!invoice) return <div style={{ padding: "2rem", color: "#f87171" }}>Invoice not found.</div>;

  const isDraft      = invoice.payment_status === "draft";
  const isCancelled  = invoice.payment_status === "cancelled";
  const canEdit      = isDraft;
  const canSend      = !isCancelled;
  const canMarkPaid  = !["paid", "cancelled"].includes(invoice.payment_status);

  return (
    <div style={{ padding: "1.5rem", maxWidth: 960, margin: "0 auto" }}>
      {showSend && <SendModal invoice={invoice} onClose={() => setShowSend(false)} onSent={() => { setShowSend(false); setAlert({ type: "success", msg: "Invoice sent!" }); load(); }} />}
      {showMarkPaid && <MarkPaidModal invoice={invoice} onClose={() => setShowMarkPaid(false)} onPaid={() => { setShowMarkPaid(false); setAlert({ type: "success", msg: "Payment recorded" }); load(); }} />}

      {/* Breadcrumb */}
      <div style={{ marginBottom: 14, fontSize: "0.8rem", color: "rgba(255,255,255,0.4)" }}>
        <Link href="/admin/finance/manual-invoices" style={{ color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>Manual Invoices</Link>
        {" / "}{invoice.invoice_number}
      </div>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "#fff" }}>{invoice.invoice_number}</h1>
            <Badge color={STATUS_COLOR[invoice.payment_status] as "green"}>
              {invoice.payment_status.replace("_", " ")}
            </Badge>
            <span style={{ fontSize: "0.78rem", color: "#555" }}>{TYPE_LABELS[invoice.invoice_type] ?? invoice.invoice_type}</span>
          </div>
          <div style={{ marginTop: 4, fontSize: "0.8rem", color: "rgba(255,255,255,0.5)" }}>
            {invoice.company_name || invoice.client_name} · {fmtDate(invoice.invoice_date)}
            {invoice.due_date && <span style={{ color: invoice.payment_status === "overdue" ? "#f87171" : "#555" }}> · Due {fmtDate(invoice.due_date)}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canEdit && (
            <Link href={`/admin/finance/manual-invoices/new?edit=${id}`}>
              <Button size="sm" variant="outline">✏️ Edit</Button>
            </Link>
          )}
          <a href={`/api/admin/manual-invoices/${id}/html`} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline">🖨 Print / PDF</Button>
          </a>
          {canSend && <Button size="sm" variant="outline" onClick={() => setShowSend(true)}>📤 Send</Button>}
          {canMarkPaid && <Button size="sm" variant="primary" onClick={() => setShowMarkPaid(true)}>💰 Mark Paid</Button>}
          <Button size="sm" variant="ghost" onClick={duplicate} loading={acting === "dup"}>⧉ Duplicate</Button>
          {!isCancelled && <Button size="sm" variant="ghost" onClick={cancel} loading={acting === "cancel"} style={{ color: "#f87171" }}>✕ Cancel</Button>}
        </div>
      </div>

      {alert && <Alert variant={alert.type === "success" ? "success" : "error"} style={{ marginBottom: 14 }}>{alert.msg}</Alert>}

      {/* Totals bar */}
      <Card style={{ padding: "0.875rem 1.25rem", marginBottom: 14, display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#fff", fontVariantNumeric: "tabular-nums" }}>₹{fmtR(invoice.grand_total)}</div>
          <div style={{ fontSize: "0.65rem", color: "#555", textTransform: "uppercase" }}>Grand Total</div>
        </div>
        {Number(invoice.advance_received) > 0 && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#4ade80", fontVariantNumeric: "tabular-nums" }}>₹{fmtR(invoice.advance_received)}</div>
            <div style={{ fontSize: "0.65rem", color: "#555", textTransform: "uppercase" }}>Advance Received</div>
          </div>
        )}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "1.1rem", fontWeight: 700, color: Number(invoice.balance_due) === 0 ? "#4ade80" : "#facc15", fontVariantNumeric: "tabular-nums" }}>₹{fmtR(invoice.balance_due)}</div>
          <div style={{ fontSize: "0.65rem", color: "#555", textTransform: "uppercase" }}>Balance Due</div>
        </div>
        <div style={{ flex: 1 }} />
        {/* preview iframe link */}
        <a href={`/api/admin/manual-invoices/${id}/html`} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: "0.78rem", color: "#e8620a", alignSelf: "center", textDecoration: "none" }}>
          View Invoice Preview →
        </a>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        {/* Client details */}
        <Card style={{ padding: "1rem 1.25rem" }}>
          <div style={section}>Client</div>
          <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#fff" }}>{invoice.company_name || invoice.client_name}</div>
          {invoice.company_name && <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.6)" }}>{invoice.client_name}</div>}
          {invoice.client_gst   && <div style={{ fontSize: "0.75rem", color: "#555", marginTop: 4 }}>GSTIN: {invoice.client_gst}</div>}
          {invoice.client_pan   && <div style={{ fontSize: "0.75rem", color: "#555" }}>PAN: {invoice.client_pan}</div>}
          {invoice.client_email && <div style={{ fontSize: "0.75rem", color: "#555", marginTop: 4 }}>{invoice.client_email}</div>}
          {invoice.client_phone && <div style={{ fontSize: "0.75rem", color: "#555" }}>{invoice.client_phone}</div>}
          {invoice.billing_address && <div style={{ fontSize: "0.72rem", color: "#555", marginTop: 6, lineHeight: 1.5 }}>{invoice.billing_address}</div>}
          {invoice.client_state  && <div style={{ fontSize: "0.72rem", color: "#555" }}>{invoice.client_state}{invoice.client_pincode ? ` – ${invoice.client_pincode}` : ""} · {invoice.client_country}</div>}
        </Card>

        {/* Reference details */}
        <Card style={{ padding: "1rem 1.25rem" }}>
          <div style={section}>Reference</div>
          {[
            { label: "Place of Supply", val: invoice.place_of_supply },
            { label: "Tax Type",   val: invoice.is_igst ? "IGST (Inter-state)" : "CGST + SGST (Same-state)" },
            { label: "Currency",   val: invoice.currency },
            { label: "PO Number",  val: invoice.po_number },
            { label: "Quotation",  val: invoice.quotation_ref },
            { label: "Project",    val: invoice.project_name },
            { label: "Period",     val: invoice.service_period },
            { label: "Terms",      val: invoice.payment_terms },
            { label: "Payment",    val: invoice.payment_method ?? null },
            { label: "Ref / UTR",  val: invoice.reference_number },
          ].filter(r => r.val).map(r => (
            <div key={r.label} style={{ display: "flex", gap: 8, marginBottom: 5, fontSize: "0.78rem" }}>
              <span style={{ color: "rgba(255,255,255,0.35)", minWidth: 110 }}>{r.label}</span>
              <span style={{ color: "rgba(255,255,255,0.7)" }}>{r.val}</span>
            </div>
          ))}
          {invoice.customer_notes && (
            <div style={{ marginTop: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 6, fontSize: "0.75rem", color: "rgba(255,255,255,0.5)", whiteSpace: "pre-wrap" }}>
              {invoice.customer_notes}
            </div>
          )}
        </Card>
      </div>

      {/* Line items */}
      <Card style={{ padding: "1rem 1.25rem", marginBottom: 14 }}>
        <div style={section}>Line Items</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {["#", "Description", "Unit", "Qty", "Rate", "Disc%", "GST%", "Amount"].map(h => (
                  <th key={h} style={{ padding: "6px 10px", textAlign: h === "Amount" ? "right" : "left", fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", color: "rgba(255,255,255,0.35)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={it.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "8px 10px", color: "#555" }}>{idx + 1}</td>
                  <td style={{ padding: "8px 10px", color: "#fff", fontWeight: 500 }}>{it.description}</td>
                  <td style={{ padding: "8px 10px", color: "#555" }}>{it.unit || "—"}</td>
                  <td style={{ padding: "8px 10px", color: "rgba(255,255,255,0.7)", fontVariantNumeric: "tabular-nums" }}>{it.quantity}</td>
                  <td style={{ padding: "8px 10px", color: "rgba(255,255,255,0.7)", fontVariantNumeric: "tabular-nums" }}>₹{fmtR(it.rate)}</td>
                  <td style={{ padding: "8px 10px", color: "#555" }}>{it.discount_pct > 0 ? `${it.discount_pct}%` : "—"}</td>
                  <td style={{ padding: "8px 10px", color: "#fb923c" }}>{it.gst_pct}%</td>
                  <td style={{ padding: "8px 10px", color: "#fff", fontWeight: 700, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>₹{fmtR(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* GST breakdown */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <div style={{ minWidth: 260, fontSize: "0.82rem" }}>
            {[
              { label: "Subtotal",        val: invoice.subtotal,        color: "rgba(255,255,255,0.6)" },
              { label: "Discount",        val: -invoice.discount_amount, color: "#f87171", hide: Number(invoice.discount_amount) === 0 },
              { label: "Taxable Amount",  val: invoice.taxable_amount,  color: "rgba(255,255,255,0.7)" },
              { label: invoice.is_igst ? "IGST" : "CGST", val: invoice.is_igst ? invoice.igst_amount : invoice.cgst_amount, color: "#fb923c" },
              ...(!invoice.is_igst ? [{ label: "SGST", val: invoice.sgst_amount, color: "#fb923c", hide: false }] : []),
              { label: "Round Off",       val: invoice.round_off,       color: "rgba(255,255,255,0.35)", hide: Number(invoice.round_off) === 0 },
            ].filter(r => !r.hide).map(r => (
              <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ color: r.color }}>{r.label}</span>
                <span style={{ color: r.color, fontVariantNumeric: "tabular-nums" }}>
                  {r.val < 0 ? `−₹${fmtR(-r.val)}` : `₹${fmtR(r.val)}`}
                </span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 0", fontWeight: 800 }}>
              <span style={{ color: "#fff" }}>Grand Total</span>
              <span style={{ color: "#4ade80", fontVariantNumeric: "tabular-nums" }}>₹{fmtR(invoice.grand_total)}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Payments */}
      {payments.length > 0 && (
        <Card style={{ padding: "1rem 1.25rem", marginBottom: 14 }}>
          <div style={section}>Payment History</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {["Date", "Method", "Reference", "Amount", "Notes"].map(h => (
                  <th key={h} style={{ padding: "5px 8px", textAlign: "left", fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", color: "rgba(255,255,255,0.35)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "7px 8px", color: "rgba(255,255,255,0.6)" }}>{fmtDate(p.payment_date)}</td>
                  <td style={{ padding: "7px 8px", color: "#555" }}>{p.payment_method?.replace("_", " ")}</td>
                  <td style={{ padding: "7px 8px", color: "#555" }}>{p.reference_number ?? "—"}</td>
                  <td style={{ padding: "7px 8px", color: "#4ade80", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>₹{fmtR(p.amount)}</td>
                  <td style={{ padding: "7px 8px", color: "#555" }}>{p.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Email logs */}
      {emailLogs.length > 0 && (
        <Card style={{ padding: "1rem 1.25rem", marginBottom: 14 }}>
          <div style={section}>Communication History</div>
          {emailLogs.map(log => (
            <div key={log.id} style={{ padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: "0.8rem" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                <span style={{ color: "#555", minWidth: 90, flexShrink: 0 }}>{fmtDate(log.sent_at ?? "")}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "rgba(255,255,255,0.6)", marginBottom: 2 }}>
                    <strong style={{ color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>To: </strong>
                    {(log.to_emails ?? []).join(", ")}
                  </div>
                  {(log.cc_emails ?? []).length > 0 && (
                    <div style={{ color: "#555", fontSize: "0.74rem" }}>
                      CC: {(log.cc_emails ?? []).join(", ")}
                    </div>
                  )}
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.75rem", marginTop: 2 }}>{log.subject}</div>
                  {log.status === "failed" && log.failure_reason && (
                    <div style={{ marginTop: 4, padding: "4px 8px", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 4, color: "#f87171", fontSize: "0.74rem" }}>
                      ⚠ {log.failure_reason}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  <Badge color={log.status === "sent" ? "green" : "red"} size="sm">{log.status}</Badge>
                  {log.status === "failed" && (
                    <button
                      type="button"
                      onClick={() => setShowSend(true)}
                      style={{ padding: "2px 10px", borderRadius: 4, background: "rgba(232,98,10,0.12)", border: "1px solid rgba(232,98,10,0.3)", color: "#e8620a", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer" }}
                    >
                      Resend
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Audit history */}
      {history.length > 0 && (
        <Card style={{ padding: "1rem 1.25rem", marginBottom: 14 }}>
          <div style={section}>Audit Trail</div>
          {history.map(h => (
            <div key={h.id} style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: "0.78rem" }}>
              <span style={{ color: "#555", minWidth: 90, flexShrink: 0 }}>{fmtDate(h.created_at)}</span>
              <span style={{ color: "#e8620a", minWidth: 90, flexShrink: 0 }}>{h.action.replace(/_/g, " ")}</span>
              <span style={{ color: "rgba(255,255,255,0.5)", flex: 1 }}>{h.description}</span>
              <span style={{ color: "#555", flexShrink: 0 }}>by {h.actor}</span>
            </div>
          ))}
        </Card>
      )}

      {/* Internal notes */}
      {invoice.internal_notes && (
        <Card style={{ padding: "1rem 1.25rem", marginBottom: 14 }}>
          <div style={section}>Internal Notes</div>
          <p style={{ margin: 0, fontSize: "0.82rem", color: "rgba(255,255,255,0.5)", whiteSpace: "pre-wrap" }}>{invoice.internal_notes}</p>
        </Card>
      )}
    </div>
  );
}
