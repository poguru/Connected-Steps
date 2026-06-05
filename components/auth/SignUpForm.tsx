"use client";

import { useState, useRef, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Eye, EyeOff, Camera } from "lucide-react";

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
  onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.boxShadow = "0 0 0 3px oklch(0.72 0.19 49 / 15%)"; },
  onBlur:  (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => { e.currentTarget.style.borderColor = "var(--border)";  e.currentTarget.style.boxShadow = "none"; },
};

interface Props { onSwitchToLogin: () => void; }

export default function SignUpForm({ onSwitchToLogin }: Props) {
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", dob: "", password: "", confirm: "" });
  const [goal,      setGoal]      = useState("5k");
  const [location,  setLocation]  = useState("");
  const [customLoc, setCustomLoc] = useState("");
  const [photo,     setPhoto]     = useState<string | null>(null);
  const [showPw,    setShowPw]    = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => { setForm(p => ({ ...p, [e.target.name]: e.target.value })); setError(""); };
  const handlePhoto  = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  const validate = () => {
    if (!form.firstName || !form.lastName) return "Please enter your full name.";
    if (!form.email)     return "Please enter your email.";
    if (!form.phone)     return "Please enter your phone number.";
    if (form.password.length < 8)          return "Password must be at least 8 characters.";
    if (form.password !== form.confirm)    return "Passwords do not match.";
    if (!form.dob)       return "Please enter your date of birth.";
    if (!goal)           return "Please select your running goal.";
    if (!location)       return "Please select your training location.";
    if (location === "Others" && !customLoc.trim()) return "Please enter your training location.";
    return null;
  };

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    const err = validate(); if (err) { setError(err); return; }
    setLoading(true);
    try {
      const finalLocation = location === "Others" ? customLoc : location;
      const res  = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ firstName: form.firstName, lastName: form.lastName, email: form.email, phone: form.phone, password: form.password, goal, location: finalLocation }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      localStorage.setItem("cs_pending_photo", photo ?? "");
      router.push("/auth?tab=login&registered=true");
    } catch (e: unknown) { setError("Network error: " + (e instanceof Error ? e.message : String(e))); }
    finally { setLoading(false); }
  };

  return (
    <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Photo */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 8 }}>
        <button type="button" onClick={() => fileRef.current?.click()}
          style={{ position: "relative", width: 72, height: 72, borderRadius: "50%", overflow: "hidden", border: "2px dashed oklch(0.72 0.19 49 / 50%)", background: "oklch(0.72 0.19 49 / 8%)", cursor: "pointer", marginBottom: 8 }}>
          {photo ? <Image src={photo} alt="Profile" fill className="object-cover" /> : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--primary)" }}>
              <Camera size={24} />
            </div>
          )}
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhoto} />
        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{photo ? "Change photo" : "Add profile photo (optional)"}</span>
      </div>

      {/* Name row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <input style={inputStyle} name="firstName" type="text" placeholder="First name" value={form.firstName} onChange={handleChange} autoComplete="given-name" {...focusHandlers} />
        <input style={inputStyle} name="lastName"  type="text" placeholder="Last name"  value={form.lastName}  onChange={handleChange} autoComplete="family-name" {...focusHandlers} />
      </div>

      <input style={inputStyle} name="email" type="email" placeholder="Email address" value={form.email} onChange={handleChange} autoComplete="email" {...focusHandlers} />
      <input style={inputStyle} name="phone" type="tel"   placeholder="Phone number"  value={form.phone} onChange={handleChange} autoComplete="tel"   {...focusHandlers} />

      <div>
        <label style={{ display: "block", fontSize: 11, color: "var(--muted-foreground)", marginBottom: 5 }}>Date of Birth</label>
        <input style={{ ...inputStyle, colorScheme: "dark" }} name="dob" type="date" value={form.dob} onChange={handleChange} {...focusHandlers} />
      </div>

      {/* Password */}
      <div style={{ position: "relative" }}>
        <input style={{ ...inputStyle, paddingRight: 44 }} name="password" type={showPw ? "text" : "password"}
          placeholder="Password (min 8 chars)" value={form.password} onChange={handleChange} autoComplete="new-password" {...focusHandlers} />
        <button type="button" onClick={() => setShowPw(!showPw)}
          style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", display: "flex", padding: 0 }}>
          {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      <input style={inputStyle} name="confirm" type={showPw ? "text" : "password"} placeholder="Confirm password" value={form.confirm} onChange={handleChange} autoComplete="new-password" {...focusHandlers} />

      {/* Goal */}
      <div>
        <label style={{ display: "block", fontSize: 11, color: "var(--muted-foreground)", marginBottom: 5 }}>Running goal</label>
        <select value={goal} onChange={e => setGoal(e.target.value)} style={{ ...inputStyle, cursor: "pointer", colorScheme: "dark" }} onFocus={focusHandlers.onFocus as any} onBlur={focusHandlers.onBlur as any}>
          {GOALS.map(g => <option key={g.id} value={g.id} style={{ background: "#1a1a1a" }}>{g.label}</option>)}
        </select>
      </div>

      {/* Location */}
      <div>
        <label style={{ display: "block", fontSize: 11, color: "var(--muted-foreground)", marginBottom: 5 }}>Training location</label>
        <select value={location} onChange={e => setLocation(e.target.value)} style={{ ...inputStyle, cursor: "pointer", colorScheme: "dark" }} onFocus={focusHandlers.onFocus as any} onBlur={focusHandlers.onBlur as any}>
          <option value="">Select a location</option>
          {["Kondapur", "Kukatpally", "Kokapet", "Miyapur", "Others"].map(loc => <option key={loc} value={loc} style={{ background: "#1a1a1a" }}>{loc}</option>)}
        </select>
        {location === "Others" && (
          <input style={{ ...inputStyle, marginTop: 8 }} type="text" placeholder="Enter your training location" value={customLoc} onChange={e => setCustomLoc(e.target.value)} {...focusHandlers} />
        )}
      </div>

      <p style={{ fontSize: 11, textAlign: "center", color: "var(--muted-foreground)", lineHeight: 1.6 }}>
        By signing up you agree to our <span style={{ color: "var(--foreground)" }}>Terms</span>, <span style={{ color: "var(--foreground)" }}>Privacy Policy</span> and <span style={{ color: "var(--foreground)" }}>Cookie Policy</span>.
      </p>

      {error && (
        <div style={{ background: "oklch(0.62 0.22 22 / 10%)", border: "1px solid oklch(0.62 0.22 22 / 30%)", borderRadius: 8, padding: "10px 14px", fontSize: "0.8rem", color: "#f09595", textAlign: "center" }}>
          {error}
        </div>
      )}

      <button type="submit" disabled={loading} style={{
        width: "100%", padding: "13px", borderRadius: 999,
        background: loading ? "oklch(0.72 0.19 49 / 60%)" : "var(--gradient-accent)",
        color: "var(--accent-foreground)", border: "none",
        cursor: loading ? "not-allowed" : "pointer",
        fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "0.95rem",
        boxShadow: loading ? "none" : "var(--shadow-orange)",
      }}>
        {loading ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
