"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

type Status = "loading" | "success" | "error";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token        = searchParams.get("token") ?? "";

  const [status,  setStatus]  = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [email,   setEmail]   = useState("");

  useEffect(() => {
    if (!token) { setStatus("error"); setMessage("No verification token found in this link."); return; }

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
        }
      })
      .catch(() => { setStatus("error"); setMessage("Network error. Please try again."); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    maxWidth: 400,
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
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>❌</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#f87171", marginBottom: 8 }}>Verification Failed</div>
          <p style={{ margin: "0 0 24px", fontSize: 13, color: "#aaa", lineHeight: 1.7 }}>{message}</p>
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
