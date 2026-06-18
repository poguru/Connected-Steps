"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";

const DISMISS_KEY = "cs_post_session_prompt_v1";

const PERKS = [
  { icon: "📋", label: "Personal training plan",  sub: "Written for your goal, updated weekly by your coach" },
  { icon: "💬", label: "Weekly coach check-in",   sub: "Direct WhatsApp access — ask anything, anytime" },
  { icon: "🏃", label: "Free entry to every run", sub: "Members never pay walk-up price again" },
];

interface Props {
  totalAttended: number;
  userEmail:     string;
  /** Rendered when this prompt is not applicable (dismissed, member, or 0 sessions). */
  fallback?:     ReactNode;
}

export default function PostSessionUpgradePrompt({ totalAttended, userEmail, fallback }: Props) {
  const [state, setState] = useState<"loading" | "show" | "hidden">("loading");

  useEffect(() => {
    // Already permanently dismissed
    if (localStorage.getItem(DISMISS_KEY)) { setState("hidden"); return; }
    // No session yet
    if (totalAttended < 1) { setState("hidden"); return; }

    // Already a member — don't show
    const token = localStorage.getItem("cs_user_token") ?? "";
    fetch(`/api/membership?email=${encodeURIComponent(userEmail)}`, { headers: { "x-user-token": token } })
      .then(r => r.json())
      .then(d => { setState(d.membership?.isActive ? "hidden" : "show"); })
      .catch(() => setState("show")); // show on error — better to show than miss
  }, [totalAttended, userEmail]);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setState("hidden");
  }

  if (state === "loading") return null;
  if (state === "hidden")  return <>{fallback}</>;

  return (
    <div style={{
      background:    "linear-gradient(135deg, oklch(0.18 0.04 40), oklch(0.14 0.02 270))",
      border:        "1px solid oklch(0.72 0.19 49 / 40%)",
      borderRadius:  16,
      padding:       "1.25rem 1.125rem",
      marginBottom:  "1rem",
      position:      "relative",
      boxShadow:     "0 0 0 1px oklch(0.72 0.19 49 / 8%), var(--shadow-md)",
    }}>

      {/* Dismiss */}
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{ position: "absolute", top: 10, right: 12, background: "none", border: "none", cursor: "pointer", fontSize: "1rem", color: "var(--muted-foreground)", lineHeight: 1, padding: 4 }}>
        ✕
      </button>

      {/* Celebration header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "0.875rem" }}>
        <span style={{ fontSize: "1.6rem", lineHeight: 1 }}>🎉</span>
        <div>
          <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--foreground)", lineHeight: 1.2 }}>
            You completed your first session!
          </div>
          <div style={{ fontSize: "11px", color: "var(--cs-orange)", marginTop: 2, fontWeight: 600 }}>
            Your coach saw you out there. Now let them write your plan.
          </div>
        </div>
      </div>

      {/* Perks */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
        {PERKS.map(p => (
          <div key={p.label} style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem" }}>
            <span style={{ fontSize: "0.9rem", flexShrink: 0, marginTop: 1 }}>{p.icon}</span>
            <div>
              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--foreground)" }}>{p.label}</span>
              <span style={{ fontSize: "0.75rem", color: "var(--muted-foreground)" }}> — {p.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
        <Link
          href="/pricing"
          style={{ padding: "8px 20px", background: "var(--gradient-accent)", color: "#fff", borderRadius: 8, textDecoration: "none", fontSize: "0.82rem", fontWeight: 700, boxShadow: "var(--shadow-orange)", whiteSpace: "nowrap" }}>
          Get my training plan →
        </Link>
        <button
          onClick={dismiss}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.78rem", color: "var(--muted-foreground)", fontFamily: "inherit", padding: 0 }}>
          Not now
        </button>
      </div>
    </div>
  );
}
