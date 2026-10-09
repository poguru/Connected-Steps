"use client";

import { useState, useEffect } from "react";

// Refund management for The IT Run Sprint-2 (event_admin / super_admin).
// Participants only request refunds. Approving a request moves no money. A refund is issued only
// by executing an approved request with explicit confirmation. Razorpay is the source of truth for
// refund outcomes; uncertain attempts are reconciled against Razorpay, never auto-failed.

type RequestStatus = "requested" | "approved" | "rejected" | "executed" | "cancelled";
type RefundStatus = "pending" | "processed" | "failed";

interface RefundRow {
  id: string;
  status: RefundStatus;
  amount_paise: number;
  razorpay_refund_id: string | null;
  processed_at: string | null;
  failure_reason: string | null;
  created_at?: string;
  reason?: string | null;
  initiated_by_email?: string | null;
}

interface Participant {
  id: string;
  participant_type: string;
  first_name: string;
  last_name: string;
  mobile: string;
  email: string | null;
  company_name: string | null;
  verification_status: string;
  bib_number?: string | null;
}

interface Refundable {
  refundedPaise: number;
  inFlightPaise: number;
  finalPricePaise: number;
  remainingPaise: number;
}

interface RequestRow {
  id: string;
  status: RequestStatus;
  request_reason: string;
  requested_by_email: string;
  decision_explanation: string | null;
  decided_by_email: string | null;
  decided_at: string | null;
  created_at: string;
  refund_id: string | null;
  registration_id: string;
  request_refund: RefundRow | null;
  refundable: Refundable;
  it_run_registrations: {
    id: string;
    registration_code: string;
    lead_email: string;
    final_price: number;
    payment_status: string;
    registration_status: string;
    razorpay_order_id: string | null;
    razorpay_payment_id: string | null;
    category_id: string;
    it_run_categories: { id: string; name: string } | null;
    it_run_participants: Participant[];
    it_run_refunds: RefundRow[];
  };
}

interface DetailResponse {
  request: RequestRow & {
    it_run_registrations: RequestRow["it_run_registrations"] & {
      base_price: number;
      discount_amount: number;
      participant_count: number;
      cancelled_reason: string | null;
      cancelled_at: string | null;
    };
  };
  audit: {
    requestDecisions: Array<{ action: string; actor_email: string; created_at: string; detail: unknown }>;
    refundActions: Array<{ action: string; refund_id: string; timestamp: string; details: unknown }>;
  };
}

interface Summary {
  total: number; pendingReview: number; approved: number; processing: number;
  refunded: number; failed: number; rejected: number;
}

type Outcome = { kind: string; reason?: string; refundId?: string };

const ACCENT = "#e8620a";
const PAGE_SIZE = 25;
const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All requests" },
  { value: "requested", label: "Awaiting review" },
  { value: "approved", label: "Approved" },
  { value: "executed", label: "Refund executed" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];
const REFUND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Any refund status" },
  { value: "pending", label: "Processing / uncertain" },
  { value: "processed", label: "Refunded" },
  { value: "failed", label: "Failed" },
];

const inr = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN") : "-");

const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14, padding: 16, marginBottom: 12,
};
const INPUT: React.CSSProperties = {
  boxSizing: "border-box", padding: "9px 12px", background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff",
  fontSize: 13, fontFamily: "inherit", minWidth: 0,
};
const BTN = (color: string, disabled = false): React.CSSProperties => ({
  padding: "8px 14px", background: `${color}15`, border: `1px solid ${color}40`,
  borderRadius: 8, color, fontSize: 12, fontWeight: 700, fontFamily: "inherit",
  cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
});

const STATUS_COLOR: Record<string, string> = {
  requested: "#f59e0b", approved: "#60a5fa", rejected: "#f87171", executed: "#10b981",
  cancelled: "#888", pending: "#60a5fa", processed: "#10b981", failed: "#f87171",
};
function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color, background: `${color}18`, border: `1px solid ${color}40`, borderRadius: 999, padding: "2px 9px", whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function refundLabel(r: RefundRow | null | undefined): { label: string; color: string } | null {
  if (!r) return null;
  if (r.status === "processed") return { label: "Refunded", color: STATUS_COLOR.processed };
  if (r.status === "pending") return { label: "Processing / uncertain", color: STATUS_COLOR.pending };
  return { label: "Refund failed", color: STATUS_COLOR.failed };
}

