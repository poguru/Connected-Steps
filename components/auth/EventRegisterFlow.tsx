"use client";

/**
 * EventRegisterFlow
 *
 * Streamlined Email → OTP → (Name + Mobile for new users) → event registration.
 *
 * Entry point: /auth/event-register?return=/events/<slug>/register
 * On success: router.replace(returnUrl) — never /dashboard.
 *
 * Uses the existing OTP infrastructure:
 *   POST /api/auth/send-otp          (purpose="event_register")
 *   POST /api/auth/complete-event-verify
 */

import { useState, useCallback, useRef, useEffect, FormEvent } from "react";
import { useRouter, useSearchParams }                           from "next/navigation";
import OtpInput                                                 from "./OtpInput";
import { Alert, Input }                                         from "@/components/ui/ds";

type Step = "email" | "otp" | "profile" | "done";

const RESEND_COOLDOWN = 30; // seconds

/** Only allow same-origin relative paths; reject protocol-relative & external URLs. */
function safeReturnUrl(raw: string | null): string {
  if (!raw) return "/";
  try {
    const decoded = decodeURIComponent(raw);
    if (
      decoded.startsWith("/") &&
      !decoded.startsWith("//") &&
      !decoded.includes(":")
    ) {
      return decoded;
    }
  } catch { /* malformed encoding */ }
  return "/";
}

