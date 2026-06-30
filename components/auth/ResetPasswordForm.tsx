"use client";

import { useState, FormEvent } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";
import { Alert } from "@/components/ui/ds";

export default function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const token        = searchParams.get("token") ?? "";

  const [password,     setPassword]     = useState("");
  const [confirm,      setConfirm]      = useState("");
  const [showPw,       setShowPw]       = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [done,      setDone]      = useState(false);

  if (!token) {
    return (
      <div className="auth-layout">
        <div className="auth-right">
          <div style={{ width: "100%", maxWidth: "380px", textAlign: "center" }}>
            <Alert variant="error" style={{ marginBottom: "1rem" }}>Invalid or missing reset link.</Alert>
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
              {/* New password — relative container keeps toggle inside field */}
              <div className="mb-3" style={{ position: "relative" }}>
                <input
                  className="auth-input"
                  type={showPw ? "text" : "password"}
                  placeholder="New password (min 8 chars)"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  autoComplete="new-password"
                  aria-label="New password"
                  style={{ paddingRight: 44 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--cs-muted)", display: "flex", alignItems: "center", padding: 0 }}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {/* Confirm password — same pattern */}
              <div className="mb-4" style={{ position: "relative" }}>
                <input
                  className="auth-input"
                  type={showConfirm ? "text" : "password"}
                  placeholder="Confirm new password"
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setError(""); }}
                  autoComplete="new-password"
                  aria-label="Confirm new password"
                  style={{ paddingRight: 44 }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--cs-muted)", display: "flex", alignItems: "center", padding: 0 }}
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {error && <Alert variant="error" style={{ marginBottom: "1rem" }}>{error}</Alert>}

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
