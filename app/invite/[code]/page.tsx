"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

const STORAGE_KEY = "cs_pending_referral";

const benefits = [
  { icon: "🎁", text: "1 free month of membership — for you and your friend" },
  { icon: "🏃", text: "Weekly group runs across Hyderabad" },
  { icon: "🏆", text: "NIS-certified coaching programs" },
  { icon: "📍", text: "Track sessions, recovery runs & race support" },
];

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const code   = typeof params.code === "string" ? params.code.toUpperCase() : "";

  const [referrerName, setReferrerName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) { router.replace("/auth?tab=register"); return; }
    fetch(`/api/referrals/info?code=${encodeURIComponent(code)}`)
      .then(r => r.json())
      .then(d => setReferrerName(d.referrerName ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [code, router]);

  function handleSignUp() {
    if (code) localStorage.setItem(STORAGE_KEY, code);
    router.push("/auth?tab=register");
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--foreground)", display: "flex", flexDirection: "column" }}>

      {/* Minimal header */}
      <header style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.6rem" }}>
        <Image src="/logo.png" alt="Connected Steps" width={30} height={30} className="rounded-full" />
        <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--foreground)" }}>Connected Steps</span>
      </header>

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1.25rem" }}>
        <div style={{ width: "100%", maxWidth: 420 }}>

          {/* Invite badge */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 13px", borderRadius: 999, border: "1px solid rgba(232,98,10,0.35)", background: "rgba(232,98,10,0.07)", fontSize: "11px", fontWeight: 600, color: "var(--cs-orange)", letterSpacing: "0.08em", marginBottom: "1.5rem", textTransform: "uppercase" }}>
            <span>🎟</span> Personal Invite
          </div>

          {/* Headline */}
          {loading ? (
            <div style={{ height: 42, width: "70%", borderRadius: 8, background: "var(--border)", backgroundImage: "linear-gradient(90deg, var(--border) 25%, var(--surface-elevated) 50%, var(--border) 75%)", backgroundSize: "200% 100%", animation: "invite-shimmer 1.4s infinite", marginBottom: "1.25rem" }} />
          ) : (
            <h1 style={{ fontSize: "clamp(1.6rem, 5vw, 2.25rem)", fontWeight: 700, lineHeight: 1.1, marginBottom: "1rem" }}>
              {referrerName ? (
                <>
                  <span style={{ color: "var(--cs-orange)" }}>{referrerName}</span> invited you to Connected Steps
                </>
              ) : (
                <>You&apos;ve been invited to <span style={{ color: "var(--cs-orange)" }}>Connected Steps</span></>
              )}
            </h1>
          )}

          <p style={{ fontSize: "0.9rem", color: "var(--muted-foreground)", lineHeight: 1.7, marginBottom: "1.75rem" }}>
            Hyderabad&apos;s coached running community. Sign up now and both of you unlock 1 month free.
          </p>

          {/* Benefits */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "2rem" }}>
            {benefits.map(b => (
              <div key={b.text} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <span style={{ fontSize: "1.1rem", flexShrink: 0, marginTop: 1 }}>{b.icon}</span>
                <span style={{ fontSize: "0.875rem", color: "var(--foreground)", lineHeight: 1.55 }}>{b.text}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={handleSignUp}
            style={{ width: "100%", padding: "14px", borderRadius: 10, background: "var(--gradient-accent)", border: "none", color: "#fff", fontSize: "1rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "var(--shadow-orange)", marginBottom: "1rem" }}
          >
            Sign Up Free — Claim 1 Month
          </button>

          <p style={{ fontSize: "11px", color: "var(--muted-foreground)", textAlign: "center", lineHeight: 1.6 }}>
            Already have an account?{" "}
            <Link href="/auth?tab=login" style={{ color: "var(--cs-orange)", textDecoration: "none" }}>Sign in</Link>
          </p>
        </div>
      </div>

      <style>{`
        @keyframes invite-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
