"use client";

import { useState, useEffect } from "react";

// Participant-side refund requests. Requesting a refund does NOT refund or cancel anything;
// it sends the request to the admin review queue. The panel shows the admin's response and
// the refund status once an admin has acted.

export interface RefundEligibleRegistration {
  registration_code: string;
  payment_status: string;
  registration_status: string;
  final_price: number;
}

interface RequestRow {
  id: string;
  status: "requested" | "approved" | "rejected" | "executed" | "cancelled";
  registration_code: string | null;
  request_reason: string;
  admin_response: string | null;
  decided_at: string | null;
  created_at: string;
  refund: { status: string; amount_paise: number; reference: string | null; processed_at: string | null } | null;
}

const STATUS_TEXT: Record<RequestRow["status"], string> = {
  requested: "Submitted for review",
  approved: "Approved (refund being processed)",
  rejected: "Not approved",
  executed: "Refund completed",
  cancelled: "Withdrawn",
};

const STATUS_COLOR: Record<RequestRow["status"], string> = {
  requested: "#f59e0b",
  approved: "#60a5fa",
  rejected: "#f87171",
  executed: "#10b981",
  cancelled: "#888",
};

const ACCENT = "#e8620a";

export default function RefundRequestPanel({ registrations }: { registrations: RefundEligibleRegistration[] }) {
  const eligible = registrations.filter(r =>
    r.final_price > 0 &&
    ["paid", "partially_refunded"].includes(r.payment_status) &&
    r.registration_status !== "cancelled",
  );

  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [chosenCode, setCode]   = useState("");
  const [reason, setReason]     = useState("");
  const [busy, setBusy]         = useState(false);
  const [msg, setMsg]           = useState<{ ok: boolean; text: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Default to the first eligible registration without an effect
  const code = eligible.some(r => r.registration_code === chosenCode)
    ? chosenCode
    : (eligible[0]?.registration_code ?? "");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch("/api/it-run/refund-requests");
        if (res.ok && active) {
          const d = await res.json() as { requests: RequestRow[] };
          setRequests(d.requests ?? []);
        }
      } catch {
        // Keep the panel usable even if the list fails to load
      }
    })();
    return () => { active = false; };
  }, [reloadKey]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 10) {
      setMsg({ ok: false, text: "Please describe the reason in at least 10 characters." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/it-run/refund-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registration_code: code, reason: reason.trim() }),
      });
      const d = await res.json() as { error?: string; message?: string };
      if (res.ok) {
        setMsg({ ok: true, text: d.message ?? "Your refund request has been submitted for review." });
        setReason("");
        setReloadKey(k => k + 1);
      } else {
        setMsg({ ok: false, text: d.error ?? "Could not submit the request." });
      }
    } catch {
      setMsg({ ok: false, text: "Network error. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  const INPUT: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "10px 12px",
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8, color: "#fff", fontSize: 14, fontFamily: "inherit",
  };

  return (
    <section style={{ marginTop: 32 }} aria-labelledby="refund-heading">
      <h2 id="refund-heading" style={{ fontSize: 16, fontWeight: 700, color: "#fff", margin: "0 0 6px" }}>Refund requests</h2>
      <p style={{ fontSize: 12, color: "#888", margin: "0 0 14px", lineHeight: 1.6 }}>
        Submitting a request does not cancel your registration or issue a refund. Our team reviews every request and you will see the decision here.
      </p>

      {eligible.length > 0 && (
        <form onSubmit={submit} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, color: "#aaa", marginBottom: 6 }}>Registration</label>
          <select value={code} onChange={e => setCode(e.target.value)} style={{ ...INPUT, marginBottom: 12 }}>
            {eligible.map(r => (
              <option key={r.registration_code} value={r.registration_code}>{r.registration_code}</option>
            ))}
          </select>
          <label style={{ display: "block", fontSize: 12, color: "#aaa", marginBottom: 6 }}>Reason for the refund request</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Tell us why you cannot attend (at least 10 characters)"
            style={{ ...INPUT, resize: "vertical", marginBottom: 12 }}
          />
          {msg && (
            <div role="status" style={{ fontSize: 13, marginBottom: 12, color: msg.ok ? "#10b981" : "#f87171" }}>{msg.text}</div>
          )}
          <button
            type="submit"
            disabled={busy || !code}
            style={{
              width: "100%", padding: "12px", borderRadius: 8, fontWeight: 700, fontSize: 14, fontFamily: "inherit",
              background: `${ACCENT}`, color: "#fff", border: "none", cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? "Submitting…" : "Submit refund request"}
          </button>
        </form>
      )}

      {requests.length === 0 ? (
        <div style={{ fontSize: 13, color: "#666" }}>You have no refund requests.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {requests.map(r => (
            <div key={r.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ fontFamily: "monospace", fontSize: 13, color: "#ccc" }}>{r.registration_code}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_COLOR[r.status] }}>{STATUS_TEXT[r.status]}</span>
              </div>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>Submitted {new Date(r.created_at).toLocaleDateString("en-IN")}</div>
              {r.admin_response && (
                <div style={{ fontSize: 13, color: "#ccc", lineHeight: 1.6, background: "#161616", borderRadius: 8, padding: 10, marginTop: 6 }}>
                  <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", marginBottom: 4 }}>Response from our team</div>
                  {r.admin_response}
                </div>
              )}
              {r.refund && (
                <div style={{ fontSize: 12, color: "#aaa", marginTop: 8 }}>
                  Refund {r.refund.status}
                  {r.refund.reference && <> · Reference <span style={{ fontFamily: "monospace" }}>{r.refund.reference}</span></>}
                  {r.refund.processed_at && <> · {new Date(r.refund.processed_at).toLocaleDateString("en-IN")}</>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
