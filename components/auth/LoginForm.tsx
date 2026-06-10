"use client";

import { useState, FormEvent, ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import OtpInput from "./OtpInput";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "11px 14px",
  background: "var(--surface)", border: "1px solid var(--border)",
  borderRadius: 10, color: "var(--foreground)",
  fontFamily: "var(--font-body)", fontSize: 15, outline: "none",
  transition: "border-color 0.15s, box-shadow 0.15s", boxSizing: "border-box",
};

const focusOn  = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.boxShadow = "0 0 0 3px oklch(0.72 0.19 49 / 15%)"; };
const focusOff = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = "var(--border)";  e.currentTarget.style.boxShadow = "none"; };

type Mode    = "password" | "otp";
type OtpStep = "identifier" | "code";

interface Props { onSwitchToSignUp: () => void; }

export default function LoginForm({ onSwitchToSignUp }: Props) {
  const router       = useRouter();
  const searchParams = useSearchParams();

  // ── Password mode ──────────────────────────────────────────────────────────
  const [form, setForm]       = useState({ identifier: "", password: "" });
  const [showPw, setShowPw]   = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError,   setPwError]   = useState("");

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setForm(p => ({ ...p, [e.target.name]: e.target.value }));
    setPwError("");
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.identifier || !form.password) { setPwError("Please enter your email and password."); return; }
    setPwLoading(true);
    try {
      const res  = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: form.identifier, password: form.password }) });
      const data = await res.json();
      if (!res.ok) { setPwError(data.error); return; }
      saveAndRedirect(data.user);
    } catch { setPwError("Something went wrong. Please try again."); }
    finally   { setPwLoading(false); }
  };

  // ── OTP mode ───────────────────────────────────────────────────────────────
  const [mode,       setMode]       = useState<Mode>("password");
  const [otpStep,    setOtpStep]    = useState<OtpStep>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [otpCode,    setOtpCode]    = useState("");
  const [sending,    setSending]    = useState(false);
  const [verifying,  setVerifying]  = useState(false);
  const [otpError,   setOtpError]   = useState("");

  function saveAndRedirect(user: Record<string, unknown>) {
    const photo = localStorage.getItem("cs_pending_photo") ?? null;
    localStorage.setItem("cs_user", JSON.stringify({ ...user, photo: photo || null }));
    localStorage.removeItem("cs_pending_photo");
    const savedStrava = localStorage.getItem(`cs_strava_${user.email}`);
    if (savedStrava) localStorage.setItem("cs_strava", savedStrava);
    // Validate redirect to prevent open redirect attacks — only allow relative paths
    const raw = searchParams.get("redirect") ?? "";
    const safe = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
    router.push(safe);
  }

  async function sendOtp() {
    if (!identifier.trim()) { setOtpError("Please enter your email or phone number."); return; }
    setSending(true); setOtpError("");
    try {
      const res  = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "email", value: identifier.trim(), purpose: "login" }),
      });
      const data = await res.json();
      if (!res.ok) { setOtpError(data.error ?? "Failed to send OTP."); return; }
      setOtpStep("code");
    } catch { setOtpError("Network error. Please try again."); }
    finally { setSending(false); }
  }

  async function verifyOtp() {
    if (otpCode.length !== 6) { setOtpError("Please enter the 6-digit OTP."); return; }
    setVerifying(true); setOtpError("");
    try {
      const res  = await fetch("/api/auth/login-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim(), code: otpCode }),
      });
      const data = await res.json();
      if (!res.ok) { setOtpError(data.error ?? "Verification failed."); return; }
      saveAndRedirect(data.user);
    } catch { setOtpError("Something went wrong. Please try again."); }
    finally { setVerifying(false); }
  }

  function switchMode(m: Mode) {
    setMode(m); setOtpStep("identifier");
    setOtpCode(""); setOtpError(""); setPwError("");
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

      <input style={inputStyle} name="identifier" type="text" placeholder="Email address"
        value={form.identifier} onChange={handleChange} autoComplete="username"
        onFocus={focusOn} onBlur={focusOff} />

      <div style={{ position: "relative" }}>
        <input style={{ ...inputStyle, paddingRight: 44 }} name="password" type={showPw ? "text" : "password"}
          placeholder="Password" value={form.password} onChange={handleChange} autoComplete="current-password"
          onFocus={focusOn} onBlur={focusOff} />
        <button type="button" onClick={() => setShowPw(!showPw)}
          style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", display: "flex", padding: 0 }}>
          {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>

      <div style={{ textAlign: "right" }}>
        <Link href="/auth/forgot-password" style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", textDecoration: "none" }}>
          Forgot password?
        </Link>
      </div>

      {pwError && <div style={{ background: "oklch(0.62 0.22 22 / 10%)", border: "1px solid oklch(0.62 0.22 22 / 30%)", borderRadius: 8, padding: "10px 14px", fontSize: "0.8rem", color: "#f09595", textAlign: "center" }}>{pwError}</div>}

      <button type="submit" disabled={pwLoading} style={{ width: "100%", padding: "13px", borderRadius: 999, background: pwLoading ? "oklch(0.72 0.19 49 / 60%)" : "var(--gradient-accent)", color: "var(--accent-foreground)", border: "none", cursor: pwLoading ? "not-allowed" : "pointer", fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "0.95rem", boxShadow: pwLoading ? "none" : "var(--shadow-orange)", transition: "opacity 0.2s" }}>
        {pwLoading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );

  // ══ OTP MODE — identifier step ═════════════════════════════════════════════
  if (otpStep === "identifier") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <ModeToggle />
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.6 }}>
        Enter your registered email and we&apos;ll send you a one-time code.
      </p>
      <input
        style={inputStyle} type="email" placeholder="Email address"
        value={identifier} onChange={e => { setIdentifier(e.target.value); setOtpError(""); }}
        autoComplete="username" onFocus={focusOn} onBlur={focusOff}
      />
      {otpError && <div style={{ background: "oklch(0.62 0.22 22 / 10%)", border: "1px solid oklch(0.62 0.22 22 / 30%)", borderRadius: 8, padding: "10px 14px", fontSize: "0.8rem", color: "#f09595", textAlign: "center" }}>{otpError}</div>}
      <button
        type="button" onClick={sendOtp} disabled={sending || !identifier.trim()}
        style={{ width: "100%", padding: "13px", borderRadius: 999, background: identifier.trim() ? "var(--gradient-accent)" : "oklch(0.72 0.19 49 / 30%)", color: "var(--accent-foreground)", border: "none", cursor: identifier.trim() ? "pointer" : "not-allowed", fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "0.95rem", boxShadow: identifier.trim() ? "var(--shadow-orange)" : "none" }}
      >
        {sending ? "Sending…" : "Send OTP →"}
      </button>
    </div>
  );

  // ══ OTP MODE — code step ═══════════════════════════════════════════════════
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <ModeToggle />
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.6 }}>
        OTP sent to <strong style={{ color: "var(--foreground)" }}>{identifier}</strong>.{" "}
        {"Check your inbox."}
      </p>
      <OtpInput value={otpCode} onChange={v => { setOtpCode(v); setOtpError(""); }} />
      {otpError && <div style={{ background: "oklch(0.62 0.22 22 / 10%)", border: "1px solid oklch(0.62 0.22 22 / 30%)", borderRadius: 8, padding: "10px 14px", fontSize: "0.8rem", color: "#f09595", textAlign: "center" }}>{otpError}</div>}
      <button
        type="button" onClick={verifyOtp} disabled={verifying || otpCode.length !== 6}
        style={{ width: "100%", padding: "13px", borderRadius: 999, background: otpCode.length === 6 ? "var(--gradient-accent)" : "oklch(0.72 0.19 49 / 30%)", color: "var(--accent-foreground)", border: "none", cursor: otpCode.length === 6 ? "pointer" : "not-allowed", fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "0.95rem", boxShadow: otpCode.length === 6 ? "var(--shadow-orange)" : "none" }}
      >
        {verifying ? "Verifying…" : "Verify & Sign in →"}
      </button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button type="button" onClick={() => { setOtpStep("identifier"); setOtpCode(""); setOtpError(""); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--muted-foreground)", fontFamily: "var(--font-body)" }}>
          ← Change
        </button>
        <button type="button" onClick={sendOtp} disabled={sending} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--muted-foreground)", fontFamily: "var(--font-body)", textDecoration: "underline" }}>
          {sending ? "Sending…" : "Resend OTP"}
        </button>
      </div>
    </div>
  );
}