export default function EventRegisterFlow() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const returnUrl    = safeReturnUrl(searchParams.get("return"));

  // ── Check if already logged in — skip the flow ──────────────────────────
  useEffect(() => {
    try {
      const raw   = localStorage.getItem("cs_user");
      const token = localStorage.getItem("cs_user_token");
      if (raw && token) {
        const u = JSON.parse(raw);
        if (u?.email) {
          router.replace(returnUrl);
          return;
        }
      }
    } catch { /* corrupted storage — proceed with flow */ }
  }, [returnUrl, router]);

  // ── State ─────────────────────────────────────────────────────────────────
  const [step,        setStep]        = useState<Step>("email");
  const [email,       setEmail]       = useState("");
  const [otp,         setOtp]         = useState("");
  const [name,        setName]        = useState("");
  const [mobile,      setMobile]      = useState("");
  const [error,       setError]       = useState("");
  const [loading,     setLoading]     = useState(false);
  const [cooldown,    setCooldown]    = useState(0);

  const cooldownRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const submittingRef = useRef(false);

  // ── Cooldown timer for resend ────────────────────────────────────────────
  function startCooldown() {
    setCooldown(RESEND_COOLDOWN);
    cooldownRef.current = setInterval(() => {
      setCooldown(c => {
        if (c <= 1) {
          clearInterval(cooldownRef.current!);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

  // ── Step 1: Send OTP ─────────────────────────────────────────────────────
  const sendOtp = useCallback(async (targetEmail: string) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    setError("");
    try {
      const res  = await fetch("/api/auth/send-otp", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ type: "email", value: targetEmail, purpose: "event_register" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to send OTP."); return; }
      setOtp("");
      setStep("otp");
      startCooldown();
    } finally { setLoading(false); submittingRef.current = false; }
  }, []);

  const handleEmailSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }
    setEmail(trimmed);
    sendOtp(trimmed);
  };

  // ── Step 2: Verify OTP (and detect existing vs new user) ─────────────────
  const verifyOtp = useCallback(async (code: string, extraName?: string, extraMobile?: string) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    setError("");
    try {
      const body: Record<string, string> = { email, code };
      if (extraName)   body.name   = extraName;
      if (extraMobile) body.mobile = extraMobile;

      const res  = await fetch("/api/auth/complete-event-verify", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) { setError(data.error ?? "Verification failed."); return; }

      if (data.needs_profile) {
        // New user — collect name + mobile
        setStep("profile");
        return;
      }

      if (data.success && data.user) {
        // Authenticated — store session and redirect
        const { userToken, user } = data as {
          userToken: string;
          user: {
            firstName: string; lastName: string; email: string; phone: string | null;
            goal: string | null; location: string | null; photo: string | null; role: string;
          };
        };
        if (userToken) localStorage.setItem("cs_user_token", userToken);
        localStorage.setItem("cs_user", JSON.stringify(user));
        setStep("done");
        router.replace(returnUrl);
      }
    } finally { setLoading(false); submittingRef.current = false; }
  }, [email, returnUrl, router]);

  const handleOtpComplete = (code: string) => {
    setOtp(code);
    verifyOtp(code);
  };

  // ── Step 3: Profile (new users only) ────────────────────────────────────
  const handleProfileSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmedName   = name.trim();
    const trimmedMobile = mobile.trim();
    if (!trimmedName) { setError("Please enter your full name."); return; }
    if (!trimmedMobile) { setError("Please enter your mobile number."); return; }
    verifyOtp(otp, trimmedName, trimmedMobile);
  };

  // ── Shared styles ─────────────────────────────────────────────────────────
  const card: React.CSSProperties = {
    maxWidth: 420, width: "100%", margin: "0 auto",
    background: "var(--card)", borderRadius: 16,
    border: "1.5px solid var(--border)",
    padding: "32px 28px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.07)",
  };
  const heading: React.CSSProperties = {
    margin: "0 0 4px", fontSize: "1.25rem", fontWeight: 700,
    color: "var(--foreground)", lineHeight: 1.3,
  };
  const sub: React.CSSProperties = {
    margin: "0 0 24px", fontSize: "0.85rem", color: "var(--muted-foreground)", lineHeight: 1.5,
  };
  const btn: React.CSSProperties = {
    width: "100%", padding: "13px 0", borderRadius: 10, border: "none",
    background: loading ? "var(--muted)" : "var(--primary)",
    color: "#fff", fontWeight: 700, fontSize: "0.95rem", cursor: loading ? "not-allowed" : "pointer",
    transition: "background 0.15s",
  };
  const linkBtn: React.CSSProperties = {
    background: "none", border: "none", padding: 0, cursor: "pointer",
    color: "var(--primary)", fontSize: "0.82rem", textDecoration: "underline",
  };

  // ── Logo bar ──────────────────────────────────────────────────────────────
  const Logo = () => (
    <div style={{ textAlign: "center", marginBottom: 28 }}>
      <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--foreground)", letterSpacing: "-0.02em" }}>
        Connected Steps
      </div>
      <div style={{ fontSize: "0.65rem", color: "var(--primary)", letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 2 }}>
        Your Goal, Our Plan
      </div>
    </div>
  );

  // ── Step: email ──────────────────────────────────────────────────────────
  if (step === "email") return (
    <div style={card}>
      <Logo />
      <p style={heading}>Register for this event</p>
      <p style={sub}>Enter your email to get started. No password needed.</p>

      {error && <Alert variant="error" style={{ marginBottom: 16 }}>{error}</Alert>}

      <form onSubmit={handleEmailSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Input
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={e => { setEmail(e.target.value); setError(""); }}
          autoComplete="email"
          autoFocus
          disabled={loading}
        />
        <button type="submit" style={btn} disabled={loading}>
          {loading ? "Sending code…" : "Continue →"}
        </button>
      </form>

      <p style={{ marginTop: 20, textAlign: "center", fontSize: "0.8rem", color: "var(--muted-foreground)" }}>
        Already have an account?{" "}
        <a href="/auth?tab=login" style={{ color: "var(--primary)" }}>Sign in</a>
      </p>
    </div>
  );

  // ── Step: otp ────────────────────────────────────────────────────────────
  if (step === "otp") return (
    <div style={card}>
      <Logo />
      <p style={heading}>Check your email</p>
      <p style={sub}>
        We sent a 6-digit code to <strong>{email}</strong>.
        Enter it below — it expires in 10 minutes.
      </p>

      {error && <Alert variant="error" style={{ marginBottom: 16 }}>{error}</Alert>}

      <div style={{ marginBottom: 20 }}>
        <OtpInput
          value={otp}
          onChange={v => { setOtp(v); setError(""); }}
          onComplete={handleOtpComplete}
          disabled={loading}
        />
      </div>

      <button
        type="button"
        style={{ ...btn, marginBottom: 12 }}
        disabled={loading || otp.length !== 6}
        onClick={() => verifyOtp(otp)}
      >
        {loading ? "Verifying…" : "Verify code"}
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button type="button" style={linkBtn} onClick={() => { setStep("email"); setOtp(""); setError(""); }}>
          ← Change email
        </button>
        {cooldown > 0 ? (
          <span style={{ fontSize: "0.82rem", color: "var(--muted-foreground)" }}>Resend in {cooldown}s</span>
        ) : (
          <button
            type="button"
            style={linkBtn}
            disabled={loading}
            onClick={() => { setOtp(""); setError(""); sendOtp(email); }}
          >
            Resend code
          </button>
        )}
      </div>
    </div>
  );

  // ── Step: profile (new users) ────────────────────────────────────────────
  if (step === "profile") return (
    <div style={card}>
      <Logo />
      <p style={heading}>Almost there!</p>
      <p style={sub}>
        ✅ Email verified. Enter your name and mobile to create your account.
      </p>

      {error && <Alert variant="error" style={{ marginBottom: 16 }}>{error}</Alert>}

      <form onSubmit={handleProfileSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Input
          placeholder="Full name"
          value={name}
          onChange={e => { setName(e.target.value); setError(""); }}
          autoComplete="name"
          autoFocus
          disabled={loading}
        />
        <div style={{ display: "flex", alignItems: "center", border: "1.5px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--surface)" }}>
          <span style={{ padding: "0 10px 0 14px", fontSize: "0.9rem", color: "var(--muted-foreground)", borderRight: "1.5px solid var(--border)", height: "100%", display: "flex", alignItems: "center", whiteSpace: "nowrap", minHeight: 44 }}>+91</span>
          <input
            type="tel"
            inputMode="numeric"
            placeholder="10-digit mobile"
            value={mobile}
            onChange={e => { setMobile(e.target.value.replace(/\D/g, "").slice(0, 10)); setError(""); }}
            autoComplete="tel"
            disabled={loading}
            style={{
              flex: 1, border: "none", outline: "none", padding: "11px 14px",
              fontSize: "0.95rem", background: "transparent", color: "var(--foreground)",
            }}
          />
        </div>
        <p style={{ margin: "0 0 4px", fontSize: "0.75rem", color: "var(--muted-foreground)" }}>
          You can add more profile details (DOB, address, etc.) from your profile after registering.
        </p>
        <button type="submit" style={btn} disabled={loading}>
          {loading ? "Creating account…" : "Create account & continue →"}
        </button>
      </form>
    </div>
  );

  // ── Step: done (redirect in progress) ───────────────────────────────────
  return (
    <div style={card}>
      <Logo />
      <div style={{ textAlign: "center", padding: "24px 0" }}>
        <div style={{ fontSize: "2rem", marginBottom: 12 }}>✅</div>
        <p style={{ ...heading, textAlign: "center" }}>Verified!</p>
        <p style={{ ...sub, textAlign: "center" }}>Taking you back to registration…</p>
      </div>
    </div>
  );
}