export default function RefundRequestsPage() {
  // Filters
  const [status, setStatus]     = useState("requested");
  const [refundFilter, setRefundFilter] = useState("");
  const [category, setCategory] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ]               = useState("");
  const [page, setPage]         = useState(0);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);

  // Data
  const [summary, setSummary]   = useState<Summary | null>(null);
  const [items, setItems]       = useState<RequestRow[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState("");

  // Detail / actions
  const [openId, setOpenId]     = useState<string | null>(null);
  const [details, setDetails]   = useState<Record<string, DetailResponse>>({});
  const [explain, setExplain]   = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [busy, setBusy]         = useState<string | null>(null);
  const [notice, setNotice]     = useState<{ ok: boolean; text: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);

  // Categories for the filter (public endpoint; active categories)
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch("/api/it-run/categories");
        const d = await res.json() as { data?: Array<{ id: string; name: string }> };
        if (active && Array.isArray(d.data)) setCategories(d.data.map(c => ({ id: c.id, name: c.name })));
      } catch { /* filter stays "All categories" */ }
    })();
    return () => { active = false; };
  }, []);

  // Summary (live counts)
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch("/api/it-run/admin/refund-requests/summary");
        if (!res.ok) return;
        const d = await res.json() as Summary;
        if (active) setSummary(d);
      } catch { /* leave tiles empty */ }
    })();
    return () => { active = false; };
  }, [reloadKey]);

  // List (filters, search, pagination)
  useEffect(() => {
    let active = true;
    void (async () => {
      const params = new URLSearchParams({ status, page: String(page), limit: String(PAGE_SIZE) });
      if (refundFilter) params.set("refund", refundFilter);
      if (category) params.set("category", category);
      if (q) params.set("q", q);
      try {
        const res = await fetch(`/api/it-run/admin/refund-requests?${params.toString()}`);
        const d = await res.json() as { requests?: RequestRow[]; total?: number; error?: string };
        if (!active) return;
        if (!res.ok) {
          setLoadError(d.error ?? "Failed to load refund requests");
          setItems([]);
          setTotal(0);
        } else {
          setLoadError("");
          setItems(d.requests ?? []);
          setTotal(d.total ?? 0);
        }
      } catch {
        if (active) setLoadError("Network error while loading refund requests");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [status, refundFilter, category, q, page, reloadKey]);

  function applyFilters(next: { status?: string; refund?: string; category?: string; q?: string }) {
    setLoading(true);
    if (next.status !== undefined) setStatus(next.status);
    if (next.refund !== undefined) setRefundFilter(next.refund);
    if (next.category !== undefined) setCategory(next.category);
    if (next.q !== undefined) setQ(next.q);
    setPage(0);
  }

  function refreshAll() {
    setReloadKey(k => k + 1);
    setDetails({});
  }

  async function openDetail(id: string) {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (details[id]) return;
    try {
      const res = await fetch(`/api/it-run/admin/refund-requests/${id}`);
      const d = await res.json() as DetailResponse & { error?: string };
      if (!res.ok) { setNotice({ ok: false, text: d.error ?? "Could not load details" }); return; }
      setDetails(prev => ({ ...prev, [id]: d }));
    } catch {
      setNotice({ ok: false, text: "Network error while loading details" });
    }
  }

  async function decide(item: RequestRow, decision: "approve" | "reject") {
    const text = (explain[item.id] ?? "").trim();
    if (text.length < 10) {
      setNotice({ ok: false, text: `Enter an explanation of at least 10 characters before you ${decision === "approve" ? "approve" : "reject"}.` });
      return;
    }
    setBusy(item.id); setNotice(null);
    try {
      const res = await fetch("/api/it-run/admin/refund-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: item.id, decision, explanation: text }),
      });
      const d = await res.json() as { error?: string };
      if (!res.ok) { setNotice({ ok: false, text: d.error ?? "Decision failed" }); return; }
      setNotice({ ok: true, text: `Request ${decision === "approve" ? "approved" : "rejected"} for ${item.it_run_registrations.registration_code}.` });
      setExplain(prev => ({ ...prev, [item.id]: "" }));
      refreshAll();
    } finally {
      setBusy(null);
    }
  }

  async function execute(item: RequestRow) {
    const reg = item.it_run_registrations;
    const remaining = details[item.id]?.request.refundable.remainingPaise ?? item.refundable.remainingPaise;
    if (!confirmed[item.id]) {
      setNotice({ ok: false, text: "Tick the confirmation box before issuing the refund." });
      return;
    }
    setBusy(item.id); setNotice(null);
    try {
      const res = await fetch("/api/it-run/admin/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registration_id: reg.id, request_id: item.id, confirm: true }),
      });
      const d = await res.json() as { error?: string; status?: string };
      if (res.ok) {
        setNotice({ ok: true, text: d.status === "processed"
          ? `Refund of ${inr(remaining)} completed for ${reg.registration_code}.`
          : `Refund of ${inr(remaining)} sent to Razorpay for ${reg.registration_code}. It is processing; reconcile if it stays pending.` });
      } else {
        setNotice({ ok: false, text: d.error ?? "Refund failed" });
      }
      setConfirmed(prev => ({ ...prev, [item.id]: false }));
      refreshAll();
    } finally {
      setBusy(null);
    }
  }

  async function reconcile(item: RequestRow) {
    setBusy(item.id); setNotice(null);
    try {
      const res = await fetch(`/api/it-run/admin/refund-requests/${item.id}/reconcile`, { method: "POST" });
      const d = await res.json() as { error?: string; outcomes?: Outcome[]; message?: string };
      if (!res.ok) { setNotice({ ok: false, text: d.error ?? "Reconciliation failed" }); return; }
      const outcomes = d.outcomes ?? [];
      if (outcomes.length === 0) {
        setNotice({ ok: true, text: d.message ?? "Nothing to reconcile." });
      } else {
        const texts = outcomes.map(o =>
          o.kind === "finalized_processed" ? "Razorpay confirmed the refund; it is now recorded as refunded." :
          o.kind === "marked_failed" ? "Razorpay reports the refund failed; you can retry it." :
          o.reason ?? "Still pending.");
        setNotice({ ok: true, text: texts.join(" ") });
      }
      refreshAll();
    } finally {
      setBusy(null);
    }
  }

  // CSV export of the current filter (up to 500 rows, 5 pages of 100)
  async function exportCsv() {
    setExporting(true);
    try {
      const rows: RequestRow[] = [];
      for (let p = 0; p < 5; p++) {
        const params = new URLSearchParams({ status, page: String(p), limit: "100" });
        if (refundFilter) params.set("refund", refundFilter);
        if (category) params.set("category", category);
        if (q) params.set("q", q);
        const res = await fetch(`/api/it-run/admin/refund-requests?${params.toString()}`);
        if (!res.ok) { setNotice({ ok: false, text: "Export failed" }); return; }
        const d = await res.json() as { requests: RequestRow[]; total: number };
        rows.push(...d.requests);
        if (rows.length >= d.total || d.requests.length === 0) break;
      }
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const header = ["Registration", "Category", "Participants", "Lead email", "Mobiles", "Paid (INR)", "Refundable (INR)", "Request status", "Refund status", "Requested", "Reason", "Admin decision"];
      const lines = rows.map(r => {
        const reg = r.it_run_registrations;
        const refund = refundLabel(r.request_refund);
        return [
          reg.registration_code,
          reg.it_run_categories?.name ?? "",
          reg.it_run_participants.map(p => `${p.first_name} ${p.last_name}`).join("; "),
          reg.lead_email,
          reg.it_run_participants.map(p => p.mobile).join("; "),
          reg.final_price.toFixed(2),
          (r.refundable.remainingPaise / 100).toFixed(2),
          r.status,
          refund?.label ?? "",
          when(r.created_at),
          r.request_reason,
          r.decision_explanation ?? "",
        ].map(esc).join(",");
      });
      const blob = new Blob([[header.map(esc).join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `it-run-refund-requests-${status}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const tiles: Array<{ label: string; value: number | undefined; color: string }> = [
    { label: "Total requests", value: summary?.total, color: "#fff" },
    { label: "Pending review", value: summary?.pendingReview, color: STATUS_COLOR.requested },
    { label: "Approved", value: summary?.approved, color: STATUS_COLOR.approved },
    { label: "Processing", value: summary?.processing, color: STATUS_COLOR.pending },
    { label: "Refunded", value: summary?.refunded, color: STATUS_COLOR.processed },
    { label: "Failed refunds", value: summary?.failed, color: STATUS_COLOR.failed },
    { label: "Rejected", value: summary?.rejected, color: STATUS_COLOR.rejected ?? "#f87171" },
  ];

  return (
    <div style={{ maxWidth: 980 }}>
      <h1 style={{ fontSize: "clamp(18px,3vw,24px)", fontWeight: 800, color: "#fff", margin: "0 0 4px" }}>Refund Requests</h1>
      <p style={{ fontSize: 13, color: "#888", margin: "0 0 16px", lineHeight: 1.6 }}>
        Approving a request moves no money. A refund is issued only when you execute an approved request and confirm it. Razorpay confirms each outcome.
      </p>

      {/* Summary (live counts) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 18 }}>
        {tiles.map(t => (
          <div key={t.label} style={{ ...CARD, marginBottom: 0, padding: 12 }}>
            <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em" }}>{t.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: t.color }}>{t.value ?? "–"}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <select value={status} onChange={e => applyFilters({ status: e.target.value })} style={INPUT} aria-label="Request status">
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={refundFilter} onChange={e => applyFilters({ refund: e.target.value })} style={INPUT} aria-label="Refund status">
          {REFUND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={category} onChange={e => applyFilters({ category: e.target.value })} style={INPUT} aria-label="Category">
          <option value="">All categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <form onSubmit={e => { e.preventDefault(); applyFilters({ q: searchInput.trim() }); }} style={{ display: "flex", gap: 6, flex: "1 1 220px" }}>
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search name, mobile, email, code"
            aria-label="Search"
            style={{ ...INPUT, flex: 1 }}
          />
          <button type="submit" style={BTN(ACCENT)}>Search</button>
        </form>
        <button onClick={() => void exportCsv()} disabled={exporting} style={BTN("#60a5fa", exporting)}>
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {notice && (
        <div role="status" style={{
          padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 14,
          background: notice.ok ? "rgba(16,185,129,0.1)" : "rgba(248,113,113,0.1)",
          border: `1px solid ${notice.ok ? "rgba(16,185,129,0.3)" : "rgba(248,113,113,0.3)"}`,
          color: notice.ok ? "#10b981" : "#f87171",
        }}>{notice.text}</div>
      )}

      {loadError && <div role="alert" style={{ color: "#f87171", fontSize: 13, marginBottom: 12 }}>{loadError}</div>}
      {loading && <div style={{ color: "#666", fontSize: 13 }}>Loading…</div>}
      {!loading && !loadError && items.length === 0 && (
        <div style={{ color: "#666", fontSize: 13 }}>No refund requests match these filters.</div>
      )}

      {items.map(item => {
        const reg = item.it_run_registrations;
        const refund = refundLabel(item.request_refund);
        const detail = details[item.id];
        const busyHere = busy === item.id;
        const refundsForReg = reg.it_run_refunds ?? [];
        const hasPending = refundsForReg.some(r => r.status === "pending");
        const latestFailed = item.request_refund?.status === "failed";
        const remaining = item.refundable.remainingPaise;
        return (
          <div key={item.id} style={CARD}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>
                  {reg.it_run_participants.map(p => `${p.first_name} ${p.last_name}`).join(", ") || "Booking"}
                </div>
                <div style={{ fontSize: 12, color: "#888", fontFamily: "monospace" }}>{reg.registration_code} · {reg.it_run_categories?.name ?? "-"}</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-start" }}>
                <Pill label={item.status} color={STATUS_COLOR[item.status]} />
                {refund && <Pill label={refund.label} color={refund.color} />}
              </div>
            </div>

            {/* Amounts and contact */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "6px 16px", fontSize: 12, marginBottom: 10 }}>
              <div><span style={{ color: "#666" }}>Paid (booking)</span><br />{inr(reg.final_price * 100)}</div>
              <div><span style={{ color: "#666" }}>Refundable now</span><br /><strong style={{ color: remaining > 0 ? "#fff" : "#888" }}>{inr(remaining)}</strong></div>
              <div><span style={{ color: "#666" }}>Email</span><br />{reg.lead_email}</div>
              <div><span style={{ color: "#666" }}>Mobile</span><br />{reg.it_run_participants.map(p => p.mobile).join(", ") || "-"}</div>
              <div><span style={{ color: "#666" }}>Requested</span><br />{when(item.created_at)}</div>
              <div><span style={{ color: "#666" }}>Registration</span><br />{reg.registration_status}</div>
            </div>

            <div style={{ background: "#161616", borderRadius: 8, padding: 10, fontSize: 13, color: "#ccc", lineHeight: 1.6, marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", marginBottom: 4 }}>Participant&apos;s reason</div>
              {item.request_reason}
            </div>

            {item.decision_explanation && (
              <div style={{ background: "#161616", borderRadius: 8, padding: 10, fontSize: 13, color: "#ccc", lineHeight: 1.6, marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", marginBottom: 4 }}>
                  Admin note · {item.decided_by_email ?? "admin"} · {when(item.decided_at)}
                </div>
                {item.decision_explanation}
              </div>
            )}

            <button onClick={() => void openDetail(item.id)} style={BTN("#aaa")}>
              {openId === item.id ? "Hide details" : "Details & audit"}
            </button>

            {openId === item.id && (
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 12, paddingTop: 12 }}>
                {!detail ? (
                  <div style={{ fontSize: 13, color: "#666" }}>Loading details…</div>
                ) : (
                  <>
                    {/* Booking-level payment: one payment covers the whole booking */}
                    <div style={{ background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.25)", borderRadius: 10, padding: 12, fontSize: 12, color: "#cbd5e1", lineHeight: 1.7, marginBottom: 12 }}>
                      <strong style={{ color: "#fff" }}>Booking payment (one payment for {detail.request.it_run_registrations.participant_count} participant{detail.request.it_run_registrations.participant_count === 1 ? "" : "s"}).</strong>
                      <div>Refunds apply to the whole booking, not to individual participants. Refunding once refunds the full booking, so do not refund the same payment again from another request.</div>
                      <div style={{ marginTop: 6 }}>
                        Price {inr(detail.request.it_run_registrations.base_price * 100)} · discount {inr(detail.request.it_run_registrations.discount_amount * 100)} · paid {inr(detail.request.refundable.finalPricePaise)} · refunded {inr(detail.request.refundable.refundedPaise)} · in flight {inr(detail.request.refundable.inFlightPaise)} · remaining {inr(detail.request.refundable.remainingPaise)}
                      </div>
                      <div style={{ fontFamily: "monospace", marginTop: 4, wordBreak: "break-all" }}>
                        Payment {reg.razorpay_payment_id ?? "-"} · Order {reg.razorpay_order_id ?? "-"}
                      </div>
                    </div>

                    {/* Participants on this booking */}
                    <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", marginBottom: 6 }}>Participants</div>
                    <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
                      {reg.it_run_participants.map(p => (
                        <div key={p.id} style={{ fontSize: 12, color: "#ccc", background: "#161616", borderRadius: 8, padding: 8 }}>
                          <strong style={{ color: "#fff" }}>{p.first_name} {p.last_name}</strong> · {p.participant_type} · {p.mobile}{p.email ? ` · ${p.email}` : ""}{p.company_name ? ` · ${p.company_name}` : ""} · ID {p.verification_status}
                        </div>
                      ))}
                    </div>

                    {/* Refund attempts */}
                    <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", marginBottom: 6 }}>Refund attempts</div>
                    {refundsForReg.length === 0 ? (
                      <div style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>No refund has been attempted.</div>
                    ) : (
                      <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
                        {refundsForReg.map(r => {
                          const l = refundLabel(r);
                          return (
                            <div key={r.id} style={{ fontSize: 12, color: "#ccc", background: "#161616", borderRadius: 8, padding: 8 }}>
                              <span style={{ color: l?.color }}>{l?.label}</span> · {inr(r.amount_paise)} · {when(r.created_at ?? null)}
                              {r.razorpay_refund_id && <> · Razorpay <span style={{ fontFamily: "monospace" }}>{r.razorpay_refund_id}</span></>}
                              {r.failure_reason && <> · {r.failure_reason}</>}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Audit trail */}
                    <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", marginBottom: 6 }}>Audit trail</div>
                    <div style={{ display: "grid", gap: 4, marginBottom: 12, fontSize: 12, color: "#aaa" }}>
                      {detail.audit.requestDecisions.map((a, i) => (
                        <div key={`d${i}`}>{when(a.created_at)} · {a.action} · {a.actor_email}</div>
                      ))}
                      {detail.audit.refundActions.map((a, i) => (
                        <div key={`r${i}`}>{when(a.timestamp)} · {a.action}</div>
                      ))}
                      {detail.audit.requestDecisions.length + detail.audit.refundActions.length === 0 && <div>No actions recorded yet.</div>}
                    </div>
                  </>
                )}

                {/* Actions */}
                {item.status === "requested" && (
                  <>
                    <textarea
                      rows={2}
                      maxLength={1000}
                      placeholder="Explanation for the decision (required, at least 10 characters, shown to the participant)"
                      value={explain[item.id] ?? ""}
                      onChange={e => setExplain(prev => ({ ...prev, [item.id]: e.target.value }))}
                      style={{ ...INPUT, width: "100%", resize: "vertical" }}
                    />
                    <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                      <button onClick={() => void decide(item, "approve")} disabled={busyHere} style={BTN("#10b981", busyHere)}>Approve</button>
                      <button onClick={() => void decide(item, "reject")} disabled={busyHere} style={BTN("#ef4444", busyHere)}>Reject</button>
                    </div>
                  </>
                )}

                {item.status === "approved" && (
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10 }}>
                    {hasPending && (
                      <div style={{ fontSize: 12, color: STATUS_COLOR.pending, marginBottom: 8, lineHeight: 1.5 }}>
                        A refund is still processing or its outcome is unknown. Reconcile with Razorpay before retrying. Retrying now is blocked, so no duplicate can be issued.
                      </div>
                    )}
                    {latestFailed && !hasPending && (
                      <div style={{ fontSize: 12, color: STATUS_COLOR.failed, marginBottom: 8 }}>The last refund failed. You can retry it below.</div>
                    )}
                    {remaining > 0 ? (
                      <>
                        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: "#ccc", lineHeight: 1.5, marginBottom: 10 }}>
                          <input
                            type="checkbox"
                            checked={!!confirmed[item.id]}
                            onChange={e => setConfirmed(prev => ({ ...prev, [item.id]: e.target.checked }))}
                            style={{ marginTop: 3 }}
                          />
                          I confirm a refund of {inr(remaining)} will be sent to Razorpay for the whole booking ({reg.registration_code}), and the registration will be cancelled once Razorpay confirms it.
                        </label>
                        <button
                          onClick={() => void execute(item)}
                          disabled={busyHere || !confirmed[item.id] || hasPending}
                          style={BTN("#fb923c", busyHere || !confirmed[item.id] || hasPending)}
                        >
                          {busyHere ? "Processing…" : latestFailed ? "Retry refund" : "Issue refund"}
                        </button>
                      </>
                    ) : (
                      <div style={{ fontSize: 12, color: "#888" }}>Nothing left to refund on this booking.</div>
                    )}
                    {hasPending && (
                      <button onClick={() => void reconcile(item)} disabled={busyHere} style={{ ...BTN("#60a5fa", busyHere), marginLeft: 8 }}>
                        Reconcile with Razorpay
                      </button>
                    )}
                  </div>
                )}

                {item.status !== "requested" && item.status !== "approved" && hasPending && (
                  <button onClick={() => void reconcile(item)} disabled={busyHere} style={BTN("#60a5fa", busyHere)}>
                    Reconcile with Razorpay
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center", marginTop: 16 }}>
          <button disabled={page === 0} onClick={() => { setLoading(true); setPage(p => p - 1); }} style={BTN("#aaa", page === 0)}>Prev</button>
          <span style={{ fontSize: 13, color: "#888" }}>Page {page + 1} of {pageCount} · {total} requests</span>
          <button disabled={page + 1 >= pageCount} onClick={() => { setLoading(true); setPage(p => p + 1); }} style={BTN("#aaa", page + 1 >= pageCount)}>Next</button>
        </div>
      )}
    </div>
  );
}
