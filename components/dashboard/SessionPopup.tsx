"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Session {
  id: string;
  title: string;
  date: string;
  time: string | null;
  venue: string | null;
  location: string;
}

interface Props {
  sessions:        Session[];
  joinedSessionIds: Set<string>;
}

function fmtTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return ` · ${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

const POPUP_KEY = "cs_session_popup_dismissed";

export default function SessionPopup({ sessions, joinedSessionIds }: Props) {
  const router = useRouter();
  const [show,    setShow]    = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    if (localStorage.getItem(POPUP_KEY) === today) return;

    const now  = Date.now();
    const in24 = now + 24 * 60 * 60 * 1000;

    const upcoming = sessions.find(s => {
      if (joinedSessionIds.has(s.id)) return false;
      const ms = new Date(s.date + "T" + (s.time ?? "00:00:00")).getTime();
      return ms >= now && ms <= in24;
    });

    if (!upcoming) return;
    setSession(upcoming);
    // Small delay so dashboard renders before popup appears
    const tid = setTimeout(() => setShow(true), 1200);
    return () => clearTimeout(tid);
  }, [sessions, joinedSessionIds]);

  function dismiss() {
    localStorage.setItem(POPUP_KEY, new Date().toISOString().split("T")[0]);
    setShow(false);
  }

  if (!show || !session) return null;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "1rem", WebkitTapHighlightColor: "transparent" }}
      onClick={e => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <div style={{ background: "linear-gradient(160deg, oklch(0.18 0.012 270), oklch(0.22 0.020 285))", border: "1px solid var(--border)", borderRadius: "20px 20px 16px 16px", width: "100%", maxWidth: 480, padding: "0 1.5rem 1.5rem", boxShadow: "0 -8px 50px rgba(0,0,0,0.5)" }}>
        {/* Drag handle */}
        <div style={{ width: 40, height: 4, background: "rgba(255,255,255,0.15)", borderRadius: 2, margin: "14px auto 1.25rem" }} />

        {/* Label */}
        <div style={{ fontSize: "10px", color: "var(--cs-orange)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, marginBottom: "0.4rem" }}>
          Upcoming session
        </div>

        {/* Title */}
        <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--foreground)", lineHeight: 1.3, marginBottom: "0.35rem" }}>
          {session.title}
        </div>

        {/* Date / time / venue */}
        <div style={{ fontSize: "0.82rem", color: "var(--muted-foreground)", marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span>
            {new Date(session.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
          </span>
          {session.time && <span>{fmtTime(session.time)}</span>}
          {session.venue && <span style={{ color: "var(--cs-orange)", fontWeight: 600 }}>· {session.venue}</span>}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            onClick={() => { router.push(`/join/${session.id}`); dismiss(); }}
            style={{ flex: 1, padding: "13px", background: "var(--gradient-accent)", color: "var(--accent-foreground)", border: "none", borderRadius: 12, fontSize: "0.9rem", fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)", boxShadow: "var(--shadow-orange)" }}
          >
            Register →
          </button>
          <button
            onClick={dismiss}
            style={{ padding: "13px 20px", background: "rgba(255,255,255,0.06)", color: "var(--muted-foreground)", border: "1px solid var(--border)", borderRadius: 12, fontSize: "0.85rem", cursor: "pointer", fontFamily: "var(--font-body)", fontWeight: 500 }}
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
