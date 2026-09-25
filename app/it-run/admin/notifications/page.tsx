"use client";

import { useState, useEffect, useCallback } from "react";

const ACCENT = "#e8620a";
const GREEN  = "#10b981";

type Reg = {
  id: string; registration_code: string; lead_email: string;
  payment_status: string; final_price: number;
  confirmation_email_sent_at: string | null; created_at: string;
  it_run_categories: { name: string } | null;
};

export default function NotificationsPage() {
  const [rows,    setRows]    = useState<Reg[]>([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState("all");
  const [offset,  setOffset]  = useState(0);
  const [sending, setSending] = useState<string | null>(null);
  const [msg,     setMsg]     = useState<{ text: string; ok: boolean } | null>(null);
  const LIMIT = 50;

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/it-run/admin/notifications?filter=${filter}&limit=${LIMIT}&offset=${offset}`)
      .then(r => r.json())
      .then(d => { setRows(d.registrations ?? []); setTotal(d.total ?? 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter, offset]);

  useEffect(() => { load(); }, [load]);

  async function resend(id: string, force: boolean) {
    setSending(id); setMsg(null);
    try {
      const res = await fetch("/api/it-run/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: id, force }),
      });
      const d = await res.json();
      if (!res.ok) { setMsg({ text: d.error ?? "Failed", ok: false }); return; }
      setMsg({ text: "Email sent successfully", ok: true });
      load();
    } finally { setSending(null); }
  }

  const sent   = rows.filter(r => r.confirmation_email_sent_at).length;
  const unsent = rows.filter(r => !r.confirmation_email_sent_at).length;

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "clamp(20px,3vw,26px)", fontWeight: 800, color: "#fff", margin: 0 }}>Email / Notifications</h1>
        <p style={{ color: "#666", fontSize: 13, margin: "6px 0 0" }}>
          Confirmation emails for paid and free registrations. Resend if a participant did not receive theirs.
        </p>
      </div>

      {/* Quick stats */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <Pill label="Shown total" value={total} />
        <Pill label="Email sent"  value={sent}   color={GREEN} />
        <Pill label="Not sent"    value={unsent} color="#f59e0b" />
      </div>

      {msg && (
        <div style={{ marginBottom: 14, padding: "12px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: msg.ok ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
          border: `1px solid ${msg.ok ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: msg.ok ? GREEN : "#f87171" }}>
          {msg.text}
        </div>
      )}

      {/* Filter */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {[["all","All"],["sent","Email Sent"],["unsent","Not Sent"]].map(([v, lbl]) => (
          <button key={v} onClick={() => { setFilter(v); setOffset(0); }}
            style={{ padding: "7px 14px", background: filter === v ? `${ACCENT}20` : "rgba(255,255,255,0.04)",
              border: `1px solid ${filter === v ? ACCENT : "rgba(255,255,255,0.1)"}`,
              borderRadius: 8, color: filter === v ? ACCENT : "#888", fontWeight: 600,
              fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {["Code","Email","Category","Amount","Registered","Email Status","Actions"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#888", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: "#555" }}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: "#555" }}>No records</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: i < rows.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                  <td style={{ padding: "10px 14px", fontWeight: 700, color: ACCENT, whiteSpace: "nowrap" }}>{r.registration_code}</td>
                  <td style={{ padding: "10px 14px", color: "#ccc", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{r.lead_email}</td>
                  <td style={{ padding: "10px 14px", color: "#888" }}>{r.it_run_categories?.name ?? "—"}</td>
                  <td style={{ padding: "10px 14px", color: GREEN, fontWeight: 700 }}>
                    {r.final_price > 0 ? `₹${r.final_price.toLocaleString("en-IN")}` : "Free"}
                  </td>
                  <td style={{ padding: "10px 14px", color: "#666", whiteSpace: "nowrap" }}>
                    {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    {r.confirmation_email_sent_at ? (
                      <span style={{ color: GREEN, fontSize: 12 }}>
                        ✓ {new Date(r.confirmation_email_sent_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                    ) : (
                      <span style={{ color: "#f59e0b", fontSize: 12 }}>Not sent</span>
                    )}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      {!r.confirmation_email_sent_at ? (
                        <button disabled={sending === r.id} onClick={() => resend(r.id, false)}
                          style={{ padding: "5px 12px", background: `${GREEN}18`, border: `1px solid ${GREEN}30`, borderRadius: 6, color: GREEN, fontSize: 12, fontWeight: 600, cursor: sending === r.id ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                          {sending === r.id ? "Sending…" : "Send"}
                        </button>
                      ) : (
                        <button disabled={sending === r.id} onClick={() => {
                          if (confirm(`Force resend confirmation email to ${r.lead_email}?`)) resend(r.id, true);
                        }}
                          style={{ padding: "5px 12px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 6, color: "#f59e0b", fontSize: 12, fontWeight: 600, cursor: sending === r.id ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                          {sending === r.id ? "Sending…" : "Resend"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {total > LIMIT && (
        <div style={{ display: "flex", gap: 10, marginTop: 14, justifyContent: "center", alignItems: "center" }}>
          <button disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - LIMIT))}
            style={{ padding: "7px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: offset === 0 ? "#444" : "#888", cursor: offset === 0 ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            ← Prev
          </button>
          <span style={{ fontSize: 13, color: "#666" }}>{offset + 1}–{Math.min(offset + LIMIT, total)} of {total}</span>
          <button disabled={offset + LIMIT >= total} onClick={() => setOffset(o => o + LIMIT)}
            style={{ padding: "7px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: offset + LIMIT >= total ? "#444" : "#888", cursor: offset + LIMIT >= total ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

function Pill({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 16px" }}>
      <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color ?? "#fff", marginTop: 2 }}>{value}</div>
    </div>
  );
}
