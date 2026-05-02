"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";

export default function ForgotPasswordForm() {
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [sent,    setSent]    = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError("Please enter your email address."); return; }
    setLoading(true);
    setError("");
    try {
      const res  = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-layout">
      {/* Left brand panel */}
      <div className="auth-left">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", maxWidth: "400px", width: "100%" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <Image src="/logo.png" alt="Connected Steps" width={100} height={100} className="rounded-full"
              style={{ border: "2px solid rgba(232,98,10,0.4)", display: "block" }} />
          </Link>
          <div className="font-display" style={{ fontSize: "1.9rem", fontWeight: 600, color: "var(--cs-white)", marginTop: "1.25rem" }}>
            Connected Steps
          </div>
          <div style={{ fontSize: "11px", letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--cs-orange)", marginTop: "6px" }}>
            Your Goal, Our Plan
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="auth-right">
        <div style={{ width: "100%", maxWidth: "380px" }}>

          <div style={{ marginBottom: "2rem" }}>
            <h2 className="font-display" style={{ fontSize: "1.5rem", fontWeight: 300, color: "var(--cs-white)", marginBottom: "0.4rem" }}>
              Forgot password
            </h2>
            <p style={{ fontSize: "0.8rem", color: "var(--cs-muted)" }}>
              Enter your registered email and we'll send you a reset link.
            </p>
          </div>

          {sent ? (
            <div style={{ background: "rgba(232,98,10,0.1)", border: "1px solid rgba(232,98,10,0.3)", borderRadius: "6px", padding: "1.25rem", textAlign: "center" }}>
              <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>📬</div>
              <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--cs-white)", marginBottom: "0.4rem" }}>Check your inbox</div>
              <div style={{ fontSize: "0.8rem", color: "var(--cs-muted)" }}>
                We sent a password reset link to <strong style={{ color: "var(--cs-white)" }}>{email}</strong>. It expires in 1 hour.
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <div className="mb-3">
                <input
                  className="auth-input"
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  autoComplete="email"
                />
              </div>

              {error && (
                <div className="text-xs px-3 py-2 rounded mb-4 text-center"
                  style={{ background: "rgba(226,75,74,0.1)", border: "1px solid rgba(226,75,74,0.3)", color: "#f09595" }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded font-medium text-sm tracking-wide mb-4"
                style={{
                  background: loading ? "rgba(232,98,10,0.6)" : "var(--cs-orange)",
                  color: "var(--cs-black)",
                  border: "none",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontFamily: "var(--font-body)",
                  borderRadius: "4px",
                }}
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}

          <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
            <Link href="/auth?tab=login" style={{ fontSize: "0.8rem", color: "var(--cs-muted)", textDecoration: "none" }}>
              ← Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
