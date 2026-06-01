"use client";

import { useState, useEffect } from "react";

const CATEGORIES = ["Injury / Pain", "Training Question", "Diet & Recovery", "General"];

interface CoachQuestion {
  id: string;
  category: string;
  question: string;
  answer: string | null;
  status: string;
  created_at: string;
  answered_at: string | null;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function AskCoachFab() {
  const [open,     setOpen]     = useState(false);
  const [history,  setHistory]  = useState<CoachQuestion[]>([]);
  const [form,     setForm]     = useState({ category: "Injury / Pain", question: "" });
  const [saving,   setSaving]   = useState(false);
  const [msg,      setMsg]      = useState("");
  const [showHist, setShowHist] = useState(false);

  function getUser() {
    const raw = typeof window !== "undefined" ? localStorage.getItem("cs_user") : null;
    return raw ? JSON.parse(raw) : null;
  }

  function loadHistory() {
    const user = getUser();
    if (!user?.email) return;
    fetch(`/api/coach-questions?email=${encodeURIComponent(user.email)}`)
      .then((r) => r.json())
      .then((d) => { if (d.questions) setHistory(d.questions); })
      .catch(() => {});
  }

  useEffect(() => {
    if (open) loadHistory();
  }, [open]);

  async function submit() {
    if (!form.question.trim()) { setMsg("Please describe your question or issue."); return; }
    setSaving(true); setMsg("");
    try {
      const user = getUser();
      if (!user?.email) { setMsg("Please log in."); return; }
      const res = await fetch("/api/coach-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_email: user.email,
          user_name:  `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email.split("@")[0],
          category:   form.category,
          question:   form.question.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error ?? "Something went wrong."); return; }
      setMsg("✓ Sent! Your coach will respond soon.");
      setForm((f) => ({ ...f, question: "" }));
      loadHistory();
    } catch { setMsg("Something went wrong. Please try again."); }
    finally { setSaving(false); }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: "28px", right: "20px", zIndex: 50,
          display: "flex", alignItems: "center", gap: "8px",
          padding: "12px 20px", background: "var(--cs-dark)",
          border: "1px solid rgba(232,98,10,0.4)",
          color: "var(--cs-orange)", borderRadius: "50px",
          fontSize: "0.82rem", fontWeight: 700, cursor: "pointer",
          fontFamily: "inherit", boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          transition: "border-color 0.2s, transform 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--cs-orange)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(232,98,10,0.4)"; e.currentTarget.style.transform = "none"; }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
        </svg>
        Ask your coach
      </button>

      {/* Modal */}
      {open && (
        <div
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}
        >
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "14px", width: "100%", maxWidth: "480px", maxHeight: "90vh", overflowY: "auto", display: "flex", flexDirection: "column" }}>

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.25rem 1.5rem", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <div>
                <div style={{ fontSize: "1rem", fontWeight: 700, color: "#fff" }}>Ask Your Coach</div>
                <div style={{ fontSize: "11px", color: "var(--cs-muted)", marginTop: "2px" }}>Injury, training doubts, or anything else</div>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#888", fontSize: "1.25rem", cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              {["Ask", "My Questions"].map((tab) => {
                const active = tab === "Ask" ? !showHist : showHist;
                return (
                  <button key={tab} onClick={() => setShowHist(tab === "My Questions")}
                    style={{ flex: 1, padding: "0.75rem", fontSize: "0.82rem", fontWeight: 600, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", color: active ? "var(--cs-orange)" : "var(--cs-muted)", borderBottom: active ? "2px solid var(--cs-orange)" : "2px solid transparent", transition: "color 0.15s" }}>
                    {tab}
                  </button>
                );
              })}
            </div>

            {!showHist ? (
              /* Ask form */
              <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                {/* Category */}
                <div>
                  <div style={{ fontSize: "11px", color: "#888", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>Category</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {CATEGORIES.map((cat) => (
                      <button key={cat} onClick={() => setForm((f) => ({ ...f, category: cat }))}
                        style={{ padding: "5px 12px", borderRadius: "20px", fontSize: "0.78rem", fontWeight: 500, cursor: "pointer", fontFamily: "inherit", border: "none", background: form.category === cat ? "rgba(232,98,10,0.15)" : "rgba(255,255,255,0.05)", color: form.category === cat ? "var(--cs-orange)" : "#888", outline: form.category === cat ? "1px solid rgba(232,98,10,0.4)" : "none", transition: "all 0.15s" }}>
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Question */}
                <div>
                  <div style={{ fontSize: "11px", color: "#888", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>Your Question / Issue</div>
                  <textarea
                    value={form.question}
                    onChange={(e) => { setForm((f) => ({ ...f, question: e.target.value.slice(0, 800) })); setMsg(""); }}
                    placeholder="Describe your injury, pain, question, or concern in detail…"
                    rows={5}
                    style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff", fontSize: "0.875rem", outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", lineHeight: 1.6 }}
                  />
                  <div style={{ fontSize: "10px", color: "#555", textAlign: "right", marginTop: "3px" }}>{form.question.length}/800</div>
                </div>

                {msg && <div style={{ fontSize: "0.82rem", color: msg.startsWith("✓") ? "#4ade80" : "#f09595", textAlign: "center" }}>{msg}</div>}

                <button onClick={submit} disabled={saving}
                  style={{ padding: "13px", background: "var(--cs-orange)", color: "#fff", border: "none", borderRadius: "8px", fontSize: "0.9rem", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, fontFamily: "inherit" }}>
                  {saving ? "Sending…" : "Send to Coach"}
                </button>
              </div>
            ) : (
              /* History */
              <div style={{ padding: "1rem 1.5rem 1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                {history.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "2rem 0", color: "var(--cs-muted)", fontSize: "0.875rem" }}>No questions sent yet.</div>
                ) : history.map((q) => (
                  <div key={q.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "4px" }}>
                      <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 10px", borderRadius: "20px", background: "rgba(232,98,10,0.12)", color: "var(--cs-orange)" }}>{q.category}</span>
                      <span style={{ fontSize: "10px", color: "var(--cs-muted)" }}>{fmtDate(q.created_at)}</span>
                    </div>
                    <div style={{ fontSize: "0.85rem", color: "#ddd", lineHeight: 1.5 }}>{q.question}</div>
                    {q.answer ? (
                      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "0.6rem" }}>
                        <div style={{ fontSize: "10px", color: "var(--cs-orange)", fontWeight: 700, marginBottom: "4px" }}>Coach reply · {fmtDate(q.answered_at!)}</div>
                        <div style={{ fontSize: "0.85rem", color: "#ccc", lineHeight: 1.5 }}>{q.answer}</div>
                      </div>
                    ) : (
                      <div style={{ fontSize: "11px", color: "var(--cs-muted)", fontStyle: "italic" }}>Awaiting coach reply…</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
