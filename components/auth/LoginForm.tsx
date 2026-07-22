"use client";

import { useState, useRef, useEffect, useCallback, FormEvent, ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import OtpInput from "./OtpInput";
import { Alert, Input, PasswordInput } from "@/components/ui/ds";

const WA_OTP_ENABLED = process.env.NEXT_PUBLIC_WA_OTP_ENABLED === "true";

type Mode    = "password" | "otp";
type OtpStep = "identifier" | "code";

const RESEND_COOLDOWN = 30;

interface Props { onSwitchToSignUp: () => void; }

function isPhoneInput(val: string): boolean {
  const digits = val.replace(/\D/g, "");
  // Treat as phone if: all digits, or starts with +91/91, and 10-13 digits
  if (val.includes("@")) return false;
  return digits.length >= 10 && digits.length <= 13;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const local  = digits.startsWith("91") ? digits.slice(2) : digits;
  if (local.length < 4) return `+91 ${local}`;
  return `+91 ${"X".repeat(local.length - 3)}${local.slice(-3)}`;
}

export default function LoginForm({ onSwitchToSignUp }: Props) {
  const router       = useRouter();
  const searchParams = useSearchParams();

  // ── Password mode ──────────────────────────────────────────────────────────
  const [form, setForm]           = useState({ identifier: "", password: "" });
  const [showPw, setShowPw]         = useState(false);
  const [pwLoading, setPwLoading]   = useState(false);
  const [pwError,   setPwError]     = useState("");
  const [pwErrorCode, setPwErrorCode] = useState("");
  const submittingRef               = useRef(false);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setForm(p => ({ ...p, [e.target.name]: e.target.value }));
    setPwError("");
    setPwErrorCode("");
  };

  const submitLogin = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    if (!form.identifier || !form.password) {
      setPwError("Please enter your mobile number or email, and password.");
      submittingRef.current = false;
      return;
    }
    setPwLoading(true);
    try {
      const res  = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: form.identifier, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwError(data.error);
        setPwErrorCode(data.code ?? "");
        return;
      }
      saveAndRedirect(data.user, data.requiresPhoneVerification);
    } catch { setPwError("Something went wrong. Please try again."); }
    finally   { setPwLoading(false); submittingRef.current = false; }
  };

  const handlePasswordSubmit = (e: FormEvent) => { e.preventDefault(); submitLogin(); };

  // ── OTP mode ───────────────────────────────────────────────────────────────
  const [mode,       setMode]       = useState<Mode>("password");
  const [otpStep,    setOtpStep]    = useState<OtpStep>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [otpCode,    setOtpCode]    = useState("");
  const [sending,    setSending]    = useState(false);
  const [verifying,  setVerifying]  = useState(false);
  const [otpError,   setOtpError]   = useState("");
  const [otpErrorCode, setOtpErrorCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const isPhone = isPhoneInput(identifier.trim());

  function saveAndRedirect(user: Record<string, unknown>, requiresPhoneVerification?: boolean) {
    const photo = localStorage.getItem("cs_pending_photo") ?? null;
    const { userToken, coachToken, ...rest } = user;
    const userData = {
      ...rest,
      photo:          photo || rest.photo || null,
      phone_verified: rest.phone_verified ?? false,
    };
    localStorage.setItem("cs_user", JSON.stringify(userData));
    // Keep cs_user_token in localStorage during Phase 1 transition (90 days).
    // NativeShell uses it for fast offline session checks on Capacitor.
    // The server now sets cs_user_session as an httpOnly cookie (the real auth).
    // cs_auth (non-httpOnly, JS-readable) is intentionally NOT set — the server
    // sets the httpOnly cookie instead.
    if (userToken)  localStorage.setItem("cs_user_token",  userToken  as string);
    if (coachToken) localStorage.setItem("cs_coach_token", coachToken as string);
    // Set flag for PhoneVerifyBanner if phone is unverified
    if (requiresPhoneVerification) {
      localStorage.setItem("cs_requires_phone_verification", "true");
    } else {
      localStorage.removeItem("cs_requires_phone_verification");
    }
    localStorage.removeItem("cs_pending_photo");
    localStorage.removeItem(`cs_member_${user.email}`);
    const pendingLocation = localStorage.getItem("cs_pending_location");
    if (pendingLocation && userToken) {
      localStorage.removeItem("cs_pending_location");
      fetch("/api/user/location", {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-user-token": userToken as string },
        body:    JSON.stringify({ location_id: pendingLocation }),
      }).catch(() => {});
    }
    const savedStrava = localStorage.getItem(`cs_strava_${user.email}`);
    if (savedStrava) localStorage.setItem("cs_strava", savedStrava);
    const stored = sessionStorage.getItem("cs_post_login_redirect") ?? "";
    sessionStorage.removeItem("cs_post_login_redirect");
    const param  = searchParams.get("redirect") ?? "";
    const dest   = stored || param;
    const role   = (user.role as string | undefined) ?? "user";
    const defaultDest = role === "coach" ? "/coach" : "/dashboard";
    const safe   = dest.startsWith("/") && !dest.startsWith("//") ? dest : defaultDest;
    router.push(safe);
  }

  async function sendOtp() {
    const val = identifier.trim();
    if (!val) { setOtpError("Please enter your mobile number or email."); return; }

    // When WA OTP is disabled, block phone OTP and redirect to email
    if (!WA_OTP_ENABLED && isPhone) {
      setOtpError("Phone OTP is temporarily unavailable. Please sign in with your email address using password login, or enter your email to receive an OTP.");
      return;
    }

    setSending(true); setOtpError("");
    try {
      let res: Response;
      if (isPhone) {
        // Phone OTP — use the new Meta WhatsApp endpoint (WA_OTP_ENABLED=true path)
        const digits = val.replace(/\D/g, "");
        const phone10 = digits.length === 12 && digits.startsWith("91") ? digits.slice(2)
          : digits.length === 13 && digits.startsWith("091") ? digits.slice(3)
          : digits;
        res = await fetch("/api/auth/send-phone-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: phone10, purpose: "login" }),
        });
      } else {
        // Email OTP — existing endpoint
        res = await fetch("/api/auth/send-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "email", value: val, purpose: "login" }),
        });
      }
      const data = await res.json();
      if (!res.ok) {
        setOtpError(data.error ?? "Failed to send OTP.");
        setOtpErrorCode(data.code ?? (res.status === 404 ? "not_found" : ""));
        return;
      }
      setOtpStep("code");
      setResendCooldown(RESEND_COOLDOWN);
    } catch { setOtpError("Network error. Please try again."); }
    finally { setSending(false); }
  }

  const verifyOtp = useCallback(async (code: string) => {
    if (code.length !== 6 || verifying) return;
    setVerifying(true); setOtpError("");
    try {
      const val = identifier.trim();
      let res: Response;
      if (isPhone) {
        const digits = val.replace(/\D/g, "");
        const phone10 = digits.length === 12 && digits.startsWith("91") ? digits.slice(2)
          : digits.length === 13 && digits.startsWith("091") ? digits.slice(3)
          : digits;
        res = await fetch("/api/auth/verify-phone-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: phone10, code, purpose: "login" }),
        });
      } else {
        res = await fetch("/api/auth/login-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: val, code }),
        });
      }
      const data = await res.json();
      if (!res.ok) { setOtpError(data.error ?? "Verification failed."); return; }
      saveAndRedirect(data.user, data.requiresPhoneVerification);
    } catch { setOtpError("Something went wrong. Please try again."); }
    finally { setVerifying(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identifier, isPhone, verifying]);

  function switchMode(m: Mode) {
    setMode(m); setOtpStep("identifier");
    setOtpCode(""); setOtpError(""); setOtpErrorCode("");
    setPwError(""); setPwErrorCode(""); setResendCooldown(0);
  }

  // ── Mode toggle ─────────────────────────────────────────────────────────────
  const ModeToggle = () => (
    <div style={{ display: "flex", gap: 4, padding: 4, marginBottom: "1.25rem", borderRadius: 999, background: "var(--surface)" }}>
      {(["password", "otp"] as Mode[]).map(m => (
        <button key={m} onClick={() => switchMode(m)} type="button" style={{
          flex: 1, padding: "9px", borderRadius: 999, fontSize: "0.82rem", fontWeight: 600,
          background: mode === m ? "var(--gradient-accent)" : "transparent",
          color: mode === m ? "var(--accent-foreground)" : "var(--muted-foreground)",
          fontFamily: "var(--font-body)", border: "none", cursor: "pointer", transition: "all 0.2s",
          boxShadow: mode === m ? "var(--shadow-orange)" : "none",
        }}>
          {m === "password" ? "Password" : "Sign in with OTP"}
        </button>
      ))}
    </div>
  );

  // ══ PASSWORD MODE ══════════════════════════════════════════════════════════
  if (mode === "password") return (
    <form onSubmit={handlePasswordSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <ModeToggle />

      <Input name="identifier" type="text"
        placeholder="Mobile number or email"
        value={form.identifier} onChange={handleChange} autoComplete="username" />

      <PasswordInput placeholder="Password" name="password"
        value={form.password} onChange={handleChange} autoComplete="current-password" />

      <div style={{ textAlign: "right" }}>
        <Link href="/auth/forgot-password" style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", textDecoration: "none" }}>
          Forgot password?
        </Link>
      </div>

      {pwError && <Alert variant="error">{pwError}</Alert>}
      {pwErrorCode === "not_found" && (
        <button type="button" onClick={onSwitchToSignUp}
          style={{ width: "100%", padding: "11px", borderRadius: 999, background: "transparent", color: "var(--primary)", border: "1.5px solid var(--primary)", cursor: "pointer", fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "0.9rem" }}>
          Create a new account →
        </button>
      )}
      {pwErrorCode === "email_unverified" && (
        <button type="button" onClick={onSwitchToSignUp}
          style={{ width: "100%", padding: "11px", borderRadius: 999, background: "transparent", color: "var(--primary)", border: "1.5px solid var(--primary)", cursor: "pointer", fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "0.9rem" }}>
          Register again to resend verification →
        </button>
      )}

      <button
        type="button" onClick={submitLogin} onTouchEnd={submitLogin} disabled={pwLoading}
        style={{ width: "100%", padding: "13px", borderRadius: 999, background: pwLoading ? "oklch(0.72 0.19 49 / 60%)" : "var(--gradient-accent)", color: "var(--accent-foreground)", border: "none", cursor: pwLoading ? "not-allowed" : "pointer", fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "0.95rem", boxShadow: pwLoading ? "none" : "var(--shadow-orange)", transition: "opacity 0.2s" }}
      >
        {pwLoading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );

  // ══ OTP MODE — identifier step ═════════════════════════════════════════════
  if (otpStep === "identifier") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <ModeToggle />
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.6 }}>
        Enter your registered mobile number or email and we&apos;ll send you a one-time code.
      </p>
      <Input type="text"
        placeholder="Mobile number or email"
        value={identifier} onChange={e => { setIdentifier(e.target.value); setOtpError(""); setOtpErrorCode(""); }}
        autoComplete="username" />
      {otpError && <Alert variant="error">{otpError}</Alert>}
      {otpErrorCode === "not_found" && (
        <button type="button" onClick={onSwitchToSignUp}
          style={{ width: "100%", padding: "11px", borderRadius: 999, background: "transparent", color: "var(--primary)", border: "1.5px solid var(--primary)", cursor: "pointer", fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "0.9rem" }}>
          Create a new account →
        </button>
      )}
      <button
        type="button" onClick={sendOtp} disabled={sending || !identifier.trim()}
        style={{ width: "100%", padding: "13px", borderRadius: 999, background: identifier.trim() ? "var(--gradient-accent)" : "oklch(0.72 0.19 49 / 30%)", color: "var(--accent-foreground)", border: "none", cursor: identifier.trim() ? "pointer" : "not-allowed", fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "0.95rem", boxShadow: identifier.trim() ? "var(--shadow-orange)" : "none" }}
      >
        {sending ? "Sending…" : "Send OTP →"}
      </button>
    </div>
  );

  // ══ OTP MODE — code step ═══════════════════════════════════════════════════
  const displayTarget = isPhone ? maskPhone(identifier.trim()) : identifier.trim();
  const channel       = isPhone ? "WhatsApp" : "email";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <ModeToggle />
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.6 }}>
        OTP sent to{" "}
        <strong style={{ color: "var(--foreground)", fontFamily: isPhone ? "monospace" : "inherit" }}>
          {displayTarget}
        </strong>{" "}
        via {channel}.
      </p>
      <OtpInput
        value={otpCode}
        onChange={v => { setOtpCode(v); setOtpError(""); }}
        onComplete={verifyOtp}
        disabled={verifying}
      />
      {otpError && <Alert variant="error">{otpError}</Alert>}
      <button
        type="button" onClick={() => verifyOtp(otpCode)} disabled={verifying || otpCode.length !== 6}
        style={{ width: "100%", padding: "13px", borderRadius: 999, background: otpCode.length === 6 ? "var(--gradient-accent)" : "oklch(0.72 0.19 49 / 30%)", color: "var(--accent-foreground)", border: "none", cursor: otpCode.length === 6 && !verifying ? "pointer" : "not-allowed", fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "0.95rem", boxShadow: otpCode.length === 6 ? "var(--shadow-orange)" : "none" }}
      >
        {verifying ? "Verifying…" : "Verify & Sign in →"}
      </button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button type="button" onClick={() => { setOtpStep("identifier"); setOtpCode(""); setOtpError(""); setResendCooldown(0); }}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--muted-foreground)", fontFamily: "var(--font-body)" }}>
          ← Change
        </button>
        <button
          type="button"
          onClick={sendOtp}
          disabled={sending || resendCooldown > 0}
          style={{ background: "none", border: "none", cursor: resendCooldown > 0 || sending ? "not-allowed" : "pointer", fontSize: 12, color: resendCooldown > 0 ? "var(--muted-foreground)" : "var(--primary)", fontFamily: "var(--font-body)", textDecoration: resendCooldown > 0 ? "none" : "underline" }}
        >
          {sending ? "Sending…" : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend OTP"}
        </button>
      </div>
    </div>
  );
}
