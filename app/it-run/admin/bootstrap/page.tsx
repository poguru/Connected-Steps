"use client";
import { useState } from "react";

export default function BootstrapPage() {
  const [key,      setKey]      = useState("");
  const [email,    setEmail]    = useState("pogurukalyan@gmail.com");
  const [name,     setName]     = useState("Super Admin");
  const [password, setPassword] = useState("");
  const [msg,      setMsg]      = useState("");
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    try {
      const res  = await fetch("/api/it-run/admin-bootstrap", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ bootstrapKey: key, email, name, password }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg("Error: " + (data.error ?? "unknown")); return; }
      setMsg("Success! Redirecting to admin...");
      setTimeout(() => { window.location.href = "/it-run/admin"; }, 1000);
    } catch (e) {
      setMsg("Network error: " + String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ background: "#141414", border: "1px solid #262626", borderRadius: 12, padding: 40, width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 11, color: "#e8620a", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 6 }}>Connected Steps</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>Admin Bootstrap</div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>One-time setup — delete this page after use</div>
        </div>
        <form onSubmit={handleSubmit}>
          {[
            { label: "Razorpay Webhook Secret", value: key,      set: setKey,      type: "password", placeholder: "From Vercel env vars" },
            { label: "Email",                    value: email,    set: setEmail,    type: "email",    placeholder: "" },
            { label: "Name",                     value: name,     set: setName,     type: "text",     placeholder: "" },
            { label: "New Password",             value: password, set: setPassword, type: "password", placeholder: "Choose a password" },
          ].map(({ label, value, set, type, placeholder }) => (
            <div key={label} style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>{label}</label>
              <input
                type={type}
                value={value}
                onChange={e => set(e.target.value)}
                placeholder={placeholder}
                required
                style={{ width: "100%", background: "#0a0a0a", border: "1px solid #333", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 14, boxSizing: "border-box" }}
              />
            </div>
          ))}
          {msg && (
            <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8, background: msg.startsWith("Error") ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)", border: `1px solid ${msg.startsWith("Error") ? "rgba(239,68,68,0.3)" : "rgba(16,185,129,0.3)"}`, color: msg.startsWith("Error") ? "#f87171" : "#10b981", fontSize: 13 }}>
              {msg}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{ width: "100%", background: "#e8620a", border: "none", borderRadius: 8, padding: "12px 0", color: "#fff", fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Creating…" : "Create Admin & Log In"}
          </button>
        </form>
      </div>
    </div>
  );
}
