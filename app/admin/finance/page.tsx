"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Invoice {
  id: string; invoice_number: string; user_name: string; user_email: string;
  product_name: string; product_type: string; subtotal: number;
  gst_amount: number; total_amount: number; invoice_status: string;
  email_sent: boolean; email_sent_at: string | null; email_error: string | null;
  created_at: string;
}

interface Summary { total: number; totalAmount: number; totalGST: number; emailSent: number; emailFailed: number; }

const TYPE_LABELS: Record<string,string> = { event:"Event", membership:"Membership", training_plan:"Training Plan", coaching:"Coaching" };

function fmtRupees(n: number) {
  if (n >= 1_00_000) return `₹${(n/1_00_000).toFixed(1)}L`;
  if (n >= 1_000)    return `₹${(n/1_000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
}
function fmtDate(d: string) { return new Date(d).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" }); }

const S: Record<string, React.CSSProperties> = {
  card:  { background:"#111", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, padding:"1.25rem" },
  input: { padding:"8px 12px", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:6, color:"#fff", fontSize:"0.82rem", outline:"none", fontFamily:"inherit" },
};

export default function AdminFinancePage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary,  setSummary]  = useState<Summary | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [search,   setSearch]   = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [resending,   setResending]   = useState<string | null>(null);
  const [resendMsg,   setResendMsg]   = useState("");
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{ summary?: { total_generated: number; total_failed: number; already_had_invoice: number } } | null>(null);
  const [preview, setPreview] = useState<{ estimate_to_generate: number } | null>(null);
  const [activeTab, setActiveTab] = useState<"bills" | "settlement">("bills");
  const [settlement, setSettlement] = useState<{ summary?: { gross_total: number; razorpay_fees_total: number; gst_on_fees_total: number; net_settled_total: number; total_transactions: number } } | null>(null);
  const [settlementLoading, setSettlementLoading] = useState(false);

  async function load(q = search, type = typeFilter) {
    setLoading(true); setError("");
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (type) params.set("type", type);
    try {
      const res  = await fetch(`/api/admin/invoices?${params}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to load"); return; }
      setInvoices(data.invoices ?? []);
      setSummary(data.summary ?? null);
    } catch { setError("Network error."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    fetch("/api/admin/invoices/backfill").then(r => r.json()).then(setPreview).catch(() => {});
  }, []); // eslint-disable-line

  async function loadSettlement() {
    setSettlementLoading(true);
    const res = await fetch("/api/admin/finance/settlement").catch(() => null);
    if (res?.ok) { const d = await res.json(); setSettlement(d); }
    setSettlementLoading(false);
  }

  useEffect(() => {
    if (activeTab === "settlement" && !settlement) loadSettlement();
  }, [activeTab]); // eslint-disable-line

  async function runBackfill() {
    if (!confirm(`Generate invoices for all existing paid transactions?\n\nThis will send emails to users. This may take several minutes.`)) return;
    setBackfilling(true); setBackfillResult(null);
    try {
      const res  = await fetch("/api/admin/invoices/backfill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ send_email: true }) });
      const data = await res.json();
      setBackfillResult(data);
      load(); // refresh invoice list
    } catch { setBackfillResult({ summary: { total_generated: 0, total_failed: 0, already_had_invoice: 0 } }); }
    finally { setBackfilling(false); }
  }

  async function resend(id: string) {
    setResending(id); setResendMsg("");
    const res  = await fetch(`/api/admin/invoices/${id}/resend`, { method: "POST" });
    const data = await res.json();
    setResendMsg(res.ok ? `✅ ${data.message}` : `❌ ${data.error}`);
    setResending(null);
    if (res.ok) load();
  }

  function exportCSV() {
    const rows = [["Invoice No","Name","Email","Product","Type","Subtotal","GST","Total","Status","Email Sent","Date"].join(","),
      ...invoices.map(i => [i.invoice_number,i.user_name,i.user_email,i.product_name,i.product_type,i.subtotal,i.gst_amount,i.total_amount,i.invoice_status,i.email_sent?"Yes":"No",fmtDate(i.created_at)].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(","))
    ].join("\n");
    const a = document.createElement("a"); a.href = "data:text/csv;charset=utf-8,"+encodeURIComponent(rows); a.download = `invoices-${Date.now()}.csv`; a.click();
  }

  return (
    <div style={{ minHeight:"100vh", background:"#0a0a0a", color:"#fff" }}>
      <header style={{ position:"sticky", top:0, zIndex:40, background:"rgba(10,10,10,0.97)", borderBottom:"1px solid rgba(255,255,255,0.07)", padding:"0 2rem", height:"60px", display:"flex", alignItems:"center", gap:"0.75rem" }}>
        <Link href="/admin" style={{ color:"#888", textDecoration:"none", fontSize:"0.85rem" }}>Admin</Link>
        <span style={{ color:"#444" }}>/</span>
        <span style={{ color:"#888", fontSize:"0.85rem" }}>Finance & Invoices</span>
        <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
          {preview && preview.estimate_to_generate > 0 && (
            <span style={{ fontSize:"0.72rem", color:"#eab308" }}>{preview.estimate_to_generate} without invoices</span>
          )}
          <button onClick={runBackfill} disabled={backfilling}
            style={{ padding:"6px 14px", background: backfilling ? "#1a1a1a" : "#e8620a", border:"none", borderRadius:6, color: backfilling ? "#444" : "#fff", cursor: backfilling ? "not-allowed" : "pointer", fontSize:"0.78rem", fontFamily:"inherit", fontWeight:600 }}>
            {backfilling ? "Generating…" : "⚡ Generate Missing Invoices"}
          </button>
          <button onClick={exportCSV} style={{ padding:"6px 14px", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:6, color:"#fff", cursor:"pointer", fontSize:"0.78rem", fontFamily:"inherit" }}>Export CSV</button>
        </div>
      </header>

      <div style={{ maxWidth:"1200px", margin:"0 auto", padding:"2rem 1.5rem" }}>

        {/* Summary cards */}
        {summary && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:"0.875rem", marginBottom:"1.5rem" }}>
            {[
              { label:"Total Invoices",  value: summary.total,                             color:"#fff"    },
              { label:"Total Revenue",   value: fmtRupees(summary.totalAmount),            color:"#e8620a" },
              { label:"GST Collected",   value: fmtRupees(summary.totalGST),              color:"#fb923c" },
              { label:"Emails Sent",     value: summary.emailSent,                         color:"#4ade80" },
              { label:"Failed Emails",   value: summary.emailFailed,                       color: summary.emailFailed > 0 ? "#f87171" : "#555" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ ...S.card, textAlign:"center" }}>
                <div style={{ fontSize:"1.5rem", fontWeight:800, color }}>{value}</div>
                <div style={{ fontSize:"11px", color:"#555", marginTop:3, textTransform:"uppercase", letterSpacing:"0.06em" }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Composition Scheme banner */}
        <div style={{ background:"rgba(245,158,11,0.07)", border:"1px solid rgba(245,158,11,0.25)", borderRadius:8, padding:"10px 16px", marginBottom:"1.5rem", fontSize:"12px", color:"#aaa" }}>
          <strong style={{ color:"#f59e0b" }}>Connected Steps</strong> · GSTIN: 36AAVFC9839Q1Z4 · <strong style={{ color:"#f59e0b" }}>GST Composition Scheme</strong> · No tax collected from customers · Hyderabad, Telangana
        </div>

        {/* Tab switcher */}
        <div style={{ display:"flex", gap:4, background:"rgba(255,255,255,0.04)", borderRadius:8, padding:4, marginBottom:"1.5rem", width:"fit-content" }}>
          {(["bills","settlement"] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              style={{ padding:"7px 18px", borderRadius:6, border:"none", cursor:"pointer", fontSize:"0.82rem", fontWeight:600, background: activeTab===t ? "#e8620a" : "transparent", color: activeTab===t ? "#fff" : "#666", fontFamily:"inherit" }}>
              {t === "bills" ? "Bills of Supply" : "🔒 Settlement Report"}
            </button>
          ))}
        </div>

        {/* Settlement Report (admin-only internal) */}
        {activeTab === "settlement" && (
          <div>
            <div style={{ background:"rgba(239,68,68,0.06)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:8, padding:"10px 16px", marginBottom:"1rem", fontSize:"12px", color:"#f87171" }}>
              🔒 <strong>Internal Only</strong> — This report shows Razorpay platform fees and net settlements. Never share with customers.
            </div>
            {settlementLoading ? (
              <div style={{ padding:"3rem", textAlign:"center", color:"#555" }}>Loading settlement data…</div>
            ) : settlement?.summary && (
              <>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:"0.875rem", marginBottom:"1.5rem" }}>
                  {[
                    { label:"Gross Collected",      value:`₹${(settlement.summary.gross_total ?? 0).toFixed(2)}`,          color:"#fff"    },
                    { label:"Razorpay Fees (2%)",    value:`₹${(settlement.summary.razorpay_fees_total ?? 0).toFixed(2)}`,  color:"#f87171" },
                    { label:"GST on RP Fees (18%)",  value:`₹${(settlement.summary.gst_on_fees_total ?? 0).toFixed(2)}`,   color:"#f87171" },
                    { label:"Net Settled",           value:`₹${(settlement.summary.net_settled_total ?? 0).toFixed(2)}`,   color:"#4ade80" },
                    { label:"Transactions",          value: settlement.summary.total_transactions,                          color:"#aaa"    },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ ...S.card, textAlign:"center" }}>
                      <div style={{ fontSize:"1.3rem", fontWeight:800, color }}>{value}</div>
                      <div style={{ fontSize:"11px", color:"#555", marginTop:3, textTransform:"uppercase", letterSpacing:"0.06em" }}>{label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ ...S.card, fontSize:"12px", color:"#666" }}>
                  <strong style={{ color:"#fff" }}>How Razorpay fees are calculated:</strong><br/>
                  Fee = 2% of gross amount + 18% GST on that fee.<br/>
                  Example: ₹1,000 → RP fee ₹20 → GST on fee ₹3.60 → Total deduction ₹23.60 → Net settlement ₹976.40<br/>
                  <span style={{ color:"#555", fontSize:"11px" }}>Actual fees may vary. Verify against your Razorpay dashboard for exact settlements.</span>
                </div>
              </>
            )}
          </div>
        )}

        {backfillResult?.summary && (
          <div style={{ padding:"12px 16px", borderRadius:8, background: backfillResult.summary.total_failed > 0 ? "rgba(234,179,8,0.1)" : "rgba(74,222,128,0.1)", border:`1px solid ${backfillResult.summary.total_failed > 0 ? "rgba(234,179,8,0.3)" : "rgba(74,222,128,0.3)"}`, fontSize:"13px", color: backfillResult.summary.total_failed > 0 ? "#eab308" : "#4ade80", marginBottom:"1rem" }}>
            ✅ Generated: <strong>{backfillResult.summary.total_generated}</strong> &nbsp;
            ❌ Failed: <strong>{backfillResult.summary.total_failed}</strong> &nbsp;
            ⏭ Already had invoice: <strong>{backfillResult.summary.already_had_invoice}</strong>
          </div>
        )}

        {resendMsg && (
          <div style={{ padding:"10px 16px", borderRadius:8, background: resendMsg.startsWith("✅") ? "rgba(74,222,128,0.1)" : "rgba(239,68,68,0.1)", color: resendMsg.startsWith("✅") ? "#4ade80" : "#f87171", fontSize:"13px", marginBottom:"1rem" }}>
            {resendMsg}
          </div>
        )}

        {/* Bills of Supply tab content */}
        {activeTab === "bills" && <>
        {/* Filters */}
        <div style={{ display:"flex", gap:"0.75rem", marginBottom:"1.5rem", flexWrap:"wrap", alignItems:"center" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && load(search, typeFilter)}
            placeholder="Invoice No, name, email, payment ID…" style={{ ...S.input, flex:"1 1 260px" }} />
          <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); load(search, e.target.value); }}
            style={{ ...S.input, cursor:"pointer", colorScheme:"dark" }}>
            <option value="">All Types</option>
            {Object.entries(TYPE_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button onClick={() => load(search, typeFilter)} style={{ padding:"8px 18px", background:"#e8620a", border:"none", borderRadius:6, color:"#fff", fontWeight:700, cursor:"pointer", fontSize:"0.82rem", fontFamily:"inherit" }}>Search</button>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ textAlign:"center", padding:"4rem", color:"#555" }}>Loading…</div>
        ) : error ? (
          <div style={{ color:"#f87171", padding:"1rem" }}>{error}</div>
        ) : (
          <div style={{ ...S.card, padding:0, overflow:"hidden" }}>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"0.8rem" }}>
                <thead>
                  <tr style={{ background:"rgba(255,255,255,0.04)" }}>
                    {["Invoice #","User","Product","Subtotal","GST","Total","Status","Email","Date","Actions"].map(h => (
                      <th key={h} style={{ padding:"9px 12px", textAlign:"left", fontSize:"10px", color:"#555", textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:700, whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoices.length === 0 ? (
                    <tr><td colSpan={10} style={{ padding:"3rem", textAlign:"center", color:"#555" }}>No invoices found.</td></tr>
                  ) : invoices.map(inv => (
                    <tr key={inv.id} style={{ borderTop:"1px solid rgba(255,255,255,0.05)" }}>
                      <td style={{ padding:"9px 12px" }}>
                        <span style={{ fontFamily:"monospace", color:"#e8620a", fontSize:"0.75rem" }}>{inv.invoice_number}</span>
                      </td>
                      <td style={{ padding:"9px 12px" }}>
                        <div style={{ fontWeight:600, color:"#fff", fontSize:"0.78rem" }}>{inv.user_name}</div>
                        <div style={{ color:"#555", fontSize:"0.7rem" }}>{inv.user_email}</div>
                      </td>
                      <td style={{ padding:"9px 12px", color:"#ccc" }}>
                        <div>{inv.product_name}</div>
                        <div style={{ fontSize:"0.7rem", color:"#555" }}>{TYPE_LABELS[inv.product_type] ?? inv.product_type}</div>
                      </td>
                      <td style={{ padding:"9px 12px", color:"#aaa" }}>₹{inv.subtotal.toFixed(2)}</td>
                      <td style={{ padding:"9px 12px", color:"#aaa" }}>₹{inv.gst_amount.toFixed(2)}</td>
                      <td style={{ padding:"9px 12px", color:"#e8620a", fontWeight:700 }}>₹{inv.total_amount.toFixed(2)}</td>
                      <td style={{ padding:"9px 12px" }}>
                        <span style={{ fontSize:"9px", fontWeight:700, padding:"2px 7px", borderRadius:999, color: inv.invoice_status==="sent" ? "#4ade80" : "#eab308", background: inv.invoice_status==="sent" ? "rgba(74,222,128,0.1)" : "rgba(234,179,8,0.1)" }}>
                          {inv.invoice_status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding:"9px 12px" }}>
                        {inv.email_sent ? (
                          <span style={{ fontSize:"9px", color:"#4ade80" }}>✓ Sent</span>
                        ) : inv.email_error ? (
                          <span style={{ fontSize:"9px", color:"#f87171" }} title={inv.email_error}>✗ Failed</span>
                        ) : (
                          <span style={{ fontSize:"9px", color:"#555" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding:"9px 12px", color:"#555", whiteSpace:"nowrap" }}>{fmtDate(inv.created_at)}</td>
                      <td style={{ padding:"9px 12px" }}>
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                          <a href={`/api/invoices/${encodeURIComponent(inv.invoice_number)}`} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize:"0.7rem", color:"#60a5fa", textDecoration:"none", fontWeight:600 }}>View</a>
                          <button onClick={() => resend(inv.id)} disabled={resending === inv.id}
                            style={{ background:"none", border:"none", cursor:"pointer", fontSize:"0.7rem", color:"#e8620a", fontFamily:"inherit", fontWeight:600, padding:0 }}>
                            {resending === inv.id ? "…" : "Resend"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div style={{ marginTop:"0.75rem", fontSize:"11px", color:"#555" }}>{invoices.length} bills of supply</div>
        </>}
      </div>
    </div>
  );
}
