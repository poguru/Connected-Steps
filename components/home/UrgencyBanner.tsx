"use client";

import { useEffect, useState } from "react";

// Update these each month
const NEXT_BATCH_DATE = "2026-07-01"; // ISO date string
const SPOTS_LEFT      = 6;

function daysUntil(isoDate: string) {
  return Math.ceil((new Date(isoDate).getTime() - Date.now()) / 86400000);
}

export default function UrgencyBanner() {
  const [days, setDays] = useState<number | null>(null);

  useEffect(() => {
    setDays(daysUntil(NEXT_BATCH_DATE));
  }, []);

  if (days === null || days < 0 || days > 30) return null;

  const label = days === 0 ? "Today" : days === 1 ? "Tomorrow" : `in ${days} days`;

  return (
    <div style={{
      background: "rgba(232,98,10,0.12)",
      borderBottom: "1px solid rgba(232,98,10,0.25)",
      padding: "10px 1rem",
      textAlign: "center",
      fontSize: "0.82rem",
      color: "var(--cs-white)",
      position: "sticky",
      top: 0,
      zIndex: 100,
    }}>
      🏃 <strong>Next batch starts {label}</strong> — only{" "}
      <strong style={{ color: "var(--cs-orange)" }}>{SPOTS_LEFT} spots left.</strong>{" "}
      <a href="/pricing" style={{ color: "var(--cs-orange)", fontWeight: 700, textDecoration: "underline" }}>
        Reserve yours →
      </a>
    </div>
  );
}
