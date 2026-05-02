"use client";

import { useState, FormEvent } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

export default function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const token        = searchParams.get("token") ?? "";

  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");
  const [showPw,    setShowPw]    = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [done,      setDone]      = useState(false);

  if (!token) {
    return (
      <div className="auth-layout">
        <div className="auth-right">
          <div style={{ width: "100%", maxWidth: "380px", textAlign: "center" }}>
            <div style={{ fontSize: "0.9rem", color: "#f09595", marginBottom: "1rem" }}>Invalid or missing reset link.</div>
            <Link href="/auth/forgot-password" style={{ fontSize: "0.8rem", color: "var(--cs-orange)" }}>Request a new one</Link>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) { setError("Please enter a new password."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    setError("");
    try {
      const res  = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setDone(true);
      setTimeout(() => router.push("/auth?tab=login"), 2500);
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
              Set new password
            </h2>
            <p style={{ fontSize: "0.8rem", color: "var(--cs-muted)" }}>
              Choose a strong password for your account.
            </p>
          </div>

          {done ? (
            <div style={{ background: "rgba(232,98,10,0.1)", border: "1px solid rgba(232,98,10,0.3)", borderRadius: "6px", padding: "1.25rem", textAlign: "center" }}>
              <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>✅</div>
              <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--cs-white)", marginBottom: "0.4rem" }}>Password updated!</div>
              <div style={{ fontSize: "0.8rem", color: "var(--cs-muted)" }}>Redirecting you to sign in…</div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <div className="mb-3 flex items-center auth-input" style={{ padding: 0 }}>
                <input
                  type={showPw ? "text" : "password"}
                  placeholder="New password (min 8 chars)"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  autoComplete="new-password"
                  style={{ flex: 1, background: "transparent", border: "none", outline: "none", padding: "11px 14px", color: "var(--cs-white)", fontFamily: "var(--font-body)", fontSize: "14px" }}
                />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  style={{ color: "var(--cs-muted)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 500, padding: "0 14px 0 0", whiteSpace: "nowrap" }}>
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>

              <div className="mb-4">
                <input
                  className="auth-input"
                  type={showPw ? "text" : "password"}
                  placeholder="Confirm new password"
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setError(""); }}
                  autoComplete="new-password"
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
                {loading ? "Updating…" : "Update password"}
              </button>
            </form>
          )}

          <div style={{ textAlign: "center", marginTop: "1rem" }}>
            <Link href="/auth/forgot-password" style={{ fontSize: "0.8rem", color: "var(--cs-muted)", textDecoration: "none" }}>
              Request a new link
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
