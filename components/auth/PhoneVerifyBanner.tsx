"use client";

import { useState, useEffect, useCallback } from "react";
import OtpInput from "./OtpInput";

/**
 * PhoneVerifyBanner
 *
 * Shown at the top of the dashboard when the logged-in user has not yet
 * verified their mobile number. Uses the new /api/auth/send-phone-otp and
 * /api/auth/verify-phone-otp endpoints which store OTPs in users.otp_hash
 * and set phone_verified_at on success.
 *
 * Flow:
 *   1. User sees banner with phone pre-filled (or enters one)
 *   2. Tap "Send OTP" → WhatsApp message via Meta Cloud API
 *   3. Enter 6-digit code → phone_verified = true
 */

type BannerStep = "prompt" | "otp" | "done";

const RESEND_COOLDOWN = 30;

export default function PhoneVerifyBanner() {
  const [visible,    setVisible]    = useState(false);
  const [step,       setStep]       = useState<BannerStep>("prompt");
  const [phone,      setPhone]      = useState("");
  const [otp,        setOtp]        = useState("");
  const [error,      setError]      = useState("");
  const [userToken,  setUserToken]  = useState("");
  const [sending,    setSending]    = useState(false);
  const [verifying,  setVerifying]  = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    const flag = localStorage.getItem("cs_requires_phone_verification");
    if (flag !== "true") return;

    const raw = localStorage.getItem("cs_user");
    const tok = localStorage.getItem("cs_user_token") ?? "";
    if (!raw) return;

    try {
      const u = JSON.parse(raw) as { phone?: string; phone_verified?: boolean };
      if (u.phone_verified) { localStorage.removeItem("cs_requires_phone_verification"); return; }
      setUserToken(tok);
      if (u.phone) {
        const digits = u.phone.replace(/\D/g, "").slice(0, 10);
        setPhone(digits);
      }
      setVisible(true);
    } catch { /* corrupt localStorage — ignore */ }
  }, []);

  // Resend countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  if (!visible || step === "done") return null;

  const phone10 = phone.replace(/\D/g, "").slice(0, 10);

  function maskPhone(p: string): string {
    const digits = p.replace(/\D/g, "");
    if (digits.length < 4) return `+91 ${digits}`;
    return `+91 ${"X".repeat(digits.length - 3)}${digits.slice(-3)}`;
  }

  async function sendOtp(isResend = false) {
    if (!phone10 || phone10.length !== 10) { setError("Please enter a valid 10-digit mobile number."); return; }
    setSending(true); setError("");
    try {
      const res  = await fetch("/api/auth/send-phone-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-token": userToken },
        body: JSON.stringify({ phone: phone10, purpose: "verify_phone" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to send OTP."); return; }
      if (!isResend) setStep("otp");
      setResendCooldown(RESEND_COOLDOWN);
    } catch { setError("Network error. Please try again."); }
    finally { setSending(false); }
  }

  const verifyOtp = useCallback(async (code: string) => {
    if (code.length !== 6 || verifying) return;
    setVerifying(true); setError("");
    try {
      const res  = await fetch("/api/auth/verify-phone-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-token": userToken },
        body: JSON.stringify({ phone: phone10, code, purpose: "verify_phone" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Verification failed."); return; }

      // Update localStorage so the banner never shows again in this session
      const raw = localStorage.getItem("cs_user");
      if (raw) {
        const u = JSON.parse(raw);
        u.phone_verified = true;
        u.phone = phone10;
        localStorage.setItem("cs_user", JSON.stringify(u));
      }
      localStorage.removeItem("cs_requires_phone_verification");
      setStep("done");
    } catch { setError("Network error. Please try again."); }
    finally { setVerifying(false); }
  }, [phone10, userToken, verifying]);

  const bannerStyle: React.CSSProperties = {
    background: "linear-gradient(90deg, oklch(0.25 0.06 49) 0%, oklch(0.22 0.05 280) 100%)",
    border:      "1px solid oklch(0.72 0.19 49 / 30%)",
    borderRadius: 12, padding: "16px 20px",
    marginBottom: 20, color: "#fff",
  };

  // ── Prompt step ────────────────────────────────────────────────────────────
  if (step === "prompt") return (
    <div style={bannerStyle}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
            <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>Verify your WhatsApp number</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
            Verify to receive session reminders and secure your account.
          </p>
        </div>
        <button onClick={() => setVisible(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0 }} aria-label="Dismiss">×</button>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {/* +91 prefix + phone input */}
        <div style={{ display: "flex", flex: 1, minWidth: 160, borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)" }}>
          <span style={{ padding: "9px 10px", fontSize: 14, color: "rgba(255,255,255,0.7)", fontWeight: 600, borderRight: "1px solid rgba(255,255,255,0.15)", whiteSpace: "nowrap" }}>+91</span>
          <input
            type="tel" inputMode="numeric" placeholder="9876543210" maxLength={10}
            value={phone10}
            onChange={e => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); setError(""); }}
            style={{ flex: 1, padding: "9px 10px", border: "none", background: "transparent", color: "#fff", fontSize: 14, outline: "none", fontFamily: "inherit" }}
          />
        </div>
        <button
          onClick={() => sendOtp()}
          disabled={sending || phone10.length !== 10}
          style={{ padding: "9px 20px", borderRadius: 8, background: phone10.length === 10 ? "var(--gradient-accent)" : "oklch(0.72 0.19 49 / 30%)", color: "#fff", border: "none", cursor: phone10.length === 10 ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 13, fontFamily: "inherit", boxShadow: phone10.length === 10 ? "var(--shadow-orange)" : "none", whiteSpace: "nowrap" }}
        >
          {sending ? "Sending…" : "Send OTP →"}
        </button>
      </div>
      {error && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#fca5a5" }}>{error}</p>}
    </div>
  );

  // ── OTP step ───────────────────────────────────────────────────────────────
  return (
    <div style={bannerStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 18 }}>📱</span>
        <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>
          Enter the code sent to{" "}
          <span style={{ fontFamily: "monospace" }}>{maskPhone(phone10)}</span>
        </span>
      </div>
      <p style={{ margin: "0 0 12px", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
        Sent via WhatsApp. Expires in 5 minutes.
      </p>
      <OtpInput
        value={otp}
        onChange={v => { setOtp(v); setError(""); }}
        onComplete={verifyOtp}
        disabled={verifying}
      />
      {error && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#fca5a5" }}>{error}</p>}
      <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button
          onClick={() => verifyOtp(otp)}
          disabled={verifying || otp.length !== 6}
          style={{ padding: "9px 20px", borderRadius: 8, background: otp.length === 6 ? "var(--gradient-accent)" : "oklch(0.72 0.19 49 / 30%)", color: "#fff", border: "none", cursor: otp.length === 6 && !verifying ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 13, fontFamily: "inherit", boxShadow: otp.length === 6 ? "var(--shadow-orange)" : "none" }}
        >
          {verifying ? "Verifying…" : "Verify →"}
        </button>
        <button
          onClick={() => sendOtp(true)}
          disabled={sending || resendCooldown > 0}
          style={{ background: "none", border: "none", cursor: resendCooldown > 0 || sending ? "not-allowed" : "pointer", fontSize: 12, color: resendCooldown > 0 ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.6)", fontFamily: "inherit", textDecoration: resendCooldown > 0 ? "none" : "underline" }}
        >
          {sending ? "Sending…" : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend OTP"}
        </button>
        <button onClick={() => { setStep("prompt"); setOtp(""); setError(""); setResendCooldown(0); }}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,0.4)", fontFamily: "inherit" }}>
          ← Change number
        </button>
      </div>
    </div>
  );
}
