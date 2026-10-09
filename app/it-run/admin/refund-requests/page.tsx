"use client";

import { useState, useEffect } from "react";

// Refund Requests queue (event_admin / super_admin).
// Participants submit requests; admins approve or reject them with an explanation, and an
// approved request can be executed only after an explicit confirmation.

type RequestStatus = "requested" | "approved" | "rejected" | "executed" | "cancelled" | "all";

interface RefundRow {
  id: string;
  status: string;
  amount_paise: number;
  razorpay_refund_id: string | null;
  processed_at: string | null;
  failure_reason: string | null;
}

interface RequestItem {
  id: string;
  status: Exclude<RequestStatus, "all">;
  request_reason: string;
  requested_by_email: string;
  decision_explanation: string | null;
  decided_by_email: string | null;
  decided_at: string | null;
  created_at: string;
  it_run_registrations: {
    id: string;
    registration_code: string;
    lead_email: string;
    final_price: number;
    payment_status: string;
    registration_status: string;
    razorpay_payment_id: string | null;
    it_run_participants: Array<{
      first_name: string; last_name: string; company_name: string | null; verification_status: string;
    }>;
  };
  // Many-to-one embed (request.refund_id -> refunds): an object, or null until a refund is attempted
  it_run_refunds: RefundRow | null;
}

const ACCENT = "#e8620a";
const TABS: Array<{ value: RequestStatus; label: string }> = [
  { value: "requested", label: "Awaiting review" },
  { value: "approved",  label: "Approved" },
  { value: "executed",  label: "Refunded" },
  { value: "rejected",  label: "Rejected" },
  { value: "all",       label: "All" },
];

const inr = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14, padding: 16, marginBottom: 12,
};
const INPUT: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "8px 12px",
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", resize: "vertical",
};
const BTN = (color: string, disabled = false): React.CSSProperties => ({
  padding: "8px 14px", background: `${color}15`, border: `1px solid ${color}40`,
  borderRadius: 8, color, fontSize: 12, fontWeight: 700, fontFamily: "inherit",
  cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
});

