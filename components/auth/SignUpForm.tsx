"use client";

import { useState, useRef, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff, Camera, CheckCircle2 } from "lucide-react";
import OtpInput from "./OtpInput";

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

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "11px 14px",
  background: "var(--surface)", border: "1px solid var(--border)",
  borderRadius: 10, color: "var(--foreground)",
  fontFamily: "var(--font-body)", fontSize: 14, outline: "none",
  transition: "border-color 0.15s, box-shadow 0.15s", boxSizing: "border-box",
};

const focusHandlers = {
  onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = "var(--primary)";
    e.currentTarget.style.boxShadow   = "0 0 0 3px oklch(0.72 0.19 49 / 15%)";
  },
  onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = "var(--border)";
    e.currentTarget.style.boxShadow   = "none";
  },
};

// email → email-otp → details → done (account created)
// When NEXT_PUBLIC_ENABLE_SIGNUP_OTP_VERIFICATION=false the email-otp step is skipped.
type Step = "email" | "email-otp" | "details";

const OTP_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_SIGNUP_OTP_VERIFICATION !== "false";

interface Props { onSwitchToLogin: () => void; }

export default function SignUpForm({ onSwitchToLogin }: Props) {
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step,       setStep]       = useState<Step>("email");
  const [email,      setEmail]      = useState("");
  const [emailOtp,   setEmailOtp]   = useState("");
  const [phone,      setPhone]      = useState("");
  const [sending,    setSending]    = useState(false);
  const [verifying,  setVerifying]  = useState(false);
  const [otpError,   setOtpError]   = useState("");

  const [form, setForm]             = useState({ firstName: "", lastName: "", dob: "", password: "", confirm: "" });
  const [referralInput, setReferralInput] = useState("");
  const [goal,       setGoal]       = useState("5k");
  const [location,   setLocation]   = useState("");
  const [customLoc,  setCustomLoc]  = useState("");
  const [photo,      setPhoto]      = useState<string | null>(null);
  const [showPw,     setShowPw]     = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError,  setFormError]  = useState("");

  const handleFormChange = (e: ChangeEvent<HTMLInputElement>) => {
    setForm(p => ({ ...p, [e.target.name]: e.target.value }));
    setFormError("");
  };
  const handlePhoto = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  // ── Progress (2 visible steps: Email, Details) ───────────────────────────
  const stepIndex = step === "email" || step === "email-otp" ? 0 : 1;
  const progress  = Math.round(((stepIndex + 1) / 2) * 100);

  // ── Send OTP ──────────────────────────────────────────────────────────────
  async function sendOtp(type: "email" | "phone", value: string, purpose: string, isResend = false) {
    setSending(true); setOtpError("");
    try {
      const res  = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, value, purpose }),
      });
      const data = await res.json();
      if (!res.ok) { setOtpError(data.error ?? "Failed to send OTP."); return false; }
      if (!isResend && type === "email") setStep("email-otp");
      return true;
    } catch { setOtpError("Network error. Please try again."); return false; }
    finally { setSending(false); }
  }

  // ── Verify OTP ────────────────────────────────────────────────────────────
  async function verifyOtp(type: "email" | "phone", value: string, code: string) {
    setVerifying(true); setOtpError("");
    try {
      const res  = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, value, code }),
      });
      const data = await res.json();
      if (!res.ok) { setOtpError(data.error ?? "Verification failed."); return false; }
      return true;
    } catch { setOtpError("Network error. Please try again."); return false; }
    finally { setVerifying(false); }
  }

  // ── Submit registration ───────────────────────────────────────────────────
  async function handleSubmit() {
    setSubmitting(true);
    try {
      const finalLocation = location === "Others" ? customLoc : location;
      // Manual input takes priority over localStorage (covers direct code sharing via WhatsApp/SMS)
      const storedCode   = localStorage.getItem("cs_pending_referral") ?? "";
      const referralCode = (referralInput.trim() || storedCode) || undefined;
      const res  = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName, lastName: form.lastName,
          email, phone, password: form.password,
          goal, location: finalLocation, dob: form.dob,
          phoneVerified: false,
          referralCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error ?? "Registration failed."); return; }
      localStorage.removeItem("cs_pending_referral");
      localStorage.setItem("cs_pending_photo", photo ?? "");
      router.push("/auth?tab=login&registered=true");
    } catch { setFormError("Network error. Please try again."); }
    finally { setSubmitting(false); }
  }

  // ── Validate details before submitting ───────────────────────────────────
  function validateDetails(): boolean {
    if (!form.firstName || !form.lastName) { setFormError("Please enter your full name."); return false; }
    if (form.password.length < 8)          { setFormError("Password must be at least 8 characters."); return false; }
    if (form.password !== form.confirm)    { setFormError("Passwords do not match."); return false; }
    if (!location)                         { setFormError("Please select your training location."); return false; }
    if (location === "Others" && !customLoc.trim()) { setFormError("Please enter your training location."); return false; }
    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits.length !== 10)         { setFormError("Please enter a valid 10-digit mobile number."); return false; }

    // DOB — mandatory, must be a past date, user must be ≥ 13 years old
    if (!form.dob) { setFormError("Date of Birth is required."); return false; }
    const dob = new Date(form.dob + "T12:00:00");
    if (isNaN(dob.getTime()))              { setFormError("Please enter a valid date of birth."); return false; }
    if (dob >= new Date())                 { setFormError("Date of birth cannot be in the future."); return false; }
    const ageCutoff = new Date();
    ageCutoff.setFullYear(ageCutoff.getFullYear() - 13);
    if (dob > ageCutoff)                   { setFormError("You must be at least 13 years old to register."); return false; }

    return true;
  }

  // ── Error block ───────────────────────────────────────────────────────────
  const ErrorBlock = ({ msg }: { msg: string }) => (
    <div style={{ background: "oklch(0.62 0.22 22 / 10%)", border: "1px solid oklch(0.62 0.22 22 / 30%)", borderRadius: 8, padding: "10px 14px", fontSize: "0.8rem", color: "#f09595", textAlign: "center" }}>
      {msg}
    </div>
  );

  // ── Progress bar ──────────────────────────────────────────────────────────
  const ProgressBar = () => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        {["Email", "Details"].map((label, i) => {
          const done   = i < stepIndex;
          const active = i === stepIndex;
          return (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: done || active ? "var(--primary)" : "var(--muted-foreground)", fontWeight: done || active ? 600 : 400 }}>
              {done ? <CheckCircle2 size={13} /> : <span style={{ width: 13, height: 13, borderRadius: "50%", border: `1.5px solid ${active ? "var(--primary)" : "var(--border)"}`, display: "inline-block" }} />}
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

  // ══ STEP: email ══════════════════════════════════════════════════════════
  if (step === "email") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <ProgressBar />
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
        Step 1 — {OTP_ENABLED ? "Verify your email" : "Enter your email"}
      </p>
      <input
        style={inputStyle} type="email" placeholder="Email address"
        value={email} onChange={e => { setEmail(e.target.value); setOtpError(""); }}
        autoComplete="email" {...focusHandlers}
      />
      {otpError && <ErrorBlock msg={otpError} />}
      {OTP_ENABLED ? (
        <button
          type="button" onClick={() => sendOtp("email", email, "register")}
          disabled={sending || !email.includes("@")}
          style={{ width: "100%", padding: "13px", borderRadius: 999, background: email.includes("@") ? "var(--gradient-accent)" : "oklch(0.72 0.19 49 / 30%)", color: "var(--accent-foreground)", border: "none", cursor: email.includes("@") ? "pointer" : "not-allowed", fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "0.95rem", boxShadow: email.includes("@") ? "var(--shadow-orange)" : "none" }}
        >
          {sending ? "Sending…" : "Send OTP to Email →"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            console.log("[signup] OTP verification bypassed (NEXT_PUBLIC_ENABLE_SIGNUP_OTP_VERIFICATION=false) for:", email);
            setStep("details");
          }}
          disabled={!email.includes("@")}
          style={{ width: "100%", padding: "13px", borderRadius: 999, background: email.includes("@") ? "var(--gradient-accent)" : "oklch(0.72 0.19 49 / 30%)", color: "var(--accent-foreground)", border: "none", cursor: email.includes("@") ? "pointer" : "not-allowed", fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "0.95rem", boxShadow: email.includes("@") ? "var(--shadow-orange)" : "none" }}
        >
          Continue →
        </button>
      )}
    </div>
  );

  // ══ STEP: email-otp ══════════════════════════════════════════════════════
  if (step === "email-otp") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <ProgressBar />
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>Step 1 — Verify your email</p>
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.6 }}>OTP sent to {email}. Check your inbox.</p>
      <OtpInput value={emailOtp} onChange={v => { setEmailOtp(v); setOtpError(""); }} />
      {otpError && <ErrorBlock msg={otpError} />}
      <button type="button"
        onClick={async () => { const ok = await verifyOtp("email", email, emailOtp); if (ok) { setEmailOtp(""); setStep("details"); } }}
        disabled={verifying || emailOtp.length !== 6}
        style={{ width: "100%", padding: "13px", borderRadius: 999, background: emailOtp.length === 6 ? "var(--gradient-accent)" : "oklch(0.72 0.19 49 / 30%)", color: "var(--accent-foreground)", border: "none", cursor: emailOtp.length === 6 ? "pointer" : "not-allowed", fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "0.95rem" }}>
        {verifying ? "Verifying…" : "Verify →"}
      </button>
      <button type="button" onClick={() => sendOtp("email", email, "register", true)} disabled={sending}
        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--muted-foreground)", fontFamily: "var(--font-body)", textDecoration: "underline" }}>
        {sending ? "Sending…" : "Resend OTP"}
      </button>
      <button type="button" onClick={() => { setStep("email"); setOtpError(""); }}
        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--muted-foreground)", fontFamily: "var(--font-body)" }}>
        ← Change email
      </button>
    </div>
  );

  // ══ STEP: details ════════════════════════════════════════════════════════
  if (step === "details") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <ProgressBar />

      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--primary)", marginBottom: 4 }}>
        <CheckCircle2 size={12} /> {email}
      </div>

      <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>Step 2 — Your details</p>

      {/* Photo */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 4 }}>
        <button type="button" onClick={() => fileRef.current?.click()}
          style={{ position: "relative", width: 64, height: 64, borderRadius: "50%", overflow: "hidden", border: "2px dashed oklch(0.72 0.19 49 / 50%)", background: "oklch(0.72 0.19 49 / 8%)", cursor: "pointer", marginBottom: 4 }}>
          {photo ? <Image src={photo} alt="Profile" fill className="object-cover" /> : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--primary)" }}>
              <Camera size={20} />
            </div>
          )}
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhoto} />
        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{photo ? "Change photo" : "Add profile photo (optional)"}</span>
      </div>

      {/* Name */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <input style={inputStyle} name="firstName" type="text" placeholder="First name" value={form.firstName} onChange={handleFormChange} autoComplete="given-name" {...focusHandlers} />
        <input style={inputStyle} name="lastName"  type="text" placeholder="Last name"  value={form.lastName}  onChange={handleFormChange} autoComplete="family-name" {...focusHandlers} />
      </div>

      {/* DOB */}
      <div>
        <label style={{ display: "block", fontSize: 11, color: "var(--muted-foreground)", marginBottom: 5 }}>
          Date of Birth <span style={{ color: "var(--primary)", fontWeight: 600 }}>*</span>
        </label>
        <input
          style={{ ...inputStyle, colorScheme: "dark" }}
          name="dob" type="date"
          max={new Date().toISOString().split("T")[0]}
          value={form.dob} onChange={handleFormChange} {...focusHandlers}
        />
      </div>

      {/* Password */}
      <div style={{ position: "relative" }}>
        <input style={{ ...inputStyle, paddingRight: 44 }} name="password" type={showPw ? "text" : "password"}
          placeholder="Password (min 8 chars)" value={form.password} onChange={handleFormChange} autoComplete="new-password" {...focusHandlers} />
        <button type="button" onClick={() => setShowPw(!showPw)}
          style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", display: "flex", padding: 0 }}>
          {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      <div style={{ position: "relative" }}>
        <input style={{ ...inputStyle, paddingRight: 44 }} name="confirm" type={showPw ? "text" : "password"}
          placeholder="Confirm password" value={form.confirm} onChange={handleFormChange}
          autoComplete="new-password" aria-label="Confirm password" {...focusHandlers} />
        <button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? "Hide password" : "Show password"}
          style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", display: "flex", padding: 0 }}>
          {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>

      {/* Phone — now required */}
      <div>
        <label style={{ display: "block", fontSize: 11, color: "var(--muted-foreground)", marginBottom: 5 }}>
          WhatsApp / Mobile number <span style={{ color: "var(--primary)", fontWeight: 600 }}>*</span>
        </label>
        <input style={inputStyle} type="tel" placeholder="e.g. 9876543210" maxLength={10} value={phone} onChange={e => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); setFormError(""); }} autoComplete="tel" {...focusHandlers} />
        <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--muted-foreground)" }}>
          10-digit Indian mobile number. Used for session updates.
        </p>
      </div>

      {/* Goal */}
      <div>
        <label style={{ display: "block", fontSize: 11, color: "var(--muted-foreground)", marginBottom: 5 }}>Running goal</label>
        <select value={goal} onChange={e => setGoal(e.target.value)} style={{ ...inputStyle, cursor: "pointer", colorScheme: "dark" }} onFocus={focusHandlers.onFocus as never} onBlur={focusHandlers.onBlur as never}>
          {GOALS.map(g => <option key={g.id} value={g.id} style={{ background: "#1a1a1a" }}>{g.label}</option>)}
        </select>
      </div>

      {/* Location */}
      <div>
        <label style={{ display: "block", fontSize: 11, color: "var(--muted-foreground)", marginBottom: 5 }}>Training location</label>
        <select value={location} onChange={e => setLocation(e.target.value)} style={{ ...inputStyle, cursor: "pointer", colorScheme: "dark" }} onFocus={focusHandlers.onFocus as never} onBlur={focusHandlers.onBlur as never}>
          <option value="">Select a location</option>
          {["Kondapur", "Kukatpally", "Kokapet", "Miyapur", "Others"].map(loc => <option key={loc} value={loc} style={{ background: "#1a1a1a" }}>{loc}</option>)}
        </select>
        {location === "Others" && (
          <input style={{ ...inputStyle, marginTop: 8 }} type="text" placeholder="Enter your training location" value={customLoc} onChange={e => setCustomLoc(e.target.value)} {...focusHandlers} />
        )}
      </div>

      {/* Referral code — optional, pre-filled from localStorage if available */}
      <div>
        <label style={{ display: "block", fontSize: 11, color: "var(--muted-foreground)", marginBottom: 5 }}>
          Referral Code <span style={{ color: "var(--muted-foreground)", fontWeight: 400 }}>(optional)</span>
        </label>
        <input
          style={{ ...inputStyle, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "monospace" }}
          type="text"
          placeholder="e.g. ZMGR2639"
          maxLength={8}
          value={referralInput}
          onChange={e => setReferralInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
          onFocus={(e) => {
            focusHandlers.onFocus(e);
            // Pre-fill from localStorage when user taps the field (if empty)
            if (!referralInput) {
              const stored = localStorage.getItem("cs_pending_referral") ?? "";
              if (stored) setReferralInput(stored.toUpperCase());
            }
          }}
          onBlur={focusHandlers.onBlur}
        />
        {localStorage.getItem("cs_pending_referral") && !referralInput && (
          <p style={{ margin: "4px 0 0", fontSize: 10, color: "var(--cs-orange)" }}>
            ✓ Referral code auto-detected from invite link
          </p>
        )}
      </div>

      <p style={{ fontSize: 11, textAlign: "center", color: "var(--muted-foreground)", lineHeight: 1.6 }}>
        By signing up you agree to our{" "}
        <Link href="/terms"   target="_blank" style={{ color: "var(--primary)", textDecoration: "none" }}>Terms</Link>,{" "}
        <Link href="/privacy" target="_blank" style={{ color: "var(--primary)", textDecoration: "none" }}>Privacy Policy</Link> and{" "}
        <Link href="/cookies" target="_blank" style={{ color: "var(--primary)", textDecoration: "none" }}>Cookie Policy</Link>.
      </p>

      {formError && <ErrorBlock msg={formError} />}

      <button
        type="button"
        onClick={async () => {
          setFormError("");
          if (!validateDetails()) return;
          await handleSubmit();
        }}
        disabled={submitting}
        style={{ width: "100%", padding: "13px", borderRadius: 999, background: "var(--gradient-accent)", color: "var(--accent-foreground)", border: "none", cursor: submitting ? "not-allowed" : "pointer", fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "0.95rem", boxShadow: "var(--shadow-orange)" }}
      >
        {submitting ? "Creating account…" : "Create Account →"}
      </button>
    </div>
  );

}
