"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

export default function CoachLoginPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res  = await fetch("/api/admin/auth/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Login failed"); return; }
      router.push("/coach");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "#111", border: "1px solid #222",
    borderRadius: 10, padding: "12px 14px", color: "#f0f0f0",
    fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 380, padding: "0 24px" }}>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 36 }}>
          <Image src="/logo.png" alt="Connected Steps" width={56} height={56} style={{ borderRadius: "50%", marginBottom: 14 }} />
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: -0.5 }}>Connected Steps</div>
          <div style={{ fontSize: 12, color: "#e8620a", marginTop: 4, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>Coach Portal</div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, color: "#666", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              required placeholder="coach@connectedsteps.in"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 11, color: "#666", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>Password</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              required placeholder="••••••••"
              style={inputStyle}
              onKeyDown={e => e.key === "Enter" && handleSubmit(e as unknown as React.FormEvent)}
            />
          </div>

          {error && (
            <div style={{ background: "rgba(220,50,50,0.1)", border: "1px solid rgba(220,50,50,0.3)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#f87171" }}>
              {error}
            </div>
          )}

          <button
            type="submit" disabled={loading}
            style={{ background: loading ? "#1a1a1a" : "#e8620a", color: loading ? "#444" : "#fff", border: "none", borderRadius: 10, padding: "14px", fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", marginTop: 4, fontFamily: "inherit" }}
          >
            {loading ? "Signing in…" : "Sign In as Coach →"}
          </button>
        </form>

        <div style={{ marginTop: 28, textAlign: "center" }}>
          <Link href="/admin/login" style={{ fontSize: 12, color: "#333", textDecoration: "none" }}>
            Admin? Sign in here →
          </Link>
        </div>
      </div>
    </div>
  );
}
