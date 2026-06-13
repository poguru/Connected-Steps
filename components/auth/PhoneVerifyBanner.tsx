"use client";

import { useState, useEffect } from "react";
import OtpInput from "./OtpInput";

/**
 * PhoneVerifyBanner
 *
 * Shown at the top of the dashboard when the logged-in user has not yet
 * verified their mobile number. Provides an inline OTP flow:
 *   1. Enter / confirm phone number
 *   2. Receive OTP via WhatsApp
 *   3. Enter OTP → phone_verified = true
 *
 * On success it updates localStorage and dismisses itself so it never shows
 * again in the session without a page reload.
 */

type BannerStep = "prompt" | "sending" | "otp" | "done";

export default function PhoneVerifyBanner() {
  const [visible,   setVisible]   = useState(false);
  const [step,      setStep]      = useState<BannerStep>("prompt");
  const [phone,     setPhone]     = useState("");
  const [otp,       setOtp]       = useState("");
  const [error,     setError]     = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userToken, setUserToken] = useState("");
  const [sending,   setSending]   = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const flag = localStorage.getItem("cs_requires_phone_verification");
    if (flag !== "true") return;

    const raw = localStorage.getItem("cs_user");
    const tok = localStorage.getItem("cs_user_token") ?? "";
    if (!raw) return;

    try {
      const u = JSON.parse(raw) as { email?: string; phone?: string; phone_verified?: boolean };
      if (u.phone_verified) { localStorage.removeItem("cs_requires_phone_verification"); return; }
      setUserEmail(u.email ?? "");
      setUserToken(tok);
      if (u.phone) setPhone(u.phone);
      setVisible(true);
    } catch { /* corrupt localStorage — ignore */ }
  }, []);

  if (!visible || step === "done") return null;

  async function sendOtp() {
    if (!phone.trim()) { setError("Please enter your mobile number."); return; }
    setSending(true); setError("");
    try {
      const res  = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "phone", value: phone.trim(), purpose: "verify_phone" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to send OTP."); return; }
      setStep("otp");
    } catch { setError("Network error. Please try again."); }
    finally { setSending(false); }
  }

  async function verifyOtp() {
    if (otp.length !== 6) { setError("Please enter the 6-digit code."); return; }
    setVerifying(true); setError("");
    try {
      const res  = await fetch("/api/auth/verify-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-token": userToken },
        body: JSON.stringify({ email: userEmail, phone: phone.trim(), code: otp, purpose: "verify_phone" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Verification failed."); return; }

      // Persist the updated phone_verified status to localStorage
      const raw = localStorage.getItem("cs_user");
      if (raw) {
        const u = JSON.parse(raw);
        u.phone_verified = true;
        u.phone = phone.trim();
        localStorage.setItem("cs_user", JSON.stringify(u));
      }
      localStorage.removeItem("cs_requires_phone_verification");
      setStep("done");
    } catch { setError("Network error. Please try again."); }
    finally { setVerifying(false); }
  }

  const bannerStyle: React.CSSProperties = {
    background: "linear-gradient(90deg, oklch(0.25 0.06 49) 0%, oklch(0.22 0.05 280) 100%)",
    border: "1px solid oklch(0.72 0.19 49 / 30%)",
    borderRadius: 12, padding: "16px 20px",
    marginBottom: 20, color: "#fff",
  };

  if (step === "prompt" || step === "sending") return (
    <div style={bannerStyle}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 18 }}>📱</span>
            <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>Verify your mobile number</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
            Add and verify your WhatsApp number to receive session reminders and secure your account.
          </p>
        </div>
        <button onClick={() => setVisible(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0 }} aria-label="Dismiss">×</button>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="tel"
          placeholder="e.g. 9876543210"
          value={phone}
          onChange={e => { setPhone(e.target.value); setError(""); }}
          style={{ flex: 1, minWidth: 160, padding: "9px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)", color: "#fff", fontSize: 14, outline: "none", fontFamily: "inherit" }}
        />
        <button
          onClick={sendOtp}
          disabled={sending || !phone.trim()}
          style={{ padding: "9px 20px", borderRadius: 8, background: phone.trim() ? "var(--gradient-accent)" : "oklch(0.72 0.19 49 / 30%)", color: "#fff", border: "none", cursor: phone.trim() ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 13, fontFamily: "inherit", boxShadow: phone.trim() ? "var(--shadow-orange)" : "none", whiteSpace: "nowrap" }}
        >
          {sending ? "Sending…" : "Send OTP →"}
        </button>
      </div>
      {error && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#fca5a5" }}>{error}</p>}
    </div>
  );

  // OTP step
  return (
    <div style={bannerStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 18 }}>📱</span>
        <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>Enter the OTP sent to {phone}</span>
      </div>
      <p style={{ margin: "0 0 12px", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
        Sent via WhatsApp. Expires in 5 minutes.
      </p>
      <OtpInput value={otp} onChange={v => { setOtp(v); setError(""); }} />
      {error && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#fca5a5" }}>{error}</p>}
      <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button
          onClick={verifyOtp}
          disabled={verifying || otp.length !== 6}
          style={{ padding: "9px 20px", borderRadius: 8, background: otp.length === 6 ? "var(--gradient-accent)" : "oklch(0.72 0.19 49 / 30%)", color: "#fff", border: "none", cursor: otp.length === 6 ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 13, fontFamily: "inherit", boxShadow: otp.length === 6 ? "var(--shadow-orange)" : "none" }}
        >
          {verifying ? "Verifying…" : "Verify →"}
        </button>
        <button onClick={() => { setStep("sending"); sendOtp(); }} disabled={sending}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,0.5)", fontFamily: "inherit", textDecoration: "underline" }}>
          {sending ? "Sending…" : "Resend OTP"}
        </button>
        <button onClick={() => { setStep("prompt"); setOtp(""); setError(""); }}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,0.4)", fontFamily: "inherit" }}>
          ← Change number
        </button>
      </div>
    </div>
  );
}
