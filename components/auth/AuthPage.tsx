"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { CheckCircle2 } from "lucide-react";
import SignUpForm from "./SignUpForm";
import LoginForm from "./LoginForm";

type Tab = "signup" | "login";

const perks = [
  "Personalised training plan from day one",
  "Weekly check-ins with a real coach",
  "Community group runs every weekend",
  "Race-day strategy and pacing support",
];

export default function AuthPage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("signup");
  const [justRegistered, setJustRegistered] = useState(false);

  useEffect(() => {
    if (searchParams.get("tab") === "login" || searchParams.get("tab") === "signin" || searchParams.get("redirect")) setTab("login");
    if (searchParams.get("registered") === "true") setJustRegistered(true);
  }, [searchParams]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: "var(--background)" }}>

      {/* ── Left brand panel ── */}
      <div className="hidden lg:flex" style={{ width: "45%", flexShrink: 0, position: "relative", overflow: "hidden", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "4rem", background: "var(--gradient-primary)" }}>
        <div className="grid-bg" style={{ position: "absolute", inset: 0, opacity: 0.2 }} />
        <div style={{ position: "absolute", top: -80, right: -80, width: 300, height: 300, borderRadius: "50%", background: "oklch(0.74 0.2 50 / 30%)", filter: "blur(60px)" }} />
        <div style={{ position: "absolute", bottom: -60, left: -60, width: 250, height: 250, borderRadius: "50%", background: "oklch(0.72 0.19 49 / 20%)", filter: "blur(50px)" }} />

        <div style={{ position: "relative", maxWidth: 380, textAlign: "center" }}>
          <Link href="/" style={{ textDecoration: "none", display: "inline-block", marginBottom: "2rem" }}>
            <Image src="/logo.png" alt="Connected Steps" width={100} height={100} className="rounded-full"
              style={{ border: "3px solid rgba(255,255,255,0.3)", display: "block" }} />
          </Link>

          <div className="font-display" style={{ fontSize: "2rem", fontWeight: 700, color: "#fff", marginBottom: "0.5rem" }}>
            Connected Steps
          </div>
          <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.7)", marginBottom: "2rem" }}>
            Your Goal, Our Plan
          </div>

          <h2 className="font-display" style={{ fontSize: "clamp(1.8rem, 2.5vw, 2.5rem)", fontWeight: 700, lineHeight: 1.15, color: "#fff", marginBottom: "2rem" }}>
            Train smarter.<br />
            <span className="text-italic-serif">Live better.</span>
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, textAlign: "left" }}>
            {perks.map(p => (
              <div key={p} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: "0.875rem", color: "rgba(255,255,255,0.9)" }}>
                <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 2, color: "var(--accent)" }} />
                {p}
              </div>
            ))}
          </div>

          <div style={{ marginTop: "2.5rem", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex" }}>
              {["A","B","C","D"].map((l, i) => (
                <div key={l} style={{ width: 32, height: 32, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, color: "#fff", marginLeft: i === 0 ? 0 : -10, border: "2px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.2)", backdropFilter: "blur(4px)" }}>
                  {l}
                </div>
              ))}
            </div>
            <span style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.85)" }}>
              <strong>500+ runners</strong> already training
            </span>
          </div>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "3rem 2rem", overflowY: "auto", minHeight: "100vh" }}>

        {/* Mobile logo + value strip */}
        <div className="lg:hidden" style={{ marginBottom: "1.5rem" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none", marginBottom: "1rem" }}>
            <Image src="/logo.png" alt="Connected Steps" width={32} height={32} className="rounded-full" />
            <span className="font-display" style={{ fontSize: "1rem", fontWeight: 600, color: "var(--foreground)" }}>Connected Steps</span>
          </Link>
          <div style={{ display: "flex", gap: "1rem", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, flexWrap: "wrap" }}>
            {["500+ runners", "3 expert coaches", "4.9★ rated"].map(t => (
              <span key={t} style={{ fontSize: 11, color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--cs-orange)", display: "inline-block", flexShrink: 0 }} />
                {t}
              </span>
            ))}
          </div>
        </div>

        <div style={{ width: "100%", maxWidth: 400, margin: "0 auto" }}>

          {/* Heading */}
          <div style={{ marginBottom: "2rem" }}>
            <h1 className="font-display" style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--foreground)", marginBottom: "0.5rem", letterSpacing: "-0.015em" }}>
              {tab === "signup" ? "Create your account" : "Welcome back"}
            </h1>
            <p style={{ fontSize: "0.875rem", color: "var(--muted-foreground)" }}>
              {tab === "signup" ? "Start your running journey today — it's free." : "Sign in to continue your training."}
            </p>
          </div>

          {/* Registration success */}
          {justRegistered && (
            <div style={{ background: "oklch(0.72 0.19 49 / 10%)", border: "1px solid oklch(0.72 0.19 49 / 30%)", borderRadius: 10, padding: "10px 14px", marginBottom: "1.5rem", fontSize: "0.8rem", color: "var(--primary)", display: "flex", alignItems: "center", gap: 8 }}>
              <CheckCircle2 size={14} /> Account created! Please sign in to continue.
            </div>
          )}

          {/* Tab switcher */}
          <div style={{ display: "flex", gap: 4, padding: 4, marginBottom: "1.75rem", borderRadius: 999, background: "var(--surface)" }}>
            {(["signup", "login"] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                flex: 1, padding: "10px", borderRadius: 999,
                fontSize: "0.875rem", fontWeight: 600,
                background: tab === t ? "var(--gradient-accent)" : "transparent",
                color: tab === t ? "var(--accent-foreground)" : "var(--muted-foreground)",
                fontFamily: "var(--font-body)", border: "none", cursor: "pointer",
                transition: "all 0.2s",
                boxShadow: tab === t ? "var(--shadow-orange)" : "none",
              }}>
                {t === "signup" ? "Create account" : "Sign in"}
              </button>
            ))}
          </div>

          {/* Form — no key prop: avoids re-mounting and losing typed data on tab switch */}
          <div className="animate-fade-up">
            {tab === "signup" ? <SignUpForm onSwitchToLogin={() => setTab("login")} /> : <LoginForm onSwitchToSignUp={() => setTab("signup")} />}
          </div>

          {/* Switch link */}
          <p style={{ fontSize: "0.875rem", textAlign: "center", marginTop: "1.5rem", color: "var(--muted-foreground)" }}>
            {tab === "signup" ? (
              <>Already have an account?{" "}
                <button onClick={() => setTab("login")} style={{ color: "var(--primary)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", fontWeight: 600 }}>Sign in</button>
              </>
            ) : (
              <>New to Connected Steps?{" "}
                <button onClick={() => setTab("signup")} style={{ color: "var(--primary)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", fontWeight: 600 }}>Create account</button>
              </>
            )}
          </p>

          {/* Coach login — separate portal using HTTP-only cookie auth */}
          <Link href="/coach/login" style={{ display: "block", textAlign: "center", marginTop: "0.75rem", fontSize: "0.75rem", color: "var(--muted-foreground)", textDecoration: "none" }}>
            Coach? <span style={{ color: "var(--primary)", fontWeight: 600 }}>Sign in to coach portal →</span>
          </Link>

          <Link href="/" style={{ display: "block", textAlign: "center", marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--muted-foreground)", textDecoration: "none" }}>
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
