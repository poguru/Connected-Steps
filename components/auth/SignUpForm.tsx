"use client";

import { useState, useRef, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

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

interface Props {
  onSwitchToLogin: () => void;
}

export default function SignUpForm({ onSwitchToLogin }: Props) {
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    firstName: "",
    lastName:  "",
    email:     "",
    phone:     "",
    dob:       "",
    password:  "",
    confirm:   "",
  });
  const [goal,        setGoal]        = useState("5k");
  const [location,    setLocation]    = useState("");
  const [customLoc,   setCustomLoc]   = useState("");
  const [photo,       setPhoto]       = useState<string | null>(null);
  const [showPw,      setShowPw]      = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");

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
    if (form.password.length < 8)           return "Password must be at least 8 characters.";
    if (!form.confirm)                      return "Please confirm your password.";
    if (form.password !== form.confirm)     return "Passwords do not match.";
    if (!form.dob)                          return "Please enter your date of birth.";
    if (!goal)                              return "Please select your running goal.";
    if (!location)                          return "Please select your preferred training location.";
    if (location === "Others" && !customLoc.trim()) return "Please enter your training location.";
    return null;
  };

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setLoading(true);
    try {
      const finalLocation = location === "Others" ? customLoc : location;
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      if (!res.ok) { setError(data.error); return; }
      localStorage.setItem("cs_pending_photo", photo ?? "");
      router.push("/auth?tab=login&registered=true");
    } catch (e: unknown) {
      setError("Network error: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate>

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
        <input className="auth-input" name="phone" type="tel" placeholder="Phone number" value={form.phone} onChange={handleChange} autoComplete="tel" />
      </div>

      {/* DOB */}
      <div className="mb-3">
        <label htmlFor="dob" style={{ display: "block", fontSize: "12px", color: "var(--cs-muted)", marginBottom: "6px", letterSpacing: "0.04em" }}>
          Date of Birth
        </label>
        <input id="dob" className="auth-input" name="dob" type="date" value={form.dob} onChange={handleChange} style={{ colorScheme: "dark" }} />
      </div>

      {/* Password */}
      <div style={{ marginBottom: "0.5rem" }}>
        <div className="auth-input" style={{ padding: 0, display: "flex", alignItems: "center" }}>
          <input name="password" type={showPw ? "text" : "password"} placeholder="Password" value={form.password} onChange={handleChange} autoComplete="new-password"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", padding: "11px 14px", color: "var(--cs-white)", fontFamily: "var(--font-body)", fontSize: "14px" }} />
          <button type="button" onClick={() => setShowPw(!showPw)}
            style={{ color: "var(--cs-muted)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 500, padding: "0 14px 0 0", whiteSpace: "nowrap", marginLeft: "auto" }}>
            {showPw ? "Hide" : "Show"}
          </button>
        </div>
        <p style={{ fontSize: "11px", color: "var(--cs-muted)", marginTop: "4px", paddingLeft: "2px" }}>Min. 8 characters</p>
      </div>

      {/* Confirm password */}
      <div className="mb-3">
        <input className="auth-input" name="confirm" type={showPw ? "text" : "password"} placeholder="Confirm password" value={form.confirm} onChange={handleChange} autoComplete="new-password" />
      </div>

      {/* Goal */}
      <div className="mb-3">
        <label style={{ display: "block", fontSize: "11px", color: "var(--cs-muted)", marginBottom: "6px", fontFamily: "var(--font-body)", letterSpacing: "0.05em" }}>Goal</label>
        <select value={goal} onChange={(e) => setGoal(e.target.value)} className="auth-input" style={{ cursor: "pointer", colorScheme: "dark" }}>
          {GOALS.map((g) => <option key={g.id} value={g.id} style={{ background: "#1a1a1a", color: "#fff" }}>{g.label}</option>)}
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
        By signing up, you agree to our{" "}
        <span style={{ color: "var(--cs-white)" }}>Terms</span>,{" "}
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
        {loading ? "Creating account…" : "Sign up"}
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
