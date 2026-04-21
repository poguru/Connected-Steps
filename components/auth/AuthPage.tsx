"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import SignUpForm from "./SignUpForm";
import LoginForm from "./LoginForm";

type Tab = "signup" | "login";


export default function AuthPage() {
  const [tab, setTab] = useState<Tab>("signup");

  return (
    <div className="auth-layout">

      {/* ── Left brand panel ── */}
      <div className="auth-left" style={{ gap: "3rem" }}>

        {/* Logo — top center */}
        <Link href="/" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", textDecoration: "none", width: "100%" }}>
          <Image
            src="/logo.png"
            alt="Connected Steps"
            width={110}
            height={110}
            className="rounded-full"
            style={{ border: "2px solid rgba(232,98,10,0.35)" }}
          />
          <div style={{ textAlign: "center" }}>
            <div className="font-display" style={{ fontSize: "1.75rem", fontWeight: 600, color: "var(--cs-white)" }}>
              Connected Steps
            </div>
            <div style={{ fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--cs-orange)", marginTop: "4px" }}>
              Your Goal, Our Plan
            </div>
          </div>
        </Link>

        {/* Pitch — center */}
        <div style={{ maxWidth: "380px", width: "100%" }}>
          <div style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--cs-orange)", marginBottom: "1rem", fontFamily: "var(--font-body)" }}>
            Every journey starts with a step
          </div>
          <h2
            className="font-display"
            style={{ fontSize: "clamp(2rem, 3vw, 2.8rem)", fontWeight: 300, lineHeight: 1.15, marginBottom: "1.25rem" }}
          >
            <span style={{ color: "var(--cs-white)" }}>Train smarter.</span><br />
            <span style={{ color: "var(--cs-orange)" }}>Live better.</span>
          </h2>
          <p style={{ fontSize: "0.9rem", lineHeight: 1.75, color: "var(--cs-muted)" }}>
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
        <div className="auth-mobile-logo">
          <Image src="/logo.png" alt="Connected Steps" width={40} height={40} className="rounded-full" />
          <div className="font-display" style={{ fontSize: "1rem", fontWeight: 600, color: "var(--cs-white)" }}>
            Connected Steps
          </div>
        </div>

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
