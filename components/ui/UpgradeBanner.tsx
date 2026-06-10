"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const DISMISS_KEY = "cs_upgrade_banner_dismissed";

const premiumPerks = [
  { icon: "📋", label: "Personal training plan", sub: "Written for your goal, updated weekly" },
  { icon: "💬", label: "Direct coach access",    sub: "WhatsApp check-ins every week" },
  { icon: "🏃", label: "Free weekend runs",      sub: "Members run free at every event" },
];

interface Props {
  userEmail: string;
}

export default function UpgradeBanner({ userEmail }: Props) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Don't show if dismissed today
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed === new Date().toDateString()) return;

    // Don't show if already a member
    fetch(`/api/membership?email=${encodeURIComponent(userEmail)}`)
      .then(r => r.json())
      .then(d => { if (!d.membership?.isActive) setShow(true); })
      .catch(() => {});
  }, [userEmail]);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, new Date().toDateString());
    setShow(false);
  }

  if (!show) return null;

  return (
    <div style={{
      background: "oklch(0.16 0.025 40)",
      border: "1px solid oklch(0.72 0.19 49 / 30%)",
      borderRadius: 14,
      padding: "1rem 1.125rem",
      marginBottom: "1rem",
      position: "relative",
    }}>
      {/* Dismiss */}
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{ position: "absolute", top: 10, right: 12, background: "none", border: "none", cursor: "pointer", fontSize: "1rem", color: "var(--muted-foreground)", lineHeight: 1, padding: 4 }}>
        ✕
      </button>

      {/* Heading */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "0.75rem" }}>
        <span style={{ fontSize: "1rem" }}>✦</span>
        <div>
          <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--foreground)" }}>Unlock your personal coach</div>
          <div style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>From ₹40/day — less than a chai</div>
        </div>
      </div>

      {/* Perks */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", marginBottom: "0.875rem" }}>
        {premiumPerks.map(p => (
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
          See plans →
        </Link>
        <button
          onClick={dismiss}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.78rem", color: "var(--muted-foreground)", fontFamily: "inherit", padding: 0 }}>
          Maybe later
        </button>
      </div>
    </div>
  );
}
