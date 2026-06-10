"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Props { userEmail: string }

export default function NotificationBell({ userEmail }: Props) {
  const router = useRouter();
  const [unread,   setUnread]   = useState(0);
  const [loading,  setLoading]  = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchUnread = useCallback(async () => {
    try {
      const res  = await fetch(`/api/notifications?email=${encodeURIComponent(userEmail)}&limit=1`);
      const data = await res.json();
      setUnread(data.unread ?? 0);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [userEmail]);

  useEffect(() => {
    fetchUnread();
    intervalRef.current = setInterval(fetchUnread, 60_000); // poll every minute
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchUnread]);

  if (loading) return null;

  return (
    <button
      onClick={() => router.push("/notifications")}
      aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
      style={{
        position:   "relative",
        background: "none",
        border:     "none",
        cursor:     "pointer",
        padding:    "6px",
        display:    "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        transition: "background 0.15s",
        color: "var(--muted-foreground)",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
      onMouseLeave={e => (e.currentTarget.style.background = "none")}
    >
      {/* Bell SVG */}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>

      {/* Unread badge */}
      {unread > 0 && (
        <span style={{
          position:  "absolute",
          top:       2,
          right:     2,
          minWidth:  16,
          height:    16,
          borderRadius: 8,
          background: "#e8620a",
          color:     "#fff",
          fontSize:  "9px",
          fontWeight: 800,
          display:   "flex",
          alignItems: "center",
          justifyContent: "center",
          padding:   "0 3px",
          lineHeight: 1,
          border:    "1.5px solid var(--background)",
        }}>
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}
