"use client";

import { useEffect, useState, Suspense, FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

type Status = "loading" | "success" | "error";
type ErrorCode = "not_found" | "expired" | "db_error" | "network" | "no_token" | string;

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token        = searchParams.get("token") ?? "";

  const [status,    setStatus]    = useState<Status>("loading");
  const [message,   setMessage]   = useState("");
  const [errorCode, setErrorCode] = useState<ErrorCode>("");
  const [email,     setEmail]     = useState("");

  // Resend state (shown when token is invalid/expired so user can recover)
  const [resendEmail,   setResendEmail]   = useState("");
  const [resendSending, setResendSending] = useState(false);
  const [resendResult,  setResendResult]  = useState<"" | "sent" | "error">("");
  const [resendMsg,     setResendMsg]     = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("No verification token found in this link. Please use the button from your verification email.");
      setErrorCode("no_token");
      return;
    }

    fetch("/api/auth/verify-email", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ token }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setEmail(data.email ?? "");
          setStatus("success");
        } else {
          setStatus("error");
          setMessage(data.error ?? "Verification failed. Please try again.");
          setErrorCode(data.code ?? "unknown");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Network error. Please check your connection and try again.");
        setErrorCode("network");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleResend(e: FormEvent) {
    e.preventDefault();
    if (!resendEmail.trim()) return;
    setResendSending(true); setResendResult(""); setResendMsg("");
    try {
      const res  = await fetch("/api/auth/send-email-verification", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: resendEmail.trim().toLowerCase(), name: "Runner" }),
      });
      const data = await res.json();
      if (res.ok) {
        setResendResult("sent");
        setResendMsg(`Verification email sent to ${resendEmail.trim()}. Check your inbox (and spam folder).`);
      } else {
        setResendResult("error");
        setResendMsg(data.error ?? "Failed to send email. Please try again.");
      }
    } catch {
      setResendResult("error");
      setResendMsg("Network error. Please try again.");
    } finally {
      setResendSending(false);
    }
  }

  const canResend = ["not_found", "expired", "no_token", "network", "unknown"].includes(errorCode);

  // ── Styles ─────────────────────────────────────────────────────────────────
  const bg: React.CSSProperties = {
    minHeight: "100vh",
    background: "#080808",
    color: "#f0f0f0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "2rem 1rem",
    fontFamily: "system-ui, sans-serif",
  };

  const card: React.CSSProperties = {
    maxWidth: 420,
    width: "100%",
    background: "#111",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: "2rem 1.5rem",
    textAlign: "center",
  };

  return (
    <div style={bg}>
      <div style={{ marginBottom: 32, display: "flex", alignItems: "center", gap: 10 }}>
        <Image src="/logo.png" alt="" width={32} height={32} style={{ borderRadius: "50%" }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>Connected Steps</span>
      </div>

      {status === "loading" && (
        <div style={card}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #222", borderTopColor: "#e8620a", animation: "spin .7s linear infinite", margin: "0 auto 16px" }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#ccc" }}>Verifying your email…</div>
        </div>
      )}

      {status === "success" && (
        <div style={{ ...card, border: "1px solid rgba(74,222,128,0.3)", background: "rgba(74,222,128,0.05)" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#4ade80", marginBottom: 8 }}>Email Verified!</div>
          {email && (
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#888" }}>{email}</p>
          )}
          <p style={{ margin: "0 0 24px", fontSize: 13, color: "#aaa", lineHeight: 1.7 }}>
            Your email has been verified. You can close this tab and return to the signup form to continue.
          </p>
          <Link
            href="/auth?tab=signup"
            style={{ display: "inline-block", padding: "11px 28px", background: "linear-gradient(135deg,#e8620a,#ff8c42)", color: "#fff", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 14 }}
          >
            Continue Sign Up →
          </Link>
        </div>
      )}

      {status === "error" && (
        <div style={{ ...card, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.04)" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>
            {errorCode === "db_error" ? "⚙️" : "❌"}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#f87171", marginBottom: 8 }}>
            {errorCode === "db_error" ? "Service Unavailable" : "Verification Failed"}
          </div>
          <p style={{ margin: "0 0 20px", fontSize: 13, color: "#aaa", lineHeight: 1.7 }}>
            {message}
          </p>

          {/* Resend form — shown for fixable errors */}
          {canResend && (
            <div style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "16px", marginBottom: 16, textAlign: "left" }}>
              <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#ccc" }}>
                Get a new verification link
              </p>
              {resendResult === "sent" ? (
                <p style={{ margin: 0, fontSize: 13, color: "#4ade80", lineHeight: 1.6 }}>
                  ✅ {resendMsg}
                </p>
              ) : (
                <form onSubmit={handleResend} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input
                    type="email"
                    required
                    placeholder="Enter your email address"
                    value={resendEmail}
                    onChange={e => setResendEmail(e.target.value)}
                    style={{ padding: "9px 12px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none" }}
                  />
                  {resendResult === "error" && (
                    <p style={{ margin: 0, fontSize: 12, color: "#f87171" }}>{resendMsg}</p>
                  )}
                  <button
                    type="submit"
                    disabled={resendSending || !resendEmail.trim()}
                    style={{ padding: "10px", background: resendEmail.trim() && !resendSending ? "linear-gradient(135deg,#e8620a,#ff8c42)" : "rgba(232,98,10,0.3)", color: "#fff", border: "none", borderRadius: 8, fontFamily: "inherit", fontWeight: 700, fontSize: 13, cursor: resendEmail.trim() && !resendSending ? "pointer" : "not-allowed" }}
                  >
                    {resendSending ? "Sending…" : "Send New Verification Link →"}
                  </button>
                </form>
              )}
            </div>
          )}

          <Link
            href="/auth?tab=signup"
            style={{ display: "inline-block", padding: "11px 28px", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", color: "#ccc", borderRadius: 999, textDecoration: "none", fontWeight: 600, fontSize: 14 }}
          >
            Back to Sign Up
          </Link>
        </div>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
