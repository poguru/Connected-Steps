"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppNav from "@/components/layout/AppNav";
import type { MenuUser } from "@/components/ui/UserMenu";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AppUser { email: string; firstName: string; lastName: string; phone?: string; goal?: string; location?: string; photo?: string | null; }

interface Notification {
  id:         string;
  type:       string;
  title:      string;
  body:       string;
  action_url: string | null;
  read_at:    string | null;
  created_at: string;
}

// ── Icon per type ─────────────────────────────────────────────────────────────

function typeIcon(type: string): React.ReactNode {
  const s = { width: 18, height: 18, stroke: "var(--cs-orange)", fill: "none", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (type) {
    case "session_reminder":
      return <svg viewBox="0 0 24 24" style={s}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
    case "coach_message":
      return <svg viewBox="0 0 24 24" style={s}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
    case "achievement":
      return <svg viewBox="0 0 24 24" style={s}><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>;
    case "membership_expiry":
      return <svg viewBox="0 0 24 24" style={s}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>;
    case "new_session":
      return <svg viewBox="0 0 24 24" style={s}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
    default:
      return <svg viewBox="0 0 24 24" style={s}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
  }
}

function typeAccent(type: string): string {
  switch (type) {
    case "session_reminder":  return "oklch(0.72 0.19 49 / 12%)";
    case "coach_message":     return "oklch(0.65 0.20 280 / 12%)";
    case "achievement":       return "oklch(0.78 0.18 90 / 12%)";
    case "membership_expiry": return "oklch(0.62 0.22 22 / 12%)";
    case "new_session":       return "oklch(0.65 0.15 200 / 12%)";
    default:                  return "rgba(255,255,255,0.04)";
  }
}

// ── Time helpers ──────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7)   return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function dayGroup(iso: string): string {
  const d    = new Date(iso);
  const now  = new Date();
  const diff = Math.floor((now.setHours(0,0,0,0) - d.setHours(0,0,0,0)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7)   return "This week";
  return "Earlier";
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {[1,2,3].map(i => (
        <div key={i} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "0.875rem 1rem", display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.06)", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ width: "45%", height: 10, background: "rgba(255,255,255,0.06)", borderRadius: 4, marginBottom: 6 }} />
            <div style={{ width: "75%", height: 8, background: "rgba(255,255,255,0.04)", borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const router = useRouter();
  const [user,        setUser]        = useState<AppUser | null>(null);
  const [notifs,      setNotifs]      = useState<Notification[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore,     setHasMore]     = useState(false);
  const [nextCursor,  setNextCursor]  = useState<string | null>(null);
  const [markingAll,  setMarkingAll]  = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // All notification API calls require the user token for ownership verification.
  const userToken = (): string =>
    typeof window !== "undefined" ? (localStorage.getItem("cs_user_token") ?? "") : "";

  const fetchPage = useCallback(async (email: string, cursor?: string) => {
    const params = new URLSearchParams({ email, limit: "20" });
    if (cursor) params.set("before", cursor);
    const res  = await fetch(`/api/notifications?${params}`, {
      headers: { "x-user-token": userToken() },
    });
    return res.json() as Promise<{ notifications: Notification[]; has_more: boolean; next_cursor: string | null }>;
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("cs_user");
    if (!stored) { router.push("/auth"); return; }
    const u = JSON.parse(stored) as AppUser;
    setUser(u);

    fetchPage(u.email)
      .then(d => {
        setNotifs(d.notifications);
        setHasMore(d.has_more);
        setNextCursor(d.next_cursor);
        // Mark all as read silently when page opens
        if (d.notifications.some(n => !n.read_at)) {
          fetch("/api/notifications", {
            method:  "POST",
            headers: { "Content-Type": "application/json", "x-user-token": userToken() },
            body:    JSON.stringify({ email: u.email }),
          }).catch(() => {});
          setNotifs(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router, fetchPage]);

  // Infinite scroll
  useEffect(() => {
    if (!hasMore || !user) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMore && !loadingMore && nextCursor) {
        setLoadingMore(true);
        fetchPage(user.email, nextCursor)
          .then(d => {
            setNotifs(prev => {
              const ids = new Set(prev.map(n => n.id));
              return [...prev, ...(d.notifications.filter(n => !ids.has(n.id)))];
            });
            setHasMore(d.has_more);
            setNextCursor(d.next_cursor);
          })
          .catch(() => {})
          .finally(() => setLoadingMore(false));
      }
    }, { rootMargin: "200px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, nextCursor, user, fetchPage]);

  async function markAllRead() {
    if (!user || markingAll) return;
    setMarkingAll(true);
    await fetch("/api/notifications", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-user-token": userToken() },
      body:    JSON.stringify({ email: user.email }),
    }).catch(() => {});
    setNotifs(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    setMarkingAll(false);
  }

  function handleNotifClick(n: Notification) {
    fetch(`/api/notifications/${n.id}`, {
      method: "PATCH",
      headers: { "x-user-token": userToken() },
    }).catch(() => {});
    if (n.action_url) router.push(n.action_url);
  }

  if (!user) return null;

  const unreadCount = notifs.filter(n => !n.read_at).length;

  // Group by day
  const groups: { label: string; items: Notification[] }[] = [];
  for (const n of notifs) {
    const label = dayGroup(n.created_at);
    const last  = groups[groups.length - 1];
    if (last?.label === label) { last.items.push(n); }
    else { groups.push({ label, items: [n] }); }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--foreground)" }}>
      <AppNav
        user={user as MenuUser}
        onUserUpdate={u => { setUser(u as AppUser); localStorage.setItem("cs_user", JSON.stringify(u)); }}
        activeLabel="Notifications"
      />

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "calc(var(--nav-total) + 1.25rem) 1rem 3rem" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
          <div>
            <h1 className="font-display" style={{ fontSize: "clamp(1.4rem, 4vw, 1.75rem)", fontWeight: 700, letterSpacing: "-0.015em", margin: 0 }}>
              Notifications
            </h1>
            {unreadCount > 0 && (
              <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "var(--muted-foreground)" }}>
                {unreadCount} unread
              </p>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              disabled={markingAll}
              style={{ fontSize: "0.78rem", color: "var(--cs-orange)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, padding: 0 }}>
              {markingAll ? "Marking…" : "Mark all read"}
            </button>
          )}
        </div>

        {/* Content */}
        {loading ? <Skeleton /> : notifs.length === 0 ? (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "3rem 1.5rem", textAlign: "center" }}>
            <div style={{ marginBottom: 8, display: "flex", justifyContent: "center" }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--muted-foreground)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </div>
            <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: 4 }}>All caught up</div>
            <div style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>Session reminders, coach messages, and achievements will appear here.</div>
          </div>
        ) : (
          <>
            {groups.map(group => (
              <div key={group.label} style={{ marginBottom: "1.5rem" }}>
                <div style={{ fontSize: "10px", color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, marginBottom: "0.6rem" }}>
                  {group.label}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {group.items.map(n => {
                    const unread = !n.read_at;
                    return (
                      <div
                        key={n.id}
                        onClick={() => handleNotifClick(n)}
                        style={{
                          background:  unread ? typeAccent(n.type) : "var(--surface)",
                          border:      `1px solid ${unread ? "oklch(0.72 0.19 49 / 20%)" : "var(--border)"}`,
                          borderRadius: 12,
                          padding:     "0.75rem 0.875rem",
                          display:     "flex",
                          gap:         "0.75rem",
                          alignItems:  "flex-start",
                          cursor:      n.action_url ? "pointer" : "default",
                          transition:  "opacity 0.15s",
                        }}
                        onMouseEnter={e => { if (n.action_url) e.currentTarget.style.opacity = "0.85"; }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
                      >
                        {/* Icon */}
                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: typeAccent(n.type), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {typeIcon(n.type)}
                        </div>

                        {/* Text */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                            <div style={{ fontSize: "0.82rem", fontWeight: unread ? 700 : 500, color: "var(--foreground)", lineHeight: 1.35 }}>
                              {n.title}
                            </div>
                            <div style={{ fontSize: "10px", color: "var(--muted-foreground)", whiteSpace: "nowrap", flexShrink: 0 }}>
                              {timeAgo(n.created_at)}
                            </div>
                          </div>
                          <div style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", marginTop: 3, lineHeight: 1.5 }}>
                            {n.body}
                          </div>
                          {n.action_url && (
                            <div style={{ fontSize: "10px", color: "var(--cs-orange)", fontWeight: 600, marginTop: 5 }}>
                              Tap to open →
                            </div>
                          )}
                        </div>

                        {/* Unread dot */}
                        {unread && (
                          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--cs-orange)", flexShrink: 0, marginTop: 5 }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <div ref={sentinelRef} style={{ height: 1 }} />
            {loadingMore && <div style={{ textAlign: "center", padding: "1rem", fontSize: "0.78rem", color: "var(--muted-foreground)" }}>Loading more…</div>}
            {!hasMore && notifs.length > 0 && <div style={{ textAlign: "center", padding: "1.5rem 0 0.5rem", fontSize: "0.75rem", color: "var(--muted-foreground)" }}>You&apos;re all caught up 🎉</div>}
          </>
        )}
      </div>
    </div>
  );
}
