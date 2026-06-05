"use client";

import { useState, FormEvent, ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  color: "var(--foreground)",
  fontFamily: "var(--font-body)",
  fontSize: 15,
  outline: "none",
  transition: "border-color 0.15s, box-shadow 0.15s",
  boxSizing: "border-box",
};

interface Props { onSwitchToSignUp: () => void; }

export default function LoginForm({ onSwitchToSignUp }: Props) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm]       = useState({ identifier: "", password: "" });
  const [showPw, setShowPw]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setForm(p => ({ ...p, [e.target.name]: e.target.value }));
    setError("");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.identifier || !form.password) { setError("Please enter your email or phone and password."); return; }
    setLoading(true);
    try {
      const res  = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: form.identifier, password: form.password }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      const photo = localStorage.getItem("cs_pending_photo") ?? null;
      localStorage.setItem("cs_user", JSON.stringify({ ...data.user, photo: photo || null }));
      localStorage.removeItem("cs_pending_photo");
      const savedStrava = localStorage.getItem(`cs_strava_${data.user.email}`);
      if (savedStrava) localStorage.setItem("cs_strava", savedStrava);
      router.push(searchParams.get("redirect") ?? "/dashboard");
    } catch { setError("Something went wrong. Please try again."); }
    finally   { setLoading(false); }
  };

  return (
    <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <input style={inputStyle} name="identifier" type="text" placeholder="Email address or phone number"
        value={form.identifier} onChange={handleChange} autoComplete="username"
        onFocus={e => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.boxShadow = "0 0 0 3px oklch(0.72 0.19 49 / 15%)"; }}
        onBlur={e  => { e.currentTarget.style.borderColor = "var(--border)";  e.currentTarget.style.boxShadow = "none"; }} />

      <div style={{ position: "relative" }}>
        <input style={{ ...inputStyle, paddingRight: 44 }} name="password" type={showPw ? "text" : "password"}
          placeholder="Password" value={form.password} onChange={handleChange} autoComplete="current-password"
          onFocus={e => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.boxShadow = "0 0 0 3px oklch(0.72 0.19 49 / 15%)"; }}
          onBlur={e  => { e.currentTarget.style.borderColor = "var(--border)";  e.currentTarget.style.boxShadow = "none"; }} />
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
        transition: "opacity 0.2s",
      }}>
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
