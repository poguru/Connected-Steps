"use client";

import { useState, FormEvent, ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

interface Props {
  onSwitchToSignUp: () => void;
}

export default function LoginForm({ onSwitchToSignUp }: Props) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm]       = useState({ identifier: "", password: "" });
  const [showPw, setShowPw]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
    setError("");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.identifier || !form.password) {
      setError("Please enter your email or phone number and password.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: form.identifier, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }

      // Restore photo from pending registration if available
      const photo = localStorage.getItem("cs_pending_photo") ?? null;
      localStorage.setItem("cs_user", JSON.stringify({ ...data.user, photo: photo || null }));
      localStorage.removeItem("cs_pending_photo");

      // Restore Strava tokens if previously linked on this device
      const savedStrava = localStorage.getItem(`cs_strava_${data.user.email}`);
      if (savedStrava) localStorage.setItem("cs_strava", savedStrava);

      const redirect = searchParams.get("redirect") ?? "/dashboard";
      router.push(redirect);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* Email or phone */}
      <div className="mb-3">
        <input
          className="auth-input"
          name="identifier"
          type="text"
          placeholder="Email address or phone number"
          value={form.identifier}
          onChange={handleChange}
          autoComplete="username"
        />
      </div>

      {/* Password */}
      <div className="mb-4 flex items-center auth-input" style={{ padding: 0 }}>
        <input
          name="password"
          type={showPw ? "text" : "password"}
          placeholder="Password"
          value={form.password}
          onChange={handleChange}
          autoComplete="current-password"
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", padding: "11px 14px", color: "var(--cs-white)", fontFamily: "var(--font-body)", fontSize: "14px" }}
        />
        <button
          type="button"
          onClick={() => setShowPw(!showPw)}
          style={{ color: "var(--cs-muted)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 500, padding: "0 14px 0 0", whiteSpace: "nowrap" }}
        >
          {showPw ? "Hide" : "Show"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div
          className="text-xs px-3 py-2 rounded mb-4 text-center"
          style={{
            background: "rgba(226,75,74,0.1)",
            border: "1px solid rgba(226,75,74,0.3)",
            color: "#f09595",
          }}
        >
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 rounded font-medium text-sm tracking-wide mb-4"
        style={{
          background: loading ? "rgba(232,98,10,0.6)" : "var(--cs-orange)",
          color: "var(--cs-black)",
          border: "none",
          cursor: loading ? "not-allowed" : "pointer",
          fontFamily: "var(--font-body)",
          borderRadius: "4px",
        }}
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>

      {/* Forgot password */}
      <div className="text-center">
        <Link
          href="/auth/forgot-password"
          className="text-xs"
          style={{ color: "var(--cs-muted)" }}
        >
          Forgot password?
        </Link>
      </div>
    </form>
  );
}
