"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StaffLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    if (!email || !password) {
      setError("Email and password required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/it-run/staff/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, eventSlug: "sprint-2" }),
      });

      const data = await res.json();

      if (res.ok) {
        router.push("/it-run/staff/dashboard");
      } else {
        setError(data.error ?? "Login failed");
      }
    } catch (e) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  const ACCENT = "#e8620a";

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)",
        padding: "20px",
        fontFamily: "inherit",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 16,
          padding: 40,
          backdropFilter: "blur(10px)",
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 40, textAlign: "center" }}>
          <div
            style={{
              fontSize: 32,
              fontWeight: 900,
              color: ACCENT,
              marginBottom: 8,
              letterSpacing: "-0.02em",
            }}
          >
            IT Run
          </div>
          <div style={{ fontSize: 14, color: "#888", marginBottom: 4 }}>Sprint-2 Operations</div>
          <div style={{ fontSize: 13, color: "#555" }}>Race-Day Staff Portal</div>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              marginBottom: 20,
              padding: "12px 16px",
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 8,
              fontSize: 13,
              color: "#f87171",
              fontWeight: 600,
            }}
          >
            ✗ {error}
          </div>
        )}

        {/* Email */}
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              display: "block",
              fontSize: 11,
              color: "#666",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 6,
              fontWeight: 600,
            }}
          >
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            placeholder="staff@connectedsteps.in"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "14px 16px",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 10,
              color: "#fff",
              fontSize: 14,
              fontFamily: "inherit",
              outline: "none",
              transition: "all 0.15s",
            }}
          />
        </div>

        {/* Password */}
        <div style={{ marginBottom: 24 }}>
          <label
            style={{
              display: "block",
              fontSize: 11,
              color: "#666",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 6,
              fontWeight: 600,
            }}
          >
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            placeholder="••••••••"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "14px 16px",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 10,
              color: "#fff",
              fontSize: 14,
              fontFamily: "inherit",
              outline: "none",
              transition: "all 0.15s",
            }}
          />
        </div>

        {/* Sign In */}
        <button
          onClick={handleLogin}
          disabled={loading || !email || !password}
          style={{
            width: "100%",
            padding: "16px 20px",
            background:
              loading || !email || !password
                ? "rgba(255,255,255,0.05)"
                : ACCENT,
            border: "none",
            borderRadius: 10,
            color: loading || !email || !password ? "#444" : "#fff",
            fontSize: 15,
            fontWeight: 700,
            cursor: loading || !email || !password ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            transition: "all 0.15s",
          }}
        >
          {loading ? "Signing in…" : "Sign In"}
        </button>

        {/* Footer */}
        <div
          style={{
            marginTop: 24,
            paddingTop: 24,
            borderTop: "1px solid rgba(255,255,255,0.06)",
            fontSize: 11,
            color: "#555",
            textAlign: "center",
            lineHeight: 1.6,
          }}
        >
          For staff access, contact your Event Admin.
          <br />
          Passwords are securely hashed server-side.
        </div>
      </div>
    </div>
  );
}
