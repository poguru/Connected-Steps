"use client";

import { useState } from "react";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "11px 14px",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "6px",
  color: "var(--cs-white)",
  fontSize: "0.875rem",
  fontFamily: "var(--font-body)",
  outline: "none",
  boxSizing: "border-box",
};

export default function CorporateForm() {
  const [form, setForm] = useState({ name: "", company: "", phone: "", size: "", message: "" });
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState("");

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.company || !form.phone) { setError("Please fill in all required fields."); return; }
    setSending(true); setError("");
    try {
      const res = await fetch("/api/corporate/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed");
      setSent(true);
    } catch {
      setError("Something went wrong. Please WhatsApp us directly.");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: "10px", padding: "2rem", textAlign: "center" }}>
        <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>✅</div>
        <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--cs-white)", marginBottom: "0.5rem" }}>We'll be in touch within 24 hours!</div>
        <div style={{ fontSize: "0.875rem", color: "var(--cs-muted)" }}>Or WhatsApp us now at +91 97036 20570 for a faster response.</div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div>
          <label style={{ display: "block", fontSize: "11px", color: "var(--cs-muted)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.07em" }}>Your Name *</label>
          <input style={inputStyle} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Full name" required />
        </div>
        <div>
          <label style={{ display: "block", fontSize: "11px", color: "var(--cs-muted)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.07em" }}>Company *</label>
          <input style={inputStyle} value={form.company} onChange={(e) => set("company", e.target.value)} placeholder="Company name" required />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div>
          <label style={{ display: "block", fontSize: "11px", color: "var(--cs-muted)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.07em" }}>Phone *</label>
          <input style={inputStyle} type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 XXXXX XXXXX" required />
        </div>
        <div>
          <label style={{ display: "block", fontSize: "11px", color: "var(--cs-muted)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.07em" }}>Team Size</label>
          <select style={{ ...inputStyle, cursor: "pointer", colorScheme: "dark" }} value={form.size} onChange={(e) => set("size", e.target.value)}>
            <option value="">Select size</option>
            <option value="10-25">10–25 employees</option>
            <option value="25-50">25–50 employees</option>
            <option value="50-100">50–100 employees</option>
            <option value="100+">100+ employees</option>
          </select>
        </div>
      </div>
      <div>
        <label style={{ display: "block", fontSize: "11px", color: "var(--cs-muted)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.07em" }}>Message (optional)</label>
        <textarea style={{ ...inputStyle, resize: "vertical" }} rows={3} value={form.message} onChange={(e) => set("message", e.target.value)} placeholder="Tell us about your team's fitness goals or any specific requirements…" />
      </div>
      {error && <div style={{ fontSize: "0.8rem", color: "#f09595" }}>{error}</div>}
      <button type="submit" disabled={sending} style={{ padding: "14px", background: sending ? "rgba(232,98,10,0.5)" : "var(--cs-orange)", color: "#fff", border: "none", borderRadius: "6px", fontSize: "0.95rem", fontWeight: 700, cursor: sending ? "not-allowed" : "pointer", fontFamily: "var(--font-body)" }}>
        {sending ? "Sending…" : "Request free demo session →"}
      </button>
      <p style={{ fontSize: "11px", color: "var(--cs-muted)", textAlign: "center", margin: 0 }}>
        We respond within 24 hours. Or WhatsApp us directly for a faster reply.
      </p>
    </form>
  );
}