export default function RefundRequestsPage() {
  // Read the query string on the client (avoids a Suspense requirement for useSearchParams)
  const [focusCode, setFocusCode] = useState("");
  useEffect(() => {
    // One-time read of a client-only value (the URL is not available during server render)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFocusCode(new URLSearchParams(window.location.search).get("registration") ?? "");
  }, []);

  const [tab, setTab]         = useState<RequestStatus>("requested");
  const [items, setItems]     = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice]   = useState<{ ok: boolean; text: string } | null>(null);
  const [explain, setExplain] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [busy, setBusy]       = useState<string | null>(null);

  // Reloads when the tab changes or after an action (reloadKey)
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch(`/api/it-run/admin/refund-requests?status=${tab}`);
        const d = await res.json() as { requests?: RequestItem[]; error?: string };
        if (!active) return;
        if (!res.ok) {
          setNotice({ ok: false, text: d.error ?? "Failed to load requests" });
          setItems([]);
        } else {
          setItems(d.requests ?? []);
        }
      } catch {
        if (active) setNotice({ ok: false, text: "Network error while loading requests" });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [tab, reloadKey]);

  async function decide(item: RequestItem, decision: "approve" | "reject") {
    const explanation = (explain[item.id] ?? "").trim();
    if (explanation.length < 10) {
      setNotice({ ok: false, text: "Enter an explanation of at least 10 characters before deciding." });
      return;
    }
    setBusy(item.id);
    setNotice(null);
    try {
      const res = await fetch("/api/it-run/admin/refund-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: item.id, decision, explanation }),
      });
      const d = await res.json() as { error?: string };
      if (!res.ok) {
        setNotice({ ok: false, text: d.error ?? "Decision failed" });
      } else {
        setNotice({ ok: true, text: `Request ${decision === "approve" ? "approved" : "rejected"} for ${item.it_run_registrations.registration_code}.` });
        setExplain(prev => ({ ...prev, [item.id]: "" }));
        setReloadKey(k => k + 1);
      }
    } finally {
      setBusy(null);
    }
  }

  async function execute(item: RequestItem) {
    const reg = item.it_run_registrations;
    if (!confirmed[item.id]) {
      setNotice({ ok: false, text: "Tick the confirmation box before issuing the refund." });
      return;
    }
    setBusy(item.id);
    setNotice(null);
    try {
      const res = await fetch("/api/it-run/admin/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registration_id: reg.id, request_id: item.id, confirm: true }),
      });
      const d = await res.json() as { error?: string; status?: string; razorpay_refund_id?: string };
      if (res.ok) {
        const state = d.status === "processed" ? "refunded" : "submitted to the gateway (pending)";
        setNotice({ ok: true, text: `Refund ${state} for ${reg.registration_code}.` });
      } else {
        setNotice({ ok: false, text: d.error ?? "Refund failed" });
      }
      setConfirmed(prev => ({ ...prev, [item.id]: false }));
      setReloadKey(k => k + 1);
    } finally {
      setBusy(null);
    }
  }

  const visible = focusCode
    ? items.filter(i => i.it_run_registrations.registration_code === focusCode)
    : items;

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ fontSize: "clamp(18px,3vw,24px)", fontWeight: 800, color: "#fff", margin: "0 0 4px" }}>
        Refund Requests
      </h1>
      <p style={{ fontSize: 13, color: "#888", margin: "0 0 16px", lineHeight: 1.6 }}>
        Participants can only request refunds. Approving a request does not move money; a refund is issued only when you execute an approved request and confirm it.
      </p>

      {focusCode && (
        <div style={{ fontSize: 12, color: "#aaa", marginBottom: 12 }}>
          Showing requests for <span style={{ color: ACCENT, fontFamily: "monospace" }}>{focusCode}</span>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {TABS.map(t => (
          <button
            key={t.value}
            onClick={() => { setLoading(true); setTab(t.value); }}
            style={{
              padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
              background: tab === t.value ? `${ACCENT}20` : "rgba(255,255,255,0.04)",
              border: `1px solid ${tab === t.value ? `${ACCENT}60` : "rgba(255,255,255,0.1)"}`,
              color: tab === t.value ? ACCENT : "#aaa",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {notice && (
        <div role="status" style={{
          padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 14,
          background: notice.ok ? "rgba(16,185,129,0.1)" : "rgba(248,113,113,0.1)",
          border: `1px solid ${notice.ok ? "rgba(16,185,129,0.3)" : "rgba(248,113,113,0.3)"}`,
          color: notice.ok ? "#10b981" : "#f87171",
        }}>
          {notice.text}
        </div>
      )}

      {loading && <div style={{ color: "#666", fontSize: 13 }}>Loading…</div>}
      {!loading && visible.length === 0 && (
        <div style={{ color: "#666", fontSize: 13 }}>No refund requests in this view.</div>
      )}

      {visible.map(item => {
        const reg = item.it_run_registrations;
        const participant = reg.it_run_participants?.[0];
        const refund = item.it_run_refunds;
        const busyHere = busy === item.id;
        return (
          <div key={item.id} style={CARD}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>
                  {participant ? `${participant.first_name} ${participant.last_name}` : "Participant"}
                </div>
                <div style={{ fontSize: 12, color: "#888", fontFamily: "monospace" }}>{reg.registration_code}</div>
              </div>
              <div style={{ fontSize: 12, color: "#aaa", textAlign: "right" }}>
                <div>Request status: <strong style={{ color: "#fff" }}>{item.status}</strong></div>
                <div>Submitted {new Date(item.created_at).toLocaleString("en-IN")}</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "6px 16px", marginBottom: 10, fontSize: 12 }}>
              <div><span style={{ color: "#666" }}>Amount paid</span><br />{inr(reg.final_price)}</div>
              <div><span style={{ color: "#666" }}>Payment</span><br />{reg.payment_status}</div>
              <div><span style={{ color: "#666" }}>Registration</span><br />{reg.registration_status}</div>
              <div><span style={{ color: "#666" }}>Company ID</span><br />{participant?.verification_status ?? "-"}</div>
              <div><span style={{ color: "#666" }}>Company</span><br />{participant?.company_name ?? "-"}</div>
              <div><span style={{ color: "#666" }}>Requested by</span><br />{item.requested_by_email}</div>
            </div>

            <div style={{ background: "#161616", borderRadius: 8, padding: 10, fontSize: 13, color: "#ccc", lineHeight: 1.6, marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", marginBottom: 4 }}>Participant&apos;s reason</div>
              {item.request_reason}
            </div>

            {item.decision_explanation && (
              <div style={{ background: "#161616", borderRadius: 8, padding: 10, fontSize: 13, color: "#ccc", lineHeight: 1.6, marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", marginBottom: 4 }}>
                  Decision by {item.decided_by_email ?? "admin"}{item.decided_at ? ` on ${new Date(item.decided_at).toLocaleString("en-IN")}` : ""}
                </div>
                {item.decision_explanation}
              </div>
            )}

            {refund && (
              <div style={{ fontSize: 12, color: "#aaa", marginBottom: 10 }}>
                Refund {refund.status} · {inr(refund.amount_paise)}
                {refund.razorpay_refund_id && <> · Ref <span style={{ fontFamily: "monospace" }}>{refund.razorpay_refund_id}</span></>}
                {refund.failure_reason && <> · {refund.failure_reason}</>}
              </div>
            )}

            {item.status === "requested" && (
              <>
                <textarea
                  rows={2}
                  maxLength={1000}
                  placeholder="Explanation for the decision (required, shown to the participant)"
                  value={explain[item.id] ?? ""}
                  onChange={e => setExplain(prev => ({ ...prev, [item.id]: e.target.value }))}
                  style={INPUT}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <button onClick={() => decide(item, "approve")} disabled={busyHere} style={BTN("#10b981", busyHere)}>Approve</button>
                  <button onClick={() => decide(item, "reject")} disabled={busyHere} style={BTN("#ef4444", busyHere)}>Reject</button>
                </div>
              </>
            )}

            {item.status === "approved" && (
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10 }}>
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: "#ccc", lineHeight: 1.5, marginBottom: 10 }}>
                  <input
                    type="checkbox"
                    checked={!!confirmed[item.id]}
                    onChange={e => setConfirmed(prev => ({ ...prev, [item.id]: e.target.checked }))}
                    style={{ marginTop: 3 }}
                  />
                  I confirm this will issue a full refund of {inr(reg.final_price)} through Razorpay to the original payment method, and cancel the registration once the refund is processed.
                </label>
                <button onClick={() => execute(item)} disabled={busyHere || !confirmed[item.id]} style={BTN("#fb923c", busyHere || !confirmed[item.id])}>
                  {busyHere ? "Processing…" : "Issue refund"}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
