"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, Button, Badge, Spinner, Alert } from "@/components/ui/ds";

interface Quotation {
  id: string; quotation_number: string; version: number; status: string;
  company_name: string | null; client_name: string; client_email: string | null;
  proposal_title: string; event_date: string | null; valid_until: string | null;
  grand_total: number; created_at: string;
}

interface Stats {
  total: number; draft: number; sent: number; viewed: number;
  accepted: number; rejected: number; expired: number; converted: number;
  total_value: number; accepted_value: number; conversion_rate: number;
}

const STATUS_COLOR: Record<string, "green" | "blue" | "yellow" | "red" | "gray" | "purple" | "orange"> = {
  draft: "gray", sent: "blue", viewed: "purple", accepted: "green",
  rejected: "red", expired: "yellow", converted: "orange", cancelled: "gray",
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

const inp: React.CSSProperties = {
  padding: "7px 11px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6, color: "#fff", fontSize: "0.82rem", outline: "none", fontFamily: "inherit",
};

export default function QuotationsPage() {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [stats,      setStats]      = useState<Stats | null>(null);
  const [total,      setTotal]      = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [alert,      setAlert]      = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const [q,      setQ]      = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
    if (q)      params.set("q", q);
    if (status) params.set("status", status);
    const res  = await fetch(`/api/admin/quotations?${params}`);
    const data = await res.json();
    setQuotations(data.quotations ?? []);
    setStats(data.stats ?? null);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [q, status, offset]);

  useEffect(() => { load(); }, [load]);

  const dashStats = [
    { label: "Total",           value: stats?.total            ?? 0,   color: "#fff" },
    { label: "Draft",           value: stats?.draft            ?? 0,   color: "#6b7280" },
    { label: "Sent",            value: stats?.sent             ?? 0,   color: "#60a5fa" },
    { label: "Accepted",        value: stats?.accepted         ?? 0,   color: "#4ade80" },
    { label: "Rejected",        value: stats?.rejected         ?? 0,   color: "#f87171" },
    { label: "Converted",       value: stats?.converted        ?? 0,   color: "#fb923c" },
    { label: "Total Value",     value: fmtRupees(stats?.total_value),   color: "#facc15" },
    { label: "Conversion Rate", value: `${stats?.conversion_rate ?? 0}%`, color: "#a78bfa" },
  ];

  return (
    <div style={{ padding: "1.5rem", maxWidth: 1100, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "#fff" }}>📝 Quotations & Proposals</h1>
          <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "#555" }}>B2B proposals, event packages, and sponsorship quotations</p>
        </div>
        <Link href="/admin/finance/quotations/new">
          <Button variant="primary" size="sm">+ New Quotation</Button>
        </Link>
      </div>

      {alert && <Alert variant={alert.type === "success" ? "success" : "error"} style={{ marginBottom: 14 }}>{alert.msg}</Alert>}

      {/* Dashboard stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10, marginBottom: 20 }}>
        {dashStats.map(s => (
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
            placeholder="Search by number, client, company, title…"
            style={{ ...inp, flex: 1, minWidth: 200 }} />
          <select value={status} onChange={e => { setStatus(e.target.value); setOffset(0); }}
            style={{ ...inp, minWidth: 140 }}>
            <option value="">All Statuses</option>
            {["draft","sent","viewed","accepted","rejected","expired","converted"].map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
          <Button size="sm" variant="ghost" onClick={load}>↻ Refresh</Button>
          <Link href="/admin/finance/quotations/new">
            <Button size="sm" variant="outline">+ Quotation</Button>
          </Link>
        </div>
      </Card>

      {/* Table */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "3rem", textAlign: "center" }}><Spinner /></div>
        ) : quotations.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: "0.9rem" }}>
            No quotations found.{" "}
            <Link href="/admin/finance/quotations/new" style={{ color: "#e8620a" }}>Create one →</Link>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  {["Quotation #", "Created", "Client", "Proposal Title", "Value", "Valid Until", "Status", "Actions"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.35)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quotations.map(q => (
                  <tr key={q.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <td style={{ padding: "10px 12px" }}>
                      <Link href={`/admin/finance/quotations/${q.id}`}
                        style={{ color: "#e8620a", textDecoration: "none", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        {q.quotation_number}
                      </Link>
                      {q.version > 1 && <span style={{ marginLeft: 6, fontSize: "0.68rem", color: "#555" }}>v{q.version}</span>}
                    </td>
                    <td style={{ padding: "10px 12px", color: "rgba(255,255,255,0.6)" }}>{fmtDate(q.created_at)}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ fontWeight: 600, color: "#fff" }}>{q.company_name || q.client_name}</div>
                      {q.company_name && <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.4)" }}>{q.client_name}</div>}
                      {q.client_email && <div style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.3)" }}>{q.client_email}</div>}
                    </td>
                    <td style={{ padding: "10px 12px", color: "rgba(255,255,255,0.7)", maxWidth: 220 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.proposal_title}</div>
                      {q.event_date && <div style={{ fontSize: "0.7rem", color: "#555", marginTop: 2 }}>Event: {fmtDate(q.event_date)}</div>}
                    </td>
                    <td style={{ padding: "10px 12px", fontWeight: 700, color: "#fff", fontVariantNumeric: "tabular-nums" }}>
                      ₹{Number(q.grand_total).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: "10px 12px", color: q.valid_until && new Date(q.valid_until) < new Date() ? "#f87171" : "rgba(255,255,255,0.5)", fontSize: "0.75rem" }}>
                      {fmtDate(q.valid_until)}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <Badge color={STATUS_COLOR[q.status] as "green"} size="sm">
                        {q.status.charAt(0).toUpperCase() + q.status.slice(1)}
                      </Badge>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Link href={`/admin/finance/quotations/${q.id}`}>
                          <Button size="sm" variant="ghost">View</Button>
                        </Link>
                        <a href={`/api/admin/quotations/${q.id}/html`} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="ghost">🖨</Button>
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
    </div>
  );
}
