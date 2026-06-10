"use client";

import { useEffect, useRef, useState } from "react";

const PENDING_REF_KEY = "cs_pending_referral";
const CLAIMED_KEY     = "cs_referral_claimed";

interface Stats {
  code:       string;
  invites:    number;
  successful: number;
  rewards:    number;
  shareUrl:   string;
}

interface Props {
  userEmail: string;
}

export default function ReferralCard({ userEmail }: Props) {
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [copied,  setCopied]  = useState(false);
  const [loading, setLoading] = useState(true);
  const claimed = useRef(false);

  useEffect(() => {
    const token = localStorage.getItem("cs_user_token") ?? "";
    const headers: Record<string, string> = {
      "Content-Type":  "application/json",
      "x-user-token":  token,
    };

    // One-time: claim a pending referral code stored by the /invite/[code] page
    const pendingCode = localStorage.getItem(PENDING_REF_KEY);
    if (pendingCode && !localStorage.getItem(CLAIMED_KEY) && !claimed.current) {
      claimed.current = true;
      fetch("/api/referrals/claim", {
        method:  "POST",
        headers,
        body:    JSON.stringify({ email: userEmail, code: pendingCode }),
      })
        .then(() => {
          localStorage.setItem(CLAIMED_KEY, "1");
          localStorage.removeItem(PENDING_REF_KEY);
        })
        .catch(() => {});
    }

    // Load stats
    fetch(`/api/referrals/stats?email=${encodeURIComponent(userEmail)}`, { headers })
      .then(r => r.json())
      .then(d => { if (d.code) setStats(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userEmail]);

  async function copyCode() {
    if (!stats) return;
    try {
      await navigator.clipboard.writeText(stats.shareUrl);
    } catch {
      await navigator.clipboard.writeText(stats.code);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function share() {
    if (!stats) return;
    const text = `Join me on Connected Steps — Hyderabad's running community. Use my invite link to sign up: ${stats.shareUrl}`;
    if (navigator.share) {
      navigator.share({ title: "Join Connected Steps", text, url: stats.shareUrl }).catch(() => {});
    } else {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(text)}`,
        "_blank", "noopener,noreferrer"
      );
    }
  }

  if (loading) return null;
  if (!stats)  return null;

  return (
    <div style={{
      background:   "var(--surface)",
      border:       "1px solid var(--border)",
      borderRadius: 14,
      padding:      "1.125rem",
      marginBottom: "1rem",
    }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "1rem" }}>
        <span style={{ fontSize: "1.1rem" }}>🎁</span>
        <div>
          <div style={{ fontSize: "0.85rem", fontWeight: 700 }}>Invite a friend</div>
          <div style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>
            Earn a reward when they attend their first session
          </div>
        </div>
      </div>

      {/* Code box */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        gap:            "0.6rem",
        background:     "rgba(255,255,255,0.04)",
        border:         "1px solid var(--border)",
        borderRadius:   10,
        padding:        "0.6rem 0.875rem",
        marginBottom:   "0.875rem",
      }}>
        <code style={{ flex: 1, fontSize: "1.1rem", fontWeight: 800, letterSpacing: "0.18em", color: "var(--cs-orange)" }}>
          {stats.code}
        </code>
        <button
          onClick={copyCode}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.75rem", color: copied ? "#4ade80" : "var(--muted-foreground)", fontFamily: "inherit", padding: "4px 8px", borderRadius: 6, transition: "color 0.15s" }}>
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.875rem" }}>
        {[
          { label: "Invited",    value: stats.invites    },
          { label: "Joined",     value: stats.successful },
          { label: "Rewards",    value: stats.rewards    },
        ].map(s => (
          <div key={s.label} style={{
            flex:         1,
            textAlign:    "center",
            background:   "rgba(255,255,255,0.03)",
            borderRadius: 8,
            padding:      "0.5rem 0.25rem",
            border:       "1px solid var(--border)",
          }}>
            <div style={{ fontSize: "1.3rem", fontWeight: 800, color: s.value > 0 ? "var(--cs-orange)" : "var(--foreground)", lineHeight: 1 }}>
              {s.value}
            </div>
            <div style={{ fontSize: "9px", color: "var(--muted-foreground)", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Share button */}
      <button
        onClick={share}
        style={{
          width:        "100%",
          padding:      "9px",
          background:   "var(--gradient-accent)",
          border:       "none",
          borderRadius: 8,
          color:        "#fff",
          fontSize:     "0.82rem",
          fontWeight:   700,
          cursor:       "pointer",
          fontFamily:   "inherit",
          boxShadow:    "var(--shadow-orange)",
        }}>
        Share invite link 🏃
      </button>

      {/* Fine print */}
      <div style={{ marginTop: "0.6rem", fontSize: "10px", color: "var(--muted-foreground)", textAlign: "center", lineHeight: 1.5 }}>
        Reward unlocks when your friend attends their first session.
      </div>
    </div>
  );
}
