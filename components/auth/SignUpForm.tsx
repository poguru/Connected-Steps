"use client";

import { useState, useRef, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

const GOALS = [
  { id: "5k",   label: "First 5K"      },
  { id: "10k",  label: "10K"           },
  { id: "half", label: "Half Marathon" },
  { id: "full", label: "Full Marathon" },
];

interface Props {
  onSwitchToLogin: () => void;
}

// ─── OTP Input ───────────────────────────────────────────────────────────────
function OtpInput({
  value, onChange, disabled,
}: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      maxLength={6}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      placeholder="——————"
      style={{
        width: "100%", padding: "14px", textAlign: "center",
        fontSize: "1.5rem", fontWeight: 700, letterSpacing: "0.4em",
        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: "8px", color: "var(--cs-white)", fontFamily: "monospace",
        outline: "none", boxSizing: "border-box",
        opacity: disabled ? 0.5 : 1,
      }}
    />
  );
}

// ─── Resend Timer ─────────────────────────────────────────────────────────────
function ResendButton({ onResend, disabled }: { onResend: () => void; disabled: boolean }) {
  const [countdown, setCountdown] = useState(0);

  function handleResend() {
    onResend();
    setCountdown(30);
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(t); return 0; }
        return c - 1;
      });
    }, 1000);
  }

  return (
    <button
      type="button"
      onClick={handleResend}
      disabled={disabled || countdown > 0}
      style={{
        fontSize: "12px", color: countdown > 0 ? "var(--cs-muted)" : "var(--cs-orange)",
        background: "none", border: "none", cursor: countdown > 0 ? "default" : "pointer",
        fontFamily: "var(--font-body)", padding: 0,
      }}
    >
      {countdown > 0 ? `Resend in ${countdown}s` : "Resend OTP"}
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SignUpForm({ onSwitchToLogin }: Props) {
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  // Step: "form" | "otp"
  const [step, setStep] = useState<"form" | "otp">("form");

  const [form, setForm] = useState({
    firstName: "",
    lastName:  "",
    email:     "",
    phone:     "",
    dob:       "",
    password:  "",
    confirm:   "",
  });
  const [goal,      setGoal]      = useState("5k");
  const [location,  setLocation]  = useState("");
  const [customLoc, setCustomLoc] = useState("");
  const [photo,     setPhoto]     = useState<string | null>(null);
  const [showPw,    setShowPw]    = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");

  // OTP state
  const [emailOtp,      setEmailOtp]      = useState("");
  const [mobileOtp,     setMobileOtp]     = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [mobileVerified,setMobileVerified]= useState(false);
  const [otpError,      setOtpError]      = useState("");
  const [verifying,     setVerifying]     = useState<"email" | "mobile" | null>(null);
  const [submitting,    setSubmitting]    = useState(false);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
    setError("");
  };

  const handlePhoto = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  const validate = () => {
    if (!form.firstName || !form.lastName)  return "Please enter your full name.";
    if (!form.email)                        return "Please enter your email.";
    if (!form.phone)                        return "Please enter your phone number.";
    if (!/^\d{10}$/.test(form.phone.replace(/\D/g, ""))) return "Please enter a valid 10-digit phone number.";
    if (!form.dob)                          return "Please enter your date of birth.";
    if (form.password.length < 8)           return "Password must be at least 8 characters.";
    if (form.password !== form.confirm)     return "Passwords do not match.";
    if (!goal)                              return "Please select your running goal.";
    if (!location)                          return "Please select your preferred training location.";
    if (location === "Others" && !customLoc.trim()) return "Please enter your training location.";
    return null;
  };

  // Step 1: Send OTPs to both email and mobile
  async function handleSendOtps(e: { preventDefault(): void }) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setLoading(true); setError("");
    try {
      const firstName = form.firstName;
      const [emailRes, mobileRes] = await Promise.all([
        fetch("/api/auth/send-otp", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "email", value: form.email, name: firstName }),
        }),
        fetch("/api/auth/send-otp", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "mobile", value: form.phone, name: firstName }),
        }),
      ]);
      const emailData  = await emailRes.json();
      const mobileData = await mobileRes.json();
      if (!emailRes.ok)  { setError(emailData.error ?? "Failed to send email OTP."); return; }
      if (!mobileRes.ok) { setError(mobileData.error ?? "Failed to send mobile OTP."); return; }
      setStep("otp");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Resend a single OTP
  async function resendOtp(type: "email" | "mobile") {
    const value = type === "email" ? form.email : form.phone;
    await fetch("/api/auth/send-otp", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, value, name: form.firstName }),
    });
    if (type === "email")  { setEmailOtp(""); setEmailVerified(false); }
    if (type === "mobile") { setMobileOtp(""); setMobileVerified(false); }
  }

  // Verify a single OTP
  async function verifyOtp(type: "email" | "mobile") {
    const code  = type === "email" ? emailOtp : mobileOtp;
    const value = type === "email" ? form.email : form.phone;
    if (code.length !== 6) { setOtpError("Please enter the full 6-digit OTP."); return; }
    setVerifying(type); setOtpError("");
    try {
      const res  = await fetch("/api/auth/verify-otp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, value, code }),
      });
      const data = await res.json();
      if (!res.ok) { setOtpError(data.error ?? "Verification failed."); return; }
      if (type === "email")  setEmailVerified(true);
      if (type === "mobile") setMobileVerified(true);
    } catch {
      setOtpError("Network error. Please try again.");
    } finally {
      setVerifying(null);
    }
  }

  // Step 2: Both verified → create account
  async function handleCreateAccount() {
    if (!emailVerified || !mobileVerified) {
      setOtpError("Please verify both email and mobile OTPs before continuing.");
      return;
    }
    setSubmitting(true); setOtpError("");
    try {
      const finalLocation = location === "Others" ? customLoc : location;
      const res  = await fetch("/api/auth/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName:  form.lastName,
          email:     form.email,
          phone:     form.phone,
          password:  form.password,
          goal,
          location:  finalLocation,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setOtpError(data.error ?? "Registration failed."); return; }
      localStorage.setItem("cs_pending_photo", photo ?? "");
      router.push("/auth?tab=login&registered=true");
    } catch {
      setOtpError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ─── OTP Step UI ──────────────────────────────────────────────────────────
  if (step === "otp") {
    return (
      <div>
        {/* Back */}
        <button
          type="button"
          onClick={() => { setStep("form"); setEmailVerified(false); setMobileVerified(false); setOtpError(""); }}
          style={{ background: "none", border: "none", color: "var(--cs-muted)", fontSize: "12px", cursor: "pointer", fontFamily: "var(--font-body)", padding: 0, marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "4px" }}
        >
          ← Back to form
        </button>

        <div style={{ marginBottom: "1.75rem" }}>
          <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--cs-white)", marginBottom: "0.25rem" }}>Verify your identity</div>
          <div style={{ fontSize: "12px", color: "var(--cs-muted)", lineHeight: 1.6 }}>
            We sent a 6-digit code to <strong style={{ color: "var(--cs-white)" }}>{form.email}</strong> and your mobile number.
          </div>
        </div>

        {/* Email OTP */}
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <label style={{ fontSize: "12px", color: "var(--cs-muted)", letterSpacing: "0.04em" }}>
              ✉️ Email OTP
              {emailVerified && <span style={{ color: "#4ade80", marginLeft: "8px", fontWeight: 600 }}>✓ Verified</span>}
            </label>
            <ResendButton onResend={() => resendOtp("email")} disabled={emailVerified} />
          </div>
          <OtpInput value={emailOtp} onChange={setEmailOtp} disabled={emailVerified} />
          {!emailVerified && (
            <button
              type="button"
              onClick={() => verifyOtp("email")}
              disabled={verifying === "email" || emailOtp.length !== 6}
              style={{
                marginTop: "8px", width: "100%", padding: "10px",
                background: emailOtp.length === 6 ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${emailOtp.length === 6 ? "rgba(74,222,128,0.4)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: "6px", color: emailOtp.length === 6 ? "#4ade80" : "var(--cs-muted)",
                fontSize: "13px", fontWeight: 600, cursor: emailOtp.length === 6 ? "pointer" : "default",
                fontFamily: "var(--font-body)", transition: "all 0.15s",
              }}
            >
              {verifying === "email" ? "Verifying…" : "Verify Email OTP"}
            </button>
          )}
        </div>

        {/* Mobile OTP */}
        <div style={{ marginBottom: "1.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <label style={{ fontSize: "12px", color: "var(--cs-muted)", letterSpacing: "0.04em" }}>
              📱 Mobile OTP
              {mobileVerified && <span style={{ color: "#4ade80", marginLeft: "8px", fontWeight: 600 }}>✓ Verified</span>}
            </label>
            <ResendButton onResend={() => resendOtp("mobile")} disabled={mobileVerified} />
          </div>
          <OtpInput value={mobileOtp} onChange={setMobileOtp} disabled={mobileVerified} />
          {!mobileVerified && (
            <button
              type="button"
              onClick={() => verifyOtp("mobile")}
              disabled={verifying === "mobile" || mobileOtp.length !== 6}
              style={{
                marginTop: "8px", width: "100%", padding: "10px",
                background: mobileOtp.length === 6 ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${mobileOtp.length === 6 ? "rgba(74,222,128,0.4)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: "6px", color: mobileOtp.length === 6 ? "#4ade80" : "var(--cs-muted)",
                fontSize: "13px", fontWeight: 600, cursor: mobileOtp.length === 6 ? "pointer" : "default",
                fontFamily: "var(--font-body)", transition: "all 0.15s",
              }}
            >
              {verifying === "mobile" ? "Verifying…" : "Verify Mobile OTP"}
            </button>
          )}
        </div>

        {otpError && (
          <div style={{ background: "rgba(226,75,74,0.1)", border: "1px solid rgba(226,75,74,0.3)", borderRadius: "6px", padding: "10px 14px", fontSize: "12px", color: "#f09595", marginBottom: "1rem", textAlign: "center" }}>
            {otpError}
          </div>
        )}

        {/* Progress indicator */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}>
          {[
            { label: "Email", done: emailVerified },
            { label: "Mobile", done: mobileVerified },
          ].map(({ label, done }) => (
            <div key={label} style={{ flex: 1, padding: "8px", borderRadius: "6px", textAlign: "center", background: done ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.04)", border: `1px solid ${done ? "rgba(74,222,128,0.3)" : "rgba(255,255,255,0.07)"}`, fontSize: "12px", color: done ? "#4ade80" : "var(--cs-muted)", fontWeight: done ? 600 : 400, transition: "all 0.2s" }}>
              {done ? `✓ ${label}` : label}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleCreateAccount}
          disabled={!emailVerified || !mobileVerified || submitting}
          style={{
            width: "100%", padding: "13px",
            background: emailVerified && mobileVerified ? "var(--cs-orange)" : "rgba(232,98,10,0.3)",
            color: emailVerified && mobileVerified ? "#000" : "rgba(255,255,255,0.3)",
            border: "none", borderRadius: "4px", fontSize: "14px", fontWeight: 700,
            cursor: emailVerified && mobileVerified && !submitting ? "pointer" : "not-allowed",
            fontFamily: "var(--font-body)", transition: "all 0.2s",
          }}
        >
          {submitting ? "Creating account…" : "Create Account →"}
        </button>
      </div>
    );
  }

  // ─── Form Step UI ─────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSendOtps} noValidate>

      {/* Profile photo */}
      <div className="flex flex-col items-center mb-6">
        <button type="button" onClick={() => fileRef.current?.click()}
          className="relative w-20 h-20 rounded-full overflow-hidden mb-2"
          style={{ background: "rgba(232,98,10,0.1)", border: "2px dashed rgba(232,98,10,0.4)" }}>
          {photo ? (
            <Image src={photo} alt="Profile" fill className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ color: "var(--cs-orange)" }}>
                <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M4 20c0-4 3.58-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
          )}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
        <button type="button" onClick={() => fileRef.current?.click()}
          className="text-xs font-medium"
          style={{ color: "var(--cs-orange)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)" }}>
          {photo ? "Change photo" : "Add profile photo"}
        </button>
        <span className="text-xs mt-0.5" style={{ color: "var(--cs-muted)" }}>Profile photo (optional)</span>
      </div>

      {/* Full name */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
        <input className="auth-input" name="firstName" type="text" placeholder="First name" value={form.firstName} onChange={handleChange} autoComplete="given-name" />
        <input className="auth-input" name="lastName"  type="text" placeholder="Last name"  value={form.lastName}  onChange={handleChange} autoComplete="family-name" />
      </div>

      {/* Email */}
      <div className="mb-3">
        <input className="auth-input" name="email" type="email" placeholder="Email address" value={form.email} onChange={handleChange} autoComplete="email" />
      </div>

      {/* Phone */}
      <div className="mb-3">
        <input className="auth-input" name="phone" type="tel" placeholder="Mobile number (10 digits)" value={form.phone} onChange={handleChange} autoComplete="tel" />
      </div>

      {/* DOB */}
      <div className="mb-3">
        <label htmlFor="dob" style={{ display: "block", fontSize: "12px", color: "var(--cs-muted)", marginBottom: "6px", letterSpacing: "0.04em" }}>Date of Birth</label>
        <input id="dob" className="auth-input" name="dob" type="date" value={form.dob} onChange={handleChange} style={{ colorScheme: "dark" }} />
      </div>

      {/* Password */}
      <div style={{ marginBottom: "0.5rem" }}>
        <div className="auth-input" style={{ padding: 0, display: "flex", alignItems: "center" }}>
          <input name="password" type={showPw ? "text" : "password"} placeholder="Password" value={form.password} onChange={handleChange} autoComplete="new-password"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", padding: "11px 14px", color: "var(--cs-white)", fontFamily: "var(--font-body)", fontSize: "14px" }} />
          <button type="button" onClick={() => setShowPw(!showPw)}
            style={{ color: "var(--cs-muted)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 500, padding: "0 14px 0 0", whiteSpace: "nowrap" }}>
            {showPw ? "Hide" : "Show"}
          </button>
        </div>
        <p style={{ fontSize: "11px", color: "var(--cs-muted)", marginTop: "4px", paddingLeft: "2px" }}>Min. 8 characters</p>
      </div>

      {/* Confirm password */}
      <div className="mb-3">
        <input className="auth-input" name="confirm" type={showPw ? "text" : "password"} placeholder="Confirm password" value={form.confirm} onChange={handleChange} autoComplete="new-password" />
      </div>

      {/* Running goal */}
      <div className="mb-3">
        <label style={{ display: "block", fontSize: "11px", color: "var(--cs-muted)", marginBottom: "6px", fontFamily: "var(--font-body)", letterSpacing: "0.05em" }}>Running goal</label>
        <select value={goal} onChange={(e) => setGoal(e.target.value)} className="auth-input" style={{ cursor: "pointer", colorScheme: "dark" }}>
          {GOALS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
      </div>

      {/* Location */}
      <div className="mb-5">
        <label style={{ display: "block", fontSize: "11px", color: "var(--cs-muted)", marginBottom: "6px", fontFamily: "var(--font-body)", letterSpacing: "0.05em" }}>Preferred training location</label>
        <select value={location} onChange={(e) => setLocation(e.target.value)} className="auth-input" style={{ cursor: "pointer", colorScheme: "dark" }}>
          <option value="">Select a location</option>
          {["Kondapur", "Kukatpally", "Kokapet", "Miyapur", "Others"].map((loc) => (
            <option key={loc} value={loc}>{loc}</option>
          ))}
        </select>
        {location === "Others" && (
          <input className="auth-input" type="text" placeholder="Enter your training location" value={customLoc} onChange={(e) => setCustomLoc(e.target.value)} style={{ marginTop: "8px" }} />
        )}
      </div>

      {/* Terms */}
      <p className="text-xs text-center mb-4 leading-relaxed" style={{ color: "var(--cs-muted)" }}>
        By signing up, you agree to our <span style={{ color: "var(--cs-white)" }}>Terms</span>,{" "}
        <span style={{ color: "var(--cs-white)" }}>Privacy Policy</span> and{" "}
        <span style={{ color: "var(--cs-white)" }}>Cookie Policy</span>.
      </p>

      {error && (
        <div className="text-xs px-3 py-2 rounded mb-4 text-center"
          style={{ background: "rgba(226,75,74,0.1)", border: "1px solid rgba(226,75,74,0.3)", color: "#f09595" }}>
          {error}
        </div>
      )}

      <button type="submit" disabled={loading}
        className="w-full py-3 rounded font-medium text-sm tracking-wide"
        style={{
          background: loading ? "rgba(232,98,10,0.6)" : "var(--cs-orange)",
          color: "var(--cs-black)", border: "none",
          cursor: loading ? "not-allowed" : "pointer",
          fontFamily: "var(--font-body)", borderRadius: "4px",
        }}>
        {loading ? "Sending OTPs…" : "Send OTP & Continue →"}
      </button>

      <p className="text-xs text-center mt-4" style={{ color: "var(--cs-muted)" }}>
        Already have an account?{" "}
        <button type="button" onClick={onSwitchToLogin}
          style={{ color: "var(--cs-orange)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: "inherit", fontWeight: 600 }}>
          Log in
        </button>
      </p>
    </form>
  );
}
