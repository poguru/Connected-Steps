"use client";

import { useState, useEffect, useRef, useCallback, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Camera, CheckCircle2 } from "lucide-react";
import OtpInput from "./OtpInput";
import { Alert, Input, PasswordInput, Select } from "@/components/ui/ds";

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

const RESEND_COOLDOWN = 30; // seconds

// Step order: basic info → phone OTP → additional details → account created
type Step = "basic" | "phone-otp" | "details";

interface Props { onSwitchToLogin: () => void; }

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "+91 " + digits;
  return `+91 ${"X".repeat(digits.length - 3)}${digits.slice(-3)}`;
}

export default function SignUpForm({ onSwitchToLogin }: Props) {
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  // ── State ─────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("basic");

  // Basic step fields
  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [phone,     setPhone]     = useState("");
  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");
  const [email,     setEmail]     = useState("");  // optional

  // Phone OTP step
  const [phoneOtp,    setPhoneOtp]    = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [sending,     setSending]     = useState(false);
  const [verifying,   setVerifying]   = useState(false);
  const [otpError,    setOtpError]    = useState("");
  const [otpSendFailed, setOtpSendFailed] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

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

  // Countdown timer for resend button
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const phone10 = phone.replace(/\D/g, "").slice(0, 10);

  const handlePhoto = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  // ── Progress bar (3 steps) ────────────────────────────────────────────────
  const stepLabels = ["Basic Info", "Verify Phone", "Details"];
  const stepIndex  = step === "basic" ? 0 : step === "phone-otp" ? 1 : 2;
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
    if (!firstName.trim() || !lastName.trim()) return "Please enter your full name.";
    if (phone10.length !== 10 || !/^[6-9]\d{9}$/.test(phone10)) return "Please enter a valid 10-digit Indian mobile number.";
    if (password.length < 8)         return "Password must be at least 8 characters.";
    if (!/[A-Z]/.test(password))     return "Password must contain at least one uppercase letter.";
    if (!/[0-9]/.test(password))     return "Password must contain at least one number.";
    if (password !== confirm)        return "Passwords do not match.";
    if (email && !email.includes("@")) return "Please enter a valid email address.";
    return null;
  }

  // ── Send phone OTP ────────────────────────────────────────────────────────
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
    }
    finally { setSending(false); }
  }

  // ── Skip phone verification ───────────────────────────────────────────────
  function skipPhoneVerification() {
    setPhoneVerified(false);
    setOtpError("");
    setStep("details");
  }

  // ── Verify phone OTP ──────────────────────────────────────────────────────
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
          email:         email.trim() || undefined,
          phone:         phone10,
          password,
          goal,
          location:      finalLocation,
          dob,
          phoneVerified: phoneVerified,
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

      {/* Phone (primary identity) */}
      <div>
        <label style={{ display: "block", fontSize: 11, color: "var(--muted-foreground)", marginBottom: 5 }}>
          WhatsApp / Mobile number <span style={{ color: "var(--primary)", fontWeight: 600 }}>*</span>
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
          You'll receive a WhatsApp OTP to verify this number.
        </p>
      </div>

      {/* Password */}
      <PasswordInput placeholder="Password (min 8 chars, 1 uppercase, 1 number)"
        value={password} onChange={e => { setPassword(e.target.value); setFormError(""); }} autoComplete="new-password" />
      <PasswordInput placeholder="Confirm password"
        value={confirm}  onChange={e => { setConfirm(e.target.value);  setFormError(""); }} autoComplete="new-password" />

      {/* Email — optional */}
      <div>
        <label style={{ display: "block", fontSize: 11, color: "var(--muted-foreground)", marginBottom: 5 }}>
          Email address <span style={{ color: "var(--muted-foreground)", fontWeight: 400 }}>(optional)</span>
        </label>
        <Input type="email" placeholder="you@example.com" value={email} onChange={e => { setEmail(e.target.value); setFormError(""); }} autoComplete="email" />
        <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--muted-foreground)" }}>
          Used for weekly digests and membership invoices.
        </p>
      </div>

      {formError && <ErrorBlock msg={formError} />}

      <button
        type="button"
        onClick={async () => {
          setFormError(""); setOtpSendFailed(false);
          const err = validateBasic();
          if (err) { setFormError(err); return; }
          await sendOtp();
        }}
        disabled={sending}
        style={{ width: "100%", padding: "13px", borderRadius: 999, background: "var(--gradient-accent)", color: "var(--accent-foreground)", border: "none", cursor: sending ? "not-allowed" : "pointer", fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "0.95rem", boxShadow: "var(--shadow-orange)" }}
      >
        {sending ? "Sending OTP…" : "Verify WhatsApp Number →"}
      </button>

      {otpSendFailed && (
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

  // ══ STEP: phone-otp ═══════════════════════════════════════════════════════
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
        <span style={{ fontFamily: "monospace" }}>{maskPhone(phone10)}</span>
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
