"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";

interface Participant {
  id: string; first_name: string; last_name: string;
  email: string | null; mobile: string;
  company_name: string | null; employee_id: string | null;
  company_id_url: string | null; verification_status: string;
  it_run_registrations: {
    registration_code: string; payment_status: string;
    it_run_categories: { name: string } | null;
  };
}

const ACCENT = "#e8620a";
const STATUS_OPTS = [
  { value: "pending",            label: "Pending Review", color: "#f59e0b" },
  { value: "verified",           label: "Verified",       color: "#10b981" },
  { value: "rejected",           label: "Rejected",       color: "#ef4444" },
  { value: "need_clarification", label: "Needs Clarification", color: "#6366f1" },
];

export default function VerificationPage() {
  const [tab,      setTab]      = useState("pending");
  const [data,     setData]     = useState<Participant[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(0);
  const [loading,  setLoading]  = useState(false);
  const [notes,    setNotes]    = useState<Record<string, string>>({});
  const [updating, setUpdating] = useState<string | null>(null);
  const [preview,  setPreview]  = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/it-run/admin/verification?status=${tab}&page=${page}&limit=20`);
      const d    = await res.json();
      setData(d.data ?? []);
      setTotal(d.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [tab, page]);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(id: string, status: string) {
    setUpdating(id);
    try {
      await fetch("/api/it-run/admin/verification", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ participantId: id, status, notes: notes[id] ?? "" }),
      });
      await load();
    } finally {
      setUpdating(null);
    }
  }

  const CARD: React.CSSProperties = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, overflow: "hidden" };
  const BTN = (color: string): React.CSSProperties => ({ padding: "7px 14px", background: `${color}15`, border: `1px solid ${color}40`, borderRadius: 8, color, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: "clamp(18px,3vw,24px)", fontWeight: 800, color: "#fff", margin: 0 }}>Company ID Verification</h1>
        <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>Review uploaded company IDs from participants</div>
      </div>

      {/* Status tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {STATUS_OPTS.map(s => (
          <button key={s.value} onClick={() => { setTab(s.value); setPage(0); }}
            style={{
              padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
              background: tab === s.value ? `${s.color}15` : "rgba(255,255,255,0.03)",
              border: `1px solid ${tab === s.value ? s.color : "rgba(255,255,255,0.1)"}`,
              color:  tab === s.value ? s.color : "#888",
            }}>
            {s.label}
          </button>
        ))}
      </div>

      {loading ? <div style={{ color: "#888", padding: 40, textAlign: "center" }}>Loading...</div> : (
        <>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>{total} participant(s) with this status</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {data.length === 0 && <div style={{ color: "#888", padding: 20, textAlign: "center" }}>No participants in this status</div>}
            {data.map(p => (
              <div key={p.id} style={CARD}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, padding: 20, alignItems: "start" }}>
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{p.first_name} {p.last_name}</span>
                      <span style={{ fontSize: 11, color: "#888", background: "rgba(255,255,255,0.06)", padding: "2px 8px", borderRadius: 6 }}>
                        {p.it_run_registrations?.it_run_categories?.name ?? "Unknown"}
                      </span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "6px 16px", marginBottom: 12 }}>
                      {[
                        ["Email",      p.email ?? "-"],
                        ["Mobile",     p.mobile],
                        ["Company",    p.company_name ?? "-"],
                        ["Employee ID",p.employee_id ?? "-"],
                        ["Reg Code",   p.it_run_registrations?.registration_code ?? "-"],
                      ].map(([l, v]) => (
                        <div key={l as string}>
                          <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: "0.07em" }}>{l}</div>
                          <div style={{ fontSize: 13, color: "#ccc" }}>{v}</div>
                        </div>
                      ))}
                    </div>

                    {/* Notes */}
                    <textarea
                      placeholder="Notes / reason for action (optional)"
                      value={notes[p.id] ?? ""}
                      onChange={e => setNotes(prev => ({ ...prev, [p.id]: e.target.value }))}
                      style={{ width: "100%", padding: "8px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 12, fontFamily: "inherit", resize: "none", height: 48, boxSizing: "border-box" }}
                    />

                    {/* Action buttons */}
                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      {tab !== "verified" && (
                        <button onClick={() => updateStatus(p.id, "verified")} disabled={updating === p.id} style={BTN("#10b981")}>
                          {updating === p.id ? "..." : "Verify"}
                        </button>
                      )}
                      {tab !== "rejected" && (
                        <button onClick={() => updateStatus(p.id, "rejected")} disabled={updating === p.id} style={BTN("#ef4444")}>
                          {updating === p.id ? "..." : "Reject"}
                        </button>
                      )}
                      {tab !== "need_clarification" && (
                        <button onClick={() => updateStatus(p.id, "need_clarification")} disabled={updating === p.id} style={BTN("#6366f1")}>
                          {updating === p.id ? "..." : "Clarification"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ID Preview */}
                  {p.company_id_url ? (
                    <button onClick={() => setPreview(p.company_id_url!)}
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 0, cursor: "pointer", overflow: "hidden", flexShrink: 0, width: 100, height: 80 }}>
                      {p.company_id_url.endsWith(".pdf") ? (
                        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
                          <span style={{ fontSize: 24 }}>&#128196;</span>
                          <span style={{ fontSize: 10, color: "#888" }}>PDF</span>
                        </div>
                      ) : (
                        <img src={p.company_id_url} alt="Company ID" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      )}
                    </button>
                  ) : (
                    <div style={{ width: 100, height: 80, background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#555", flexShrink: 0 }}>
                      No ID
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {total > 20 && (
            <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "center" }}>
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{ padding: "7px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#ccc", cursor: "pointer", fontFamily: "inherit" }}>
                Prev
              </button>
              <span style={{ padding: "7px 14px", fontSize: 13, color: "#888" }}>
                {page + 1} / {Math.ceil(total / 20)}
              </span>
              <button disabled={(page + 1) * 20 >= total} onClick={() => setPage(p => p + 1)} style={{ padding: "7px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#ccc", cursor: "pointer", fontFamily: "inherit" }}>
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Image preview modal */}
      {preview && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => setPreview(null)}>
          <div style={{ position: "relative", maxWidth: 700, maxHeight: "90vh", width: "100%" }} onClick={e => e.stopPropagation()}>
            {preview.endsWith(".pdf") ? (
              <iframe src={preview} style={{ width: "100%", height: "80vh", borderRadius: 12 }} />
            ) : (
              <img src={preview} alt="Company ID" style={{ width: "100%", maxHeight: "80vh", objectFit: "contain", borderRadius: 12 }} />
            )}
            <button onClick={() => setPreview(null)}
              style={{ position: "absolute", top: -12, right: -12, width: 32, height: 32, background: "#e8620a", border: "none", borderRadius: "50%", color: "#fff", cursor: "pointer", fontSize: 16, fontFamily: "inherit" }}>
              x
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
