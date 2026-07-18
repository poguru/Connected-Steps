"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res  = await fetch("/api/it-run/portal/auth", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Login failed"); return; }

      // Redirect based on role
      const roleRoutes: Record<string, string> = {
        event_admin:       "/it-run/admin",
        verification_team: "/it-run/admin/verification",
        bib_collection:    "/it-run/bib",
        checkin_team:      "/it-run/checkin",
        support_desk:      "/it-run/admin/registrations",
      };
      router.push(roleRoutes[data.role] ?? "/it-run/admin");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const INPUT: React.CSSProperties = {
    width: "100%", padding: "13px 16px", borderRadius: 10,
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
    color: "#fff", fontSize: 14, fontFamily: "inherit", outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div style={{ background: "#080808", color: "#fff", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1rem", fontFamily: "'Inter',system-ui,sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <Image src="/logo.png" alt="" width={48} height={48} style={{ borderRadius: "50%", marginBottom: 16 }} />
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px", color: "#fff" }}>IT Run Admin Portal</h1>
          <p style={{ fontSize: 13, color: "#888", margin: 0 }}>The IT Run Sprint-2 | Event Management</p>
        </div>

        <form onSubmit={handleLogin} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 28 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Email</label>
            <input style={INPUT} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Portal email address" required autoFocus />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Password</label>
            <input style={INPUT} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required />
          </div>

          {error && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 16, padding: "10px 14px", background: "rgba(239,68,68,0.08)", borderRadius: 8 }}>{error}</div>}

          <button type="submit" disabled={loading}
            style={{ width: "100%", padding: "13px", background: "#e8620a", color: "#fff", fontWeight: 700, fontSize: 15, borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "inherit", opacity: loading ? 0.6 : 1 }}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p style={{ textAlign: "center", fontSize: 12, color: "#555", marginTop: 20 }}>
          Participant portal? <a href="/it-run" style={{ color: "#e8620a", textDecoration: "none" }}>Event page</a>
        </p>
      </div>
    </div>
  );
}
