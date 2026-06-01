"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import SignUpForm from "./SignUpForm";
import LoginForm from "./LoginForm";

type Tab = "signup" | "login";

export default function AuthPage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("signup");
  const [justRegistered, setJustRegistered] = useState(false);

  useEffect(() => {
    if (searchParams.get("tab") === "login" || searchParams.get("tab") === "signin" || searchParams.get("redirect")) setTab("login");
    if (searchParams.get("registered") === "true") setJustRegistered(true);
  }, [searchParams]);

  return (
    <div className="auth-layout">

      {/* ── Left brand panel ── */}
      <div className="auth-left">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", maxWidth: "400px", width: "100%" }}>

          {/* Logo */}
          <Link href="/" style={{ textDecoration: "none" }}>
            <Image
              src="/logo.png"
              alt="Connected Steps"
              width={120}
              height={120}
              className="rounded-full"
              style={{ border: "2px solid rgba(232,98,10,0.4)", display: "block" }}
            />
          </Link>

          {/* Brand name */}
          <div className="font-display" style={{ fontSize: "1.9rem", fontWeight: 600, color: "var(--cs-white)", marginTop: "1.25rem" }}>
            Connected Steps
          </div>
          <div style={{ fontSize: "11px", letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--cs-orange)", marginTop: "6px" }}>
            Your Goal, Our Plan
          </div>

          {/* Divider */}
          <div style={{ width: "40px", height: "1px", background: "var(--cs-orange)", margin: "1.75rem auto", opacity: 0.5 }} />

          {/* Pitch */}
          <div style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--cs-orange)", marginBottom: "1rem", fontFamily: "var(--font-body)" }}>
            Every journey starts with a step
          </div>
          <h2
            className="font-display"
            style={{ fontSize: "clamp(1.8rem, 2.5vw, 2.5rem)", fontWeight: 300, lineHeight: 1.2, marginBottom: "1.25rem" }}
          >
            <span style={{ color: "var(--cs-white)" }}>Train smarter.</span><br />
            <span style={{ color: "var(--cs-orange)" }}>Live better.</span>
          </h2>
          <p style={{ fontSize: "0.875rem", lineHeight: 1.8, color: "var(--cs-muted)" }}>
            Connected Steps is a community-driven fitness movement built on real transformations.
            We pair you with National-level athletes and elite coaches to help you break through
            your limits. Whether you're looking to lose weight, run your first marathon, or simply
            lead a more active life, we provide the expert plan to get you there.
          </p>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="auth-right">
        {/* Mobile logo */}
        <Link href="/" className="auth-mobile-logo" style={{ textDecoration: "none" }}>
          <Image src="/logo.png" alt="Connected Steps" width={40} height={40} className="rounded-full" />
          <div className="font-display" style={{ fontSize: "1rem", fontWeight: 600, color: "var(--cs-white)" }}>
            Connected Steps
          </div>
        </Link>

        <div style={{ width: "100%", maxWidth: "360px", margin: "0 auto" }}>
          {/* Heading */}
          <div style={{ marginBottom: "1.75rem" }}>
            <h1 className="font-display" style={{ fontSize: "1.5rem", fontWeight: 300, color: "var(--cs-white)", marginBottom: "0.25rem" }}>
              {tab === "signup" ? "Create your account" : "Welcome back"}
            </h1>
            <p style={{ fontSize: "0.875rem", color: "var(--cs-muted)" }}>
              {tab === "signup"
                ? "Start your running journey today — it's free."
                : "Sign in to continue your training."}
            </p>
          </div>

          {/* Registration success banner */}
          {justRegistered && (
            <div style={{ background: "rgba(232,98,10,0.12)", border: "1px solid rgba(232,98,10,0.4)", borderRadius: "4px", padding: "10px 14px", marginBottom: "1.25rem", fontSize: "0.8rem", color: "var(--cs-orange)" }}>
              ✓ Account created! Please sign in to continue.
            </div>
          )}

          {/* Tab switcher */}
          <div
            style={{ display: "flex", gap: "4px", padding: "4px", marginBottom: "1.5rem", borderRadius: "4px", background: "rgba(255,255,255,0.05)" }}
          >
            {(["signup", "login"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1,
                  padding: "8px",
                  borderRadius: "3px",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  background: tab === t ? "var(--cs-orange)" : "transparent",
                  color: tab === t ? "var(--cs-white)" : "var(--cs-muted)",
                  fontFamily: "var(--font-body)",
                  border: "none",
                  cursor: "pointer",
                  transition: "background 0.2s, color 0.2s",
                }}
              >
                {t === "signup" ? "Create account" : "Sign in"}
              </button>
            ))}
          </div>

          {/* Form */}
          {tab === "signup" ? (
            <SignUpForm onSwitchToLogin={() => setTab("login")} />
          ) : (
            <LoginForm onSwitchToSignUp={() => setTab("signup")} />
          )}

          {/* Switch */}
          <p style={{ fontSize: "0.875rem", textAlign: "center", marginTop: "1.5rem", color: "var(--cs-muted)" }}>
            {tab === "signup" ? (
              <>
                Already have an account?{" "}
                <button
                  onClick={() => setTab("login")}
                  style={{ color: "var(--cs-orange)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", fontWeight: 500 }}
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                New to Connected Steps?{" "}
                <button
                  onClick={() => setTab("signup")}
                  style={{ color: "var(--cs-orange)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", fontWeight: 500 }}
                >
                  Create account
                </button>
              </>
            )}
          </p>

          <Link
            href="/"
            style={{ display: "block", textAlign: "center", marginTop: "1rem", fontSize: "0.75rem", letterSpacing: "0.05em", color: "var(--cs-muted)" }}
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
