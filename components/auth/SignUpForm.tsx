"use client";

import { useState, useEffect, useRef, useCallback, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Camera, CheckCircle2, Mail } from "lucide-react";
import OtpInput from "./OtpInput";
import { Alert, Input, PasswordInput, Select } from "@/components/ui/ds";

// ── Feature flag ──────────────────────────────────────────────────────────────
// Set NEXT_PUBLIC_WA_OTP_ENABLED=true to re-enable the WhatsApp OTP signup flow.
// When false (default), the email verification flow is used instead.
const WA_OTP_ENABLED = process.env.NEXT_PUBLIC_WA_OTP_ENABLED === "true";

const GOALS = [
  { id: "5k",       label: "First 5K"            },
  { id: "10k",      label: "10K"                 },
  { id: "half",     label: "Half Marathon"        },
  { id: "full",     label: "Full Marathon"        },
  { id: "ultra",    label: "Ultra Marathon"       },
  { id: "fitness",  label: "General Fitness"      },
  { id: "speed",    label: "Improve Speed/Pace"   },
  { id: "weight",   label: "Weight Loss"          },
  { id: "strength", label: "Strength & Endurance" },
];

const RESEND_COOLDOWN = 30;

// Step order: Basic Info → Verify Email → Additional Details
type Step = "basic" | "email-verify" | "details";

// Legacy WA-OTP step — preserved for feature-flag re-enablement
type LegacyStep = "phone-otp";
type AnyStep = Step | LegacyStep;

interface Props { onSwitchToLogin: () => void; }

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const visible = user.length > 3 ? user.slice(0, 2) + "***" : user[0] + "***";
  return `${visible}@${domain}`;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "+91 " + digits;
  return `+91 ${"X".repeat(digits.length - 3)}${digits.slice(-3)}`;
}

