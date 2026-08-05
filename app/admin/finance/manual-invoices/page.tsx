"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, Button, Badge, Spinner, Alert } from "@/components/ui/ds";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Invoice {
  id: string; invoice_number: string; invoice_date: string; due_date: string | null;
  invoice_type: string; client_type: string; company_name: string | null;
  client_name: string; client_email: string | null; grand_total: number;
  payment_status: string; created_at: string;
}

interface Summary {
  total: number; draft: number; sent: number; paid: number; pending: number;
  overdue: number; cancelled: number; outstanding: number; revenue_month: number; gst_month: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, "green" | "blue" | "yellow" | "red" | "gray" | "purple"> = {
  draft: "gray", sent: "blue", viewed: "purple", partially_paid: "yellow",
  paid: "green", cancelled: "gray", overdue: "red",
};

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtRupees(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (v >= 1_00_000) return `₹${(v / 1_00_000).toFixed(2)}L`;
  if (v >= 1_000)    return `₹${(v / 1_000).toFixed(1)}K`;
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

const TYPE_LABELS: Record<string, string> = {
  tax_invoice: "Tax Invoice", proforma: "Proforma", credit_note: "Credit Note", debit_note: "Debit Note",
};

const S: React.CSSProperties = {} as React.CSSProperties;
const inp: React.CSSProperties = {
  padding: "7px 11px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6, color: "#fff", fontSize: "0.82rem", outline: "none", fontFamily: "inherit",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ManualInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary,  setSummary]  = useState<Summary | null>(null);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [alert,    setAlert]    = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const [q,      setQ]      = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);

  const LIMIT = 50;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
    if (q)      params.set("q", q);
    if (status) params.set("status", status);
    const res  = await fetch(`/api/admin/manual-invoices?${params}`);
    const data = await res.json();
    setInvoices(data.invoices ?? []);
    setSummary(data.summary ?? null);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [q, status, offset]);

  useEffect(() => { load(); }, [load]);

  const stats = [
    { label: "Total", value: summary?.total ?? 0, color: "#fff" },
    { label: "Draft",    value: summary?.draft    ?? 0, color: "#6b7280" },
    { label: "Sent",     value: summary?.sent     ?? 0, color: "#60a5fa" },
    { label: "Paid",     value: summary?.paid     ?? 0, color: "#4ade80" },
    { label: "Overdue",  value: summary?.overdue  ?? 0, color: "#f87171" },
    { label: "Outstanding", value: fmtRupees(summary?.outstanding), color: "#facc15" },
    { label: "Revenue (Month)", value: fmtRupees(summary?.revenue_month), color: "#a78bfa" },
    { label: "GST (Month)",     value: fmtRupees(summary?.gst_month),     color: "#fb923c" },
  ];

  return (
    <div style={{ padding: "1.5rem", maxWidth: 1100, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "#fff" }}>🧾 Manual Invoices</h1>
          <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "#555" }}>GST invoices for clients, sponsors, and corporates</p>
        </div>
        <Link href="/admin/finance/manual-invoices/new">
          <Button variant="primary" size="sm">+ New Invoice</Button>
        </Link>
      </div>

      {alert && <Alert variant={alert.type === "success" ? "success" : "error"} style={{ marginBottom: 14 }}>{alert.msg}</Alert>}

      {/* Dashboard stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10, marginBottom: 20 }}>
        {stats.map(s => (
          <Card key={s.label} style={{ padding: "0.85rem", textAlign: "center" }}>
            <div style={{ fontSize: typeof s.value === "number" ? "1.5rem" : "1rem", fontWeight: 800, color: s.color, fontVariantNumeric: "tabular-nums" }}>
              {s.value}
            </div>
            <div style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", marginTop: 3, letterSpacing: "0.08em" }}>
              {s.label}
            </div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card style={{ padding: "0.875rem 1.25rem", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input value={q} onChange={e => { setQ(e.target.value); setOffset(0); }}
            placeholder="Search by number, client, company, email…"
            style={{ ...inp, flex: 1, minWidth: 200 }} />
          <select value={status} onChange={e => { setStatus(e.target.value); setOffset(0); }}
            style={{ ...inp, minWidth: 140 }}>
            <option value="">All Statuses</option>
            {["draft","sent","viewed","partially_paid","paid","overdue","cancelled"].map(s => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </select>
          <Button size="sm" variant="ghost" onClick={load}>↻ Refresh</Button>
          <Link href="/admin/finance/manual-invoices/new">
            <Button size="sm" variant="outline">+ Invoice</Button>
          </Link>
        </div>
      </Card>

      {/* Table */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "3rem", textAlign: "center" }}><Spinner /></div>
        ) : invoices.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: "0.9rem" }}>
            No invoices found.{" "}
            <Link href="/admin/finance/manual-invoices/new" style={{ color: "#e8620a" }}>Create one →</Link>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  {["Invoice #", "Date", "Client", "Type", "Amount", "Status", "Actions"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.35)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <td style={{ padding: "10px 12px" }}>
                      <Link href={`/admin/finance/manual-invoices/${inv.id}`}
                        style={{ color: "#e8620a", textDecoration: "none", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        {inv.invoice_number}
                      </Link>
                    </td>
                    <td style={{ padding: "10px 12px", color: "rgba(255,255,255,0.6)" }}>
                      {fmtDate(inv.invoice_date)}
                      {inv.due_date && <div style={{ fontSize: "0.7rem", color: "#f87171" }}>Due {fmtDate(inv.due_date)}</div>}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ fontWeight: 600, color: "#fff" }}>{inv.company_name || inv.client_name}</div>
                      {inv.company_name && <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.4)" }}>{inv.client_name}</div>}
                      {inv.client_email && <div style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.3)" }}>{inv.client_email}</div>}
                    </td>
                    <td style={{ padding: "10px 12px", color: "rgba(255,255,255,0.5)", fontSize: "0.75rem" }}>
                      {TYPE_LABELS[inv.invoice_type] ?? inv.invoice_type}
                    </td>
                    <td style={{ padding: "10px 12px", fontWeight: 700, color: "#fff", fontVariantNumeric: "tabular-nums" }}>
                      ₹{Number(inv.grand_total).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <Badge color={STATUS_COLOR[inv.payment_status] as "green"} size="sm">
                        {inv.payment_status.replace("_", " ")}
                      </Badge>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Link href={`/admin/finance/manual-invoices/${inv.id}`}>
                          <Button size="sm" variant="ghost">View</Button>
                        </Link>
                        <a href={`/api/admin/manual-invoices/${inv.id}/html`} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="ghost">🖨 Print</Button>
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > LIMIT && (
          <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: "0.8rem", color: "#555" }}>
            <span>{offset + 1}–{Math.min(offset + LIMIT, total)} of {total}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <Button size="sm" variant="ghost" onClick={() => setOffset(Math.max(0, offset - LIMIT))} disabled={offset === 0}>← Prev</Button>
              <Button size="sm" variant="ghost" onClick={() => setOffset(offset + LIMIT)} disabled={offset + LIMIT >= total}>Next →</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Links */}
      <div style={{ marginTop: 16, display: "flex", gap: 12, fontSize: "0.8rem" }}>
        <Link href="/admin/settings/billing" style={{ color: "#555", textDecoration: "none" }}>⚙️ Billing Settings</Link>
      </div>
    </div>
  );
}
