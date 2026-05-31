"use client";

import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export interface MenuUser {
  firstName: string;
  lastName:  string;
  email:     string;
  phone:     string;
  goal:      string;
  location:  string;
  photo:     string | null;
}

const goalLabel: Record<string, string> = {
  "5k":  "First 5K",
  "10k": "10K",
  "half":"Half Marathon",
  "full":"Full Marathon",
};

interface Props {
  user: MenuUser;
  onUserUpdate?: (u: MenuUser) => void;
}

export default function UserMenu({ user }: Props) {
  const router     = useRouter();
  const ref        = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open,    setOpen]    = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, right: 0 });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const logout = () => {
    localStorage.removeItem("cs_user");
    localStorage.removeItem("cs_strava");
    router.push("/auth?tab=signin");
  };

  const fullName = `${user.firstName} ${user.lastName}`;
  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();

  return (
    <div ref={ref} style={{ position: "relative" }}>

      {/* ── Trigger ── */}
      <button
        ref={triggerRef}
        onClick={() => {
          if (!open && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setDropPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
          }
          setOpen(!open);
        }}
        style={{ display: "flex", alignItems: "center", gap: "0.6rem", background: "none", border: "none", cursor: "pointer", padding: "4px 6px", borderRadius: "6px" }}
      >
        {user.photo ? (
          <img src={user.photo} alt={fullName} style={{ width: "36px", height: "36px", borderRadius: "50%", objectFit: "cover", border: "2px solid var(--cs-orange)" }} />
        ) : (
          <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "var(--cs-orange)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 700, color: "var(--cs-white)", flexShrink: 0 }}>
            {initials}
          </div>
        )}
        <span style={{ fontSize: "0.875rem", color: "var(--cs-white)" }}>{fullName}</span>
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ color: "var(--cs-muted)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}>
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* ── Dropdown ── */}
      {open && (
        <div style={{ position: "fixed", top: dropPos.top, right: dropPos.right, background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", width: "260px", zIndex: 9999, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}>

          {/* Profile snapshot */}
          <div style={{ padding: "1.25rem", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
              {user.photo ? (
                <img src={user.photo} alt={fullName} style={{ width: "48px", height: "48px", borderRadius: "50%", objectFit: "cover", border: "2px solid var(--cs-orange)", flexShrink: 0 }} />
              ) : (
                <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "var(--cs-orange)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", fontWeight: 700, color: "var(--cs-white)", flexShrink: 0 }}>
                  {initials}
                </div>
              )}
              <div>
                <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--cs-white)", marginBottom: "2px" }}>{fullName}</div>
                <div style={{ fontSize: "11px", color: "var(--cs-orange)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{goalLabel[user.goal] ?? user.goal}</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ fontSize: "0.78rem", color: "var(--cs-muted)" }}>✉️&nbsp; {user.email}</div>
              {user.phone    && <div style={{ fontSize: "0.78rem", color: "var(--cs-muted)" }}>📱&nbsp; {user.phone}</div>}
              {user.location && <div style={{ fontSize: "0.78rem", color: "var(--cs-muted)" }}>📍&nbsp; {user.location}</div>}
            </div>
          </div>

          {/* Actions */}
          <div style={{ padding: "0.5rem" }}>
            <button
              onClick={() => { setOpen(false); router.push("/profile"); }}
              style={{ width: "100%", padding: "0.65rem 1rem", display: "flex", alignItems: "center", gap: "0.6rem", background: "none", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.875rem", color: "var(--cs-white)", fontFamily: "var(--font-body)", textAlign: "left" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              ✏️&nbsp; Edit Profile
            </button>
            <div style={{ height: "1px", background: "rgba(255,255,255,0.06)", margin: "0.2rem 0.5rem" }} />
            <button
              onClick={logout}
              style={{ width: "100%", padding: "0.65rem 1rem", display: "flex", alignItems: "center", gap: "0.6rem", background: "none", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.875rem", color: "#f09595", fontFamily: "var(--font-body)", textAlign: "left" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(226,75,74,0.08)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              ↩️&nbsp; Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