export default function SignUpForm({ onSwitchToLogin }: Props) {
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  // ── State ─────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<AnyStep>("basic");

  // Basic step fields
  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [email,     setEmail]     = useState("");   // required
  const [phone,     setPhone]     = useState("");   // optional contact info
  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");

  // Email verification step
  const [sending,        setSending]        = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [emailVerified,  setEmailVerified]  = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Legacy WA OTP step (behind WA_OTP_ENABLED flag)
  const [phoneOtp,      setPhoneOtp]      = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [verifying,     setVerifying]     = useState(false);
  const [otpError,      setOtpError]      = useState("");
  const [otpSendFailed, setOtpSendFailed] = useState(false);

  // Details step fields
  const [dob,               setDob]               = useState("");
  const [goal,              setGoal]              = useState("5k");
  const [location,          setLocation]          = useState("");
  const [customLoc,         setCustomLoc]         = useState("");
  const [preferredLocation, setPreferredLocation] = useState("");
  const [trainingLocations, setTrainingLocations] = useState<{ id: string; name: string; meeting_point: string | null }[]>([]);
  const [referralInput,     setReferralInput]     = useState("");
  const [photo,             setPhoto]             = useState<string | null>(null);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [formError,  setFormError]  = useState("");

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/training-locations")
      .then(r => r.json())
      .then(d => setTrainingLocations(d.locations ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // Poll for email verification while on the email-verify step
  useEffect(() => {
    if (step !== "email-verify" || emailVerified) return;

    pollRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`/api/auth/check-email-verified?email=${encodeURIComponent(email)}`);
        const data = await res.json();
        if (data.verified) {
          setEmailVerified(true);
          clearInterval(pollRef.current!);
          setTimeout(() => setStep("details"), 800);
        }
      } catch { /* ignore polling errors */ }
    }, 3000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, email]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const phone10 = phone.replace(/\D/g, "").slice(0, 10);

  const handlePhoto = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  // ── Progress bar ──────────────────────────────────────────────────────────
  const stepLabels = ["Basic Info", "Verify Email", "Details"];
  const stepIndex  = step === "basic" ? 0 : step === "email-verify" || step === "phone-otp" ? 1 : 2;
  const progress   = Math.round(((stepIndex + 1) / stepLabels.length) * 100);

  const ProgressBar = () => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        {stepLabels.map((label, i) => {
          const done   = i < stepIndex;
          const active = i === stepIndex;
          return (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: done || active ? "var(--primary)" : "var(--muted-foreground)", fontWeight: done || active ? 600 : 400 }}>
              {done
                ? <CheckCircle2 size={12} />
                : <span style={{ width: 12, height: 12, borderRadius: "50%", border: `1.5px solid ${active ? "var(--primary)" : "var(--border)"}`, display: "inline-block" }} />
              }
              {label}
            </div>
          );
        })}
      </div>
      <div style={{ height: 3, borderRadius: 99, background: "var(--border)" }}>
        <div style={{ height: "100%", borderRadius: 99, background: "var(--gradient-accent)", width: `${progress}%`, transition: "width 0.3s ease" }} />
      </div>
    </div>
  );

  const ErrorBlock = ({ msg }: { msg: string }) => <Alert variant="error">{msg}</Alert>;

  // ── Validate basic step ───────────────────────────────────────────────────
  function validateBasic(): string | null {
    if (!firstName.trim()) return "First name is required.";
    if (firstName.trim().length < 2) return "First name must be at least 2 characters.";
    if (firstName.trim().length > 50) return "First name must be 50 characters or fewer.";
    if (!/^[A-Za-z\s'\-]+$/.test(firstName.trim())) return "First name may only contain letters, spaces, hyphens and apostrophes.";
    if (!lastName.trim()) return "Last name is required.";
    if (lastName.trim().length > 50) return "Last name must be 50 characters or fewer.";
    if (!email.trim()) return "Email address is required.";
    if (!email.includes("@") || !email.includes(".")) return "Please enter a valid email address.";
    if (!phone10) return "Mobile number is required.";
    if (phone10.length !== 10 || !/^[6-9]\d{9}$/.test(phone10)) return "Please enter a valid 10-digit Indian mobile number.";
    if (password.length < 8)                return "Password must be at least 8 characters.";
    if (!/[A-Z]/.test(password))            return "Password must contain at least one uppercase letter.";
    if (!/[a-z]/.test(password))            return "Password must contain at least one lowercase letter.";
    if (!/[0-9]/.test(password))            return "Password must contain at least one number.";
    if (!/[^A-Za-z0-9]/.test(password))    return "Password must contain at least one special character.";
    if (password !== confirm)               return "Passwords do not match.";
    return null;
  }

  // ── Send email verification ───────────────────────────────────────────────
  async function sendEmailVerification(isResend = false) {
    setSending(true); if (!isResend) setFormError("");
    try {
      const res  = await fetch("/api/auth/send-email-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), name: firstName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error ?? "Failed to send verification email. Please try again.");
        return false;
      }
      if (!isResend) setStep("email-verify");
      setResendCooldown(RESEND_COOLDOWN);
      return true;
    } catch {
      setFormError("Network error. Please try again.");
      return false;
    } finally {
      setSending(false);
    }
  }

  // ── Legacy WA OTP functions (preserved behind feature flag) ───────────────
  async function sendOtp(isResend = false) {
    setSending(true); setOtpError(""); setOtpSendFailed(false);
    try {
      const res  = await fetch("/api/auth/send-phone-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone10, purpose: "register", name: firstName }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error ?? "Failed to send OTP. Please try again.";
        setOtpError(msg);
        if (!isResend) { setFormError(msg); setOtpSendFailed(true); }
        return false;
      }
      if (!isResend) setStep("phone-otp");
      setResendCooldown(RESEND_COOLDOWN);
      return true;
    } catch {
      const msg = "Network error. Please try again.";
      setOtpError(msg);
      if (!isResend) { setFormError(msg); setOtpSendFailed(true); }
      return false;
    } finally { setSending(false); }
  }

  function skipPhoneVerification() {
    setPhoneVerified(false);
    setOtpError("");
    setStep("details");
  }

  const verifyOtp = useCallback(async (code: string) => {
    if (code.length !== 6 || verifying) return;
    setVerifying(true); setOtpError("");
    try {
      const res  = await fetch("/api/auth/verify-phone-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone10, code, purpose: "register" }),
      });
      const data = await res.json();
      if (!res.ok) { setOtpError(data.error ?? "Verification failed."); return; }
      setPhoneVerified(true);
      setPhoneOtp("");
      setStep("details");
    } catch { setOtpError("Network error. Please try again."); }
    finally { setVerifying(false); }
  }, [phone10, verifying]);

  // ── Submit registration ───────────────────────────────────────────────────
  async function handleSubmit() {
    setFormError("");

    if (!dob) { setFormError("Date of Birth is required."); return; }
    const dobDate = new Date(dob + "T12:00:00");
    if (isNaN(dobDate.getTime()) || dobDate >= new Date()) { setFormError("Please enter a valid date of birth."); return; }
    const ageCutoff = new Date(); ageCutoff.setFullYear(ageCutoff.getFullYear() - 13);
    if (dobDate > ageCutoff) { setFormError("You must be at least 13 years old to register."); return; }
    if (!location)  { setFormError("Please select your training location."); return; }
    if (location === "Others" && !customLoc.trim()) { setFormError("Please enter your training location."); return; }

    setSubmitting(true);
    try {
      const finalLocation = location === "Others" ? customLoc : location;
      const storedCode   = localStorage.getItem("cs_pending_referral") ?? "";
      const referralCode = (referralInput.trim() || storedCode) || undefined;

      const res  = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName, lastName,
          email:         email.trim(),
          phone:         phone10,
          password,
          goal,
          location:      finalLocation,
          dob,
          phoneVerified: WA_OTP_ENABLED ? phoneVerified : false,
          referralCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error ?? "Registration failed."); return; }
      localStorage.removeItem("cs_pending_referral");
      localStorage.setItem("cs_pending_photo", photo ?? "");
      if (preferredLocation) {
        localStorage.setItem("cs_pending_location", preferredLocation);
      }
      router.push("/auth?tab=login&registered=true");
    } catch { setFormError("Network error. Please try again."); }
    finally { setSubmitting(false); }
  }

  // ══ STEP: basic ═══════════════════════════════════════════════════════════
  if (step === "basic") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <ProgressBar />

      <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
        Step 1 — Your details
      </p>

      {/* Name */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Input placeholder="First name" value={firstName} onChange={e => { setFirstName(e.target.value); setFormError(""); }} autoComplete="given-name" />
        <Input placeholder="Last name"  value={lastName}  onChange={e => { setLastName(e.target.value);  setFormError(""); }} autoComplete="family-name" />
      </div>

      {/* Email — required */}
      <div>
        <label style={{ display: "block", fontSize: 11, color: "var(--muted-foreground)", marginBottom: 5 }}>
          Email address <span style={{ color: "var(--primary)", fontWeight: 600 }}>*</span>
        </label>
        <Input type="email" placeholder="you@example.com" value={email} onChange={e => { setEmail(e.target.value); setFormError(""); }} autoComplete="email" />
        <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--muted-foreground)" }}>
          You&apos;ll receive a verification link at this address.
        </p>
      </div>

      {/* Phone — required contact info */}
      <div>
        <label style={{ display: "block", fontSize: 11, color: "var(--muted-foreground)", marginBottom: 5 }}>
          Mobile number <span style={{ color: "var(--primary)", fontWeight: 600 }}>*</span>
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 0, border: "1.5px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--surface)" }}>
          <span style={{ padding: "10px 10px 10px 14px", fontSize: 14, color: "var(--muted-foreground)", fontWeight: 600, background: "var(--surface)", borderRight: "1px solid var(--border)", whiteSpace: "nowrap" }}>+91</span>
          <input
            type="tel"
            inputMode="numeric"
            placeholder="9876543210"
            maxLength={10}
            value={phone10}
            onChange={e => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); setFormError(""); }}
            autoComplete="tel"
            style={{ flex: 1, padding: "10px 14px", border: "none", outline: "none", background: "transparent", fontSize: 14, color: "var(--foreground)", fontFamily: "var(--font-body)" }}
          />
        </div>
        <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--muted-foreground)" }}>
          Used for event updates, emergency communication, and future WhatsApp notifications. Verification will be enabled once WhatsApp integration is available.
        </p>
      </div>

      {/* Password */}
      <PasswordInput placeholder="Password (min 8 chars, 1 uppercase, 1 number)"
        value={password} onChange={e => { setPassword(e.target.value); setFormError(""); }} autoComplete="new-password" />
      <PasswordInput placeholder="Confirm password"
        value={confirm}  onChange={e => { setConfirm(e.target.value);  setFormError(""); }} autoComplete="new-password" />

      {formError && <ErrorBlock msg={formError} />}

      <button
        type="button"
        onClick={async () => {
          setFormError(""); setOtpSendFailed(false);
          const err = validateBasic();
          if (err) { setFormError(err); return; }
          if (WA_OTP_ENABLED) {
            await sendOtp();
          } else {
            await sendEmailVerification();
          }
        }}
        disabled={sending}
        style={{ width: "100%", padding: "13px", borderRadius: 999, background: "var(--gradient-accent)", color: "var(--accent-foreground)", border: "none", cursor: sending ? "not-allowed" : "pointer", fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "0.95rem", boxShadow: "var(--shadow-orange)" }}
      >
        {sending ? "Sending…" : "Verify Email Address →"}
      </button>

      {/* Legacy WA fallback — only shown when WA_OTP_ENABLED */}
      {WA_OTP_ENABLED && otpSendFailed && (
        <p style={{ fontSize: 11, textAlign: "center", color: "var(--muted-foreground)", margin: 0 }}>
          WhatsApp OTP unavailable.{" "}
          <button type="button" onClick={skipPhoneVerification}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary)", fontSize: 11, fontFamily: "var(--font-body)", textDecoration: "underline" }}>
            Continue without verification →
          </button>
        </p>
      )}

      <p style={{ fontSize: 11, textAlign: "center", color: "var(--muted-foreground)", margin: 0 }}>
        Already have an account?{" "}
        <button type="button" onClick={onSwitchToLogin} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary)", fontSize: 11, fontFamily: "var(--font-body)", textDecoration: "underline" }}>
          Sign in
        </button>
      </p>
    </div>
  );

  // ══ STEP: email-verify ════════════════════════════════════════════════════
  if (step === "email-verify") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <ProgressBar />

      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 8, display: "flex", justifyContent: "center" }}>
          {emailVerified
            ? <CheckCircle2 size={40} color="var(--primary)" />
            : <Mail size={40} color="var(--primary)" />
          }
        </div>
        <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>
          {emailVerified ? "Email Verified!" : "Check your inbox"}
        </p>
        <p style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.6 }}>
          {emailVerified
            ? "Email verified. Continuing to next step…"
            : (
              <>
                We sent a verification link to{" "}
                <strong style={{ color: "var(--foreground)" }}>{maskEmail(email)}</strong>.
                {" "}Click the button in the email to verify.
              </>
            )
          }
        </p>
      </div>

      {!emailVerified && (
        <>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px", fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.7 }}>
            <strong style={{ color: "var(--foreground)" }}>Didn&apos;t receive it?</strong> Check your spam folder.
            The link expires in 24 hours.
          </div>

          {formError && <ErrorBlock msg={formError} />}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
            <button type="button" onClick={() => { setStep("basic"); setFormError(""); }}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--muted-foreground)", fontFamily: "var(--font-body)" }}>
              ← Change email
            </button>
            <button
              type="button"
              onClick={() => sendEmailVerification(true)}
              disabled={sending || resendCooldown > 0}
              style={{ background: "none", border: "none", cursor: resendCooldown > 0 || sending ? "not-allowed" : "pointer", fontSize: 12, color: resendCooldown > 0 ? "var(--muted-foreground)" : "var(--primary)", fontFamily: "var(--font-body)", textDecoration: resendCooldown > 0 ? "none" : "underline" }}
            >
              {sending ? "Sending…" : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend email"}
            </button>
          </div>

          <p style={{ margin: 0, fontSize: 11, color: "var(--muted-foreground)", textAlign: "center" }}>
            Waiting for you to click the verification link…
          </p>
        </>
      )}
    </div>
  );

  // ══ STEP: phone-otp (legacy — only reached when WA_OTP_ENABLED=true) ══════
  if (step === "phone-otp") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <ProgressBar />

      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📱</div>
        <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>
          Verify your WhatsApp number
        </p>
        <p style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.6 }}>
          We sent a 6-digit code to{" "}
          <strong style={{ color: "var(--foreground)", fontFamily: "monospace" }}>
            {maskPhone(phone10)}
          </strong>
          {" "}on WhatsApp.
        </p>
      </div>

      <OtpInput
        value={phoneOtp}
        onChange={v => { setPhoneOtp(v); setOtpError(""); }}
        onComplete={verifyOtp}
        disabled={verifying}
      />

      {otpError && <ErrorBlock msg={otpError} />}

      <button
        type="button"
        onClick={() => verifyOtp(phoneOtp)}
        disabled={verifying || phoneOtp.length !== 6}
        style={{ width: "100%", padding: "13px", borderRadius: 999, background: phoneOtp.length === 6 ? "var(--gradient-accent)" : "oklch(0.72 0.19 49 / 30%)", color: "var(--accent-foreground)", border: "none", cursor: phoneOtp.length === 6 && !verifying ? "pointer" : "not-allowed", fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "0.95rem" }}
      >
        {verifying ? "Verifying…" : "Verify & Continue →"}
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
        <button type="button" onClick={() => { setStep("basic"); setPhoneOtp(""); setOtpError(""); }}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--muted-foreground)", fontFamily: "var(--font-body)" }}>
          ← Change number
        </button>
        <button
          type="button"
          onClick={() => sendOtp(true)}
          disabled={sending || resendCooldown > 0}
          style={{ background: "none", border: "none", cursor: resendCooldown > 0 || sending ? "not-allowed" : "pointer", fontSize: 12, color: resendCooldown > 0 ? "var(--muted-foreground)" : "var(--primary)", fontFamily: "var(--font-body)", textDecoration: resendCooldown > 0 ? "none" : "underline" }}
        >
          {sending ? "Sending…" : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend OTP"}
        </button>
      </div>

      <p style={{ margin: 0, fontSize: 11, color: "var(--muted-foreground)", textAlign: "center" }}>
        Code expires in 5 minutes. Check your WhatsApp.
      </p>

      <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--muted-foreground)", textAlign: "center" }}>
        Didn&apos;t receive it?{" "}
        <button type="button" onClick={skipPhoneVerification}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", fontSize: 11, fontFamily: "var(--font-body)", textDecoration: "underline" }}>
          Skip for now
        </button>
      </p>
    </div>
  );

  // ══ STEP: details ══════════════════════════════════════════════════════════
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <ProgressBar />

      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--primary)", marginBottom: 4 }}>
        <CheckCircle2 size={12} />
        <span>{email}</span>
        <span style={{ color: "var(--muted-foreground)" }}>verified</span>
      </div>

      <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
        Step 3 — Complete your profile
      </p>

      {/* Profile photo */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 4 }}>
        <button type="button" onClick={() => fileRef.current?.click()}
          style={{ position: "relative", width: 64, height: 64, borderRadius: "50%", overflow: "hidden", border: "2px dashed oklch(0.72 0.19 49 / 50%)", background: "oklch(0.72 0.19 49 / 8%)", cursor: "pointer", marginBottom: 4 }}>
          {photo
            ? <Image src={photo} alt="Profile" fill className="object-cover" />
            : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--primary)" }}><Camera size={20} /></div>
          }
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhoto} />
        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{photo ? "Change photo" : "Add profile photo (optional)"}</span>
      </div>

      {/* DOB */}
      <div>
        <label style={{ display: "block", fontSize: 11, color: "var(--muted-foreground)", marginBottom: 5 }}>
          Date of Birth <span style={{ color: "var(--primary)", fontWeight: 600 }}>*</span>
        </label>
        <Input name="dob" type="date" max={new Date().toISOString().split("T")[0]}
          value={dob} onChange={e => { setDob(e.target.value); setFormError(""); }} />
      </div>

      {/* Goal */}
      <div>
        <label style={{ display: "block", fontSize: 11, color: "var(--muted-foreground)", marginBottom: 5 }}>Running goal</label>
        <Select value={goal} onChange={e => setGoal(e.target.value)}>
          {GOALS.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
        </Select>
      </div>

      {/* Location */}
      <div>
        <label style={{ display: "block", fontSize: 11, color: "var(--muted-foreground)", marginBottom: 5 }}>Training location</label>
        <Select value={location} onChange={e => setLocation(e.target.value)}>
          <option value="">Select a location</option>
          {["Kondapur", "Kukatpally", "Kokapet", "Miyapur", "Others"].map(loc => (
            <option key={loc} value={loc}>{loc}</option>
          ))}
        </Select>
        {location === "Others" && (
          <Input type="text" placeholder="Enter your training location" value={customLoc}
            onChange={e => setCustomLoc(e.target.value)} style={{ marginTop: 8 }} />
        )}
      </div>

      {/* Preferred Training Location */}
      {trainingLocations.length > 0 && (
        <div>
          <label style={{ display: "block", fontSize: 11, color: "var(--muted-foreground)", marginBottom: 5 }}>
            Preferred Training Location <span style={{ color: "var(--primary)", fontWeight: 600 }}>*</span>
          </label>
          <Select value={preferredLocation} onChange={e => setPreferredLocation(e.target.value)}>
            <option value="">Select your training location</option>
            {trainingLocations.map(loc => (
              <option key={loc.id} value={loc.id}>
                {loc.name}{loc.meeting_point ? ` — ${loc.meeting_point}` : ""}
              </option>
            ))}
          </Select>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--muted-foreground)" }}>
            Used for your default leaderboard. You can attend sessions at any location.
          </p>
        </div>
      )}

      {/* Referral code */}
      <div>
        <label style={{ display: "block", fontSize: 11, color: "var(--muted-foreground)", marginBottom: 5 }}>
          Referral Code <span style={{ fontWeight: 400 }}>(optional)</span>
        </label>
        <Input
          type="text" placeholder="e.g. ZMGR2639" maxLength={8}
          value={referralInput}
          onChange={e => setReferralInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
          onFocus={() => {
            if (!referralInput) {
              const stored = localStorage.getItem("cs_pending_referral") ?? "";
              if (stored) setReferralInput(stored.toUpperCase());
            }
          }}
          style={{ textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "monospace" }}
        />
      </div>

      <p style={{ fontSize: 11, textAlign: "center", color: "var(--muted-foreground)", lineHeight: 1.6, margin: "4px 0" }}>
        By signing up you agree to our{" "}
        <Link href="/terms"   target="_blank" style={{ color: "var(--primary)", textDecoration: "none" }}>Terms</Link>,{" "}
        <Link href="/privacy" target="_blank" style={{ color: "var(--primary)", textDecoration: "none" }}>Privacy Policy</Link> and{" "}
        <Link href="/cookies" target="_blank" style={{ color: "var(--primary)", textDecoration: "none" }}>Cookie Policy</Link>.
      </p>

      {formError && <ErrorBlock msg={formError} />}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        style={{ width: "100%", padding: "13px", borderRadius: 999, background: "var(--gradient-accent)", color: "var(--accent-foreground)", border: "none", cursor: submitting ? "not-allowed" : "pointer", fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "0.95rem", boxShadow: "var(--shadow-orange)" }}
      >
        {submitting ? "Creating account…" : "Create Account →"}
      </button>
    </div>
  );
}
