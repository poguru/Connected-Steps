"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { Button, Card, Badge, Alert } from "@/components/ui/ds";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CancelledReg {
  id: string; registration_code: string;
  user_name: string; user_email: string; phone: string | null;
  payment_status: string; final_price: number;
  cancelled_at: string | null; cancelled_by: string | null; cancellation_reason: string | null;
  refund_status: string | null; refund_amount: number | null; refund_id: string | null;
  refunded_at: string | null; refund_failure_reason: string | null;
  refund_requested_by: string | null;
  razorpay_payment_id: string | null;
}

interface CancelRequest {
  id: string; registration_id: string;
  user_email: string; user_name: string; reason: string;
  status: string; requested_at: string;
  reviewed_at: string | null; reviewed_by: string | null; review_note: string | null;
}

interface AuditEntry {
  id: string; action: string; actor: string; actor_type: string;
  payload: Record<string, unknown> | null; created_at: string; registration_code: string;
}

interface Stats {
  total_cancelled: number; paid_cancelled: number;
  refund_pending: number; refund_processed: number; refund_failed: number;
  total_refunded_inr: number; pending_requests: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function RefundBadge({ status }: { status: string | null }) {
  if (!status || status === "not_applicable") return <span style={{ fontSize: 10, color: "#555" }}>—</span>;
  const colors: Record<string, [string, string]> = {
    pending:    ["#eab308", "rgba(234,179,8,0.1)"],
    processing: ["#60a5fa", "rgba(96,165,250,0.1)"],
    processed:  ["#4ade80", "rgba(74,222,128,0.1)"],
    failed:     ["#f87171", "rgba(239,68,68,0.1)"],
  };
  const [color, bg] = colors[status] ?? ["#888", "rgba(255,255,255,0.06)"];
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, color, background: bg }}>
      {status.toUpperCase()}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CancellationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);

  const [stats,     setStats]     = useState<Stats | null>(null);
  const [cancelled, setCancelled] = useState<CancelledReg[]>([]);
  const [requests,  setRequests]  = useState<CancelRequest[]>([]);
  const [audit,     setAudit]     = useState<AuditEntry[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [tab,       setTab]       = useState<"cancelled" | "requests" | "audit">("cancelled");
  const [eventTitle, setEventTitle] = useState("");

  // Refund modal
  const [refundTarget,  setRefundTarget]  = useState<CancelledReg | null>(null);
  const [refundAmount,  setRefundAmount]  = useState("");
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundResult,  setRefundResult]  = useState<{ success?: boolean; message?: string; error?: string } | null>(null);

  // Review modal
  const [reviewTarget,  setReviewTarget]  = useState<CancelRequest | null>(null);
  const [reviewNote,    setReviewNote]    = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);

  const headers = { "Content-Type": "application/json" };

  async function load() {
    setLoading(true); setError("");
    try {
      const [dataRes, evRes] = await Promise.all([
        fetch(`/api/admin/events/${eventId}/cancellations`),
        fetch(`/api/admin/events/${eventId}/overview`),
      ]);
      const data = await dataRes.json();
      if (!dataRes.ok) { setError(data.error ?? "Failed to load"); return; }
      setStats(data.stats);
      setCancelled(data.cancelled ?? []);
      setRequests(data.requests ?? []);
      setAudit(data.audit ?? []);
      if (evRes.ok) {
        const evData = await evRes.json();
        setEventTitle(evData.event?.title ?? "");
      }
    } catch { setError("Network error."); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [eventId]); // eslint-disable-line

  async function processRefund() {
    if (!refundTarget) return;
    setRefundLoading(true); setRefundResult(null);
    const amountPaise = refundAmount ? Math.round(parseFloat(refundAmount) * 100) : undefined;
    try {
      const res = await fetch(`/api/admin/events/${eventId}/registrations/${refundTarget.registration_code}/refund`, {
        method: "POST", headers,
        body: JSON.stringify({ amount: amountPaise, mode: refundAmount ? "partial" : "full" }),
      });
      const data = await res.json();
      setRefundResult(data);
      if (res.ok && data.success) {
        setCancelled(prev => prev.map(r =>
          r.id === refundTarget.id
            ? { ...r, refund_status: data.refund_status, refund_id: data.refund_id }
            : r
        ));
        setStats(s => s ? { ...s,
          refund_pending:   Math.max(0, s.refund_pending - 1),
          refund_processed: s.refund_processed + 1,
          total_refunded_inr: s.total_refunded_inr + (data.amount_inr ?? 0),
        } : s);
      }
    } catch { setRefundResult({ error: "Network error" }); }
    finally { setRefundLoading(false); }
  }

  async function reviewRequest(action: "approve" | "reject") {
    if (!reviewTarget) return;
    setReviewLoading(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/cancellations`, {
        method: "PATCH", headers,
        body: JSON.stringify({ request_id: reviewTarget.id, action, note: reviewNote }),
      });
      if (res.ok) {
        setRequests(prev => prev.map(r =>
          r.id === reviewTarget.id
            ? { ...r, status: action === "approve" ? "approved" : "rejected", reviewed_at: new Date().toISOString(), reviewed_by: "admin" }
            : r
        ));
        if (action === "approve") {
          setStats(s => s ? { ...s, pending_requests: Math.max(0, s.pending_requests - 1) } : s);
        }
        setReviewTarget(null);
      }
    } catch { /* silent */ }
    finally { setReviewLoading(false); }
  }

  const S = {
    th: { padding: "10px 12px", textAlign: "left" as const, fontSize: 10, color: "#555",
      textTransform: "uppercase" as const, letterSpacing: ".07em", fontWeight: 700, whiteSpace: "nowrap" as const },
    td: { padding: "10px 12px", fontSize: 12, color: "#aaa", verticalAlign: "top" as const },
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff" }}>
      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(10,10,10,0.97)",
        borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 1.5rem",
        height: 60, display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <Link href={`/admin/events/${eventId}/manage`}
          style={{ color: "#555", fontSize: 13, textDecoration: "none", whiteSpace: "nowrap" }}>
          ← Event Hub
        </Link>
        <span style={{ color: "#333" }}>/</span>
        <span style={{ color: "#888", fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
          Cancellations &amp; Refunds{eventTitle ? ` — ${eventTitle}` : ""}
        </span>
        <div style={{ marginLeft: "auto" }}>
          <Button size="sm" variant="ghost" onClick={load}>Refresh</Button>
        </div>
      </header>

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem 1.5rem" }}>
        {error && <Alert variant="error" style={{ marginBottom: "1.5rem" }}>{error}</Alert>}

        {/* Stats */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px,1fr))", gap: "0.875rem", marginBottom: "1.5rem" }}>
            {[
              { label: "Total Cancelled",   value: stats.total_cancelled,                                    color: "#f87171" },
              { label: "Paid Cancelled",    value: stats.paid_cancelled,                                     color: "#e8620a" },
              { label: "Refund Pending",    value: stats.refund_pending,                                     color: "#eab308" },
              { label: "Refund Processed",  value: stats.refund_processed,                                   color: "#4ade80" },
              { label: "Refund Failed",     value: stats.refund_failed,                                      color: "#f87171" },
              { label: "Total Refunded",    value: `₹${stats.total_refunded_inr.toLocaleString("en-IN")}`,  color: "#60a5fa" },
              { label: "Pending Requests",  value: stats.pending_requests,                                   color: stats.pending_requests > 0 ? "#eab308" : "#555" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: 3, width: "fit-content", marginBottom: "1.5rem" }}>
          {([
            { key: "cancelled",  label: `Cancellations (${cancelled.length})` },
            { key: "requests",   label: `User Requests (${requests.filter(r => r.status === "pending").length} pending)` },
            { key: "audit",      label: "Audit Log" },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                background: tab === t.key ? "#e8620a" : "transparent",
                color: tab === t.key ? "#fff" : "#888", fontFamily: "inherit" }}>
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "#555" }}>Loading…</div>
        ) : (
          <>
            {/* ── CANCELLATIONS TAB ── */}
            {tab === "cancelled" && (
              <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                        {["Code","Participant","Payment","Amount","Cancelled","Reason","Refund Status","Actions"].map(h => (
                          <th key={h} style={S.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cancelled.length === 0 ? (
                        <tr><td colSpan={8} style={{ ...S.td, textAlign: "center", padding: "2rem", color: "#555" }}>No cancellations yet</td></tr>
                      ) : cancelled.map(r => (
                        <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                          <td style={S.td}><span style={{ fontFamily: "monospace", color: "#e8620a" }}>{r.registration_code}</span></td>
                          <td style={S.td}>
                            <div style={{ fontWeight: 600, color: "#fff" }}>{r.user_name}</div>
                            <div style={{ color: "#666", fontSize: 11 }}>{r.user_email}</div>
                          </td>
                          <td style={S.td}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
                              color: r.payment_status === "paid" ? "#4ade80" : "#888",
                              background: r.payment_status === "paid" ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.06)" }}>
                              {r.payment_status.toUpperCase()}
                            </span>
                          </td>
                          <td style={S.td}>
                            {r.final_price > 0 ? <span style={{ color: "#fff" }}>₹{r.final_price.toLocaleString("en-IN")}</span> : "—"}
                          </td>
                          <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                            <div>{fmtDate(r.cancelled_at)}</div>
                            {r.cancelled_by && <div style={{ fontSize: 10, color: "#555" }}>by {r.cancelled_by}</div>}
                          </td>
                          <td style={{ ...S.td, maxWidth: 160 }}>
                            <span style={{ fontSize: 11, color: "#777" }}>{r.cancellation_reason || "—"}</span>
                          </td>
                          <td style={S.td}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                              <RefundBadge status={r.refund_status} />
                              {r.refund_id && <span style={{ fontSize: 10, color: "#555", fontFamily: "monospace" }}>{r.refund_id}</span>}
                              {r.refunded_at && <span style={{ fontSize: 10, color: "#4ade80" }}>{fmtDate(r.refunded_at)}</span>}
                              {r.refund_failure_reason && <span style={{ fontSize: 10, color: "#f87171" }}>{r.refund_failure_reason}</span>}
                            </div>
                          </td>
                          <td style={S.td}>
                            {(r.refund_status === "pending" || r.refund_status === "failed") && r.razorpay_payment_id && (
                              <button onClick={() => { setRefundTarget(r); setRefundAmount(""); setRefundResult(null); }}
                                style={{ padding: "4px 10px", borderRadius: 5, border: "1px solid rgba(74,222,128,0.3)", background: "rgba(74,222,128,0.07)", color: "#4ade80", cursor: "pointer", fontSize: 11, fontFamily: "inherit", whiteSpace: "nowrap" }}>
                                {r.refund_status === "failed" ? "Retry Refund" : "Process Refund"}
                              </button>
                            )}
                            <Link href={`/admin/events/${eventId}/registrations/${r.registration_code}`}
                              style={{ display: "block", marginTop: 4, fontSize: 11, color: "#e8620a", textDecoration: "none" }}>
                              View →
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── USER REQUESTS TAB ── */}
            {tab === "requests" && (
              <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                        {["Participant","Reason","Requested","Status","Actions"].map(h => (
                          <th key={h} style={S.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {requests.length === 0 ? (
                        <tr><td colSpan={5} style={{ ...S.td, textAlign: "center", padding: "2rem", color: "#555" }}>No cancellation requests</td></tr>
                      ) : requests.map(r => (
                        <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)", opacity: r.status !== "pending" ? 0.6 : 1 }}>
                          <td style={S.td}>
                            <div style={{ fontWeight: 600, color: "#fff" }}>{r.user_name}</div>
                            <div style={{ fontSize: 11, color: "#666" }}>{r.user_email}</div>
                          </td>
                          <td style={{ ...S.td, maxWidth: 200 }}>
                            <span style={{ fontSize: 11, color: "#aaa" }}>{r.reason}</span>
                          </td>
                          <td style={{ ...S.td, whiteSpace: "nowrap" }}>{fmtDate(r.requested_at)}</td>
                          <td style={S.td}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
                              color: r.status === "pending" ? "#eab308" : r.status === "approved" ? "#4ade80" : "#f87171",
                              background: r.status === "pending" ? "rgba(234,179,8,0.1)" : r.status === "approved" ? "rgba(74,222,128,0.1)" : "rgba(239,68,68,0.1)" }}>
                              {r.status.toUpperCase()}
                            </span>
                            {r.review_note && <div style={{ fontSize: 10, color: "#555", marginTop: 3 }}>{r.review_note}</div>}
                          </td>
                          <td style={S.td}>
                            {r.status === "pending" && (
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                <button onClick={() => { setReviewTarget(r); setReviewNote(""); }}
                                  style={{ padding: "4px 10px", borderRadius: 5, border: "1px solid rgba(96,165,250,0.3)", background: "rgba(96,165,250,0.07)", color: "#60a5fa", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
                                  Review
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── AUDIT LOG TAB ── */}
            {tab === "audit" && (
              <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                        {["Time","Action","Actor","Registration","Details"].map(h => (
                          <th key={h} style={S.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {audit.length === 0 ? (
                        <tr><td colSpan={5} style={{ ...S.td, textAlign: "center", padding: "2rem", color: "#555" }}>No audit entries</td></tr>
                      ) : audit.map(a => (
                        <tr key={a.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                          <td style={{ ...S.td, whiteSpace: "nowrap" }}>{fmtDate(a.created_at)}</td>
                          <td style={S.td}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
                              color: a.action.includes("cancel") ? "#f87171" : a.action.includes("refund_processed") ? "#4ade80" : a.action.includes("failed") ? "#f87171" : "#60a5fa",
                              background: "rgba(255,255,255,0.06)" }}>
                              {a.action.replace(/_/g, " ").toUpperCase()}
                            </span>
                          </td>
                          <td style={S.td}>{a.actor} <span style={{ fontSize: 10, color: "#555" }}>({a.actor_type})</span></td>
                          <td style={S.td}><span style={{ fontFamily: "monospace", color: "#e8620a", fontSize: 11 }}>{a.registration_code}</span></td>
                          <td style={{ ...S.td, fontSize: 11, maxWidth: 200 }}>
                            {a.payload ? (
                              <span style={{ color: "#666", fontFamily: "monospace" }}>{JSON.stringify(a.payload).slice(0, 80)}</span>
                            ) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Refund Modal ──────────────────────────────────────────────────────── */}
      {refundTarget && (
        <div onClick={() => { if (!refundLoading) setRefundTarget(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 440, background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: "1.5rem" }}>
            <div style={{ fontWeight: 700, fontSize: "1rem", color: "#fff", marginBottom: "0.25rem" }}>Process Refund</div>
            <div style={{ fontSize: 12, color: "#555", marginBottom: "1.25rem" }}>
              {refundTarget.user_name} · <span style={{ fontFamily: "monospace", color: "#e8620a" }}>{refundTarget.registration_code}</span>
            </div>
            <div style={{ fontSize: 13, color: "#888", marginBottom: "1rem" }}>
              Paid amount: <strong style={{ color: "#fff" }}>₹{refundTarget.final_price.toLocaleString("en-IN")}</strong>
              {" · "}Razorpay: <span style={{ fontFamily: "monospace", fontSize: 11 }}>{refundTarget.razorpay_payment_id}</span>
            </div>
            {!refundResult?.success ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "#555", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".06em", marginBottom: 6 }}>
                    Refund Amount (₹) — blank for full refund
                  </label>
                  <input type="number" min="1" max={refundTarget.final_price} step="1"
                    value={refundAmount} onChange={e => setRefundAmount(e.target.value)}
                    placeholder={String(refundTarget.final_price)}
                    style={{ width: "100%", padding: "8px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#ccc", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" as const, outline: "none" }}
                  />
                </div>
                {refundResult?.error && (
                  <div style={{ fontSize: 12, color: "#f87171" }}>{refundResult.error}</div>
                )}
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={processRefund} disabled={refundLoading}
                    style={{ flex: 1, padding: 10, background: "#16a34a", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 13, cursor: refundLoading ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                    {refundLoading ? "Processing…" : `Refund ₹${refundAmount ? parseFloat(refundAmount).toLocaleString("en-IN") : refundTarget.final_price.toLocaleString("en-IN")}`}
                  </button>
                  <button onClick={() => setRefundTarget(null)} disabled={refundLoading}
                    style={{ padding: "10px 16px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#aaa", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ padding: "12px 14px", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 8, fontSize: 13, color: "#4ade80" }}>
                  ✓ {refundResult.message}
                </div>
                <button onClick={() => setRefundTarget(null)}
                  style={{ padding: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#ccc", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Review Request Modal ──────────────────────────────────────────────── */}
      {reviewTarget && (
        <div onClick={() => { if (!reviewLoading) setReviewTarget(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 440, background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: "1.5rem" }}>
            <div style={{ fontWeight: 700, fontSize: "1rem", color: "#fff", marginBottom: "0.25rem" }}>Review Cancellation Request</div>
            <div style={{ fontSize: 12, color: "#555", marginBottom: "1rem" }}>
              {reviewTarget.user_name} · {reviewTarget.user_email}
            </div>
            <div style={{ padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, fontSize: 12, color: "#aaa", marginBottom: "1rem", lineHeight: 1.6 }}>
              <strong style={{ color: "#888" }}>User reason:</strong> {reviewTarget.reason}
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: 11, color: "#555", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".06em", marginBottom: 6 }}>
                Admin Note (optional)
              </label>
              <textarea value={reviewNote} onChange={e => setReviewNote(e.target.value)}
                placeholder="Internal note about this decision…"
                style={{ width: "100%", minHeight: 64, padding: "8px 10px", resize: "vertical",
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 7, color: "#ccc", fontSize: 12, fontFamily: "inherit",
                  boxSizing: "border-box" as const, outline: "none" }} />
            </div>
            <div style={{ padding: "10px 12px", background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.15)", borderRadius: 8, fontSize: 11, color: "#60a5fa", marginBottom: "1rem" }}>
              Approving marks this request as approved but does NOT auto-cancel the registration.
              Go to Registrations to cancel it and process the refund.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => reviewRequest("approve")} disabled={reviewLoading}
                style={{ flex: 1, padding: 10, background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 8, color: "#4ade80", fontWeight: 700, fontSize: 13, cursor: reviewLoading ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                {reviewLoading ? "…" : "Approve"}
              </button>
              <button onClick={() => reviewRequest("reject")} disabled={reviewLoading}
                style={{ flex: 1, padding: 10, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, color: "#f87171", fontWeight: 700, fontSize: 13, cursor: reviewLoading ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                {reviewLoading ? "…" : "Reject"}
              </button>
              <button onClick={() => setReviewTarget(null)} disabled={reviewLoading}
                style={{ padding: "10px 16px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#aaa", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                Back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
