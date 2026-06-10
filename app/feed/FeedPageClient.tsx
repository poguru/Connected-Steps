"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppNav from "@/components/layout/AppNav";
import ActivityFeed from "@/components/feed/ActivityFeed";
import type { MenuUser } from "@/components/ui/UserMenu";

type Scope = "global" | "following";

interface AppUser {
  email: string; firstName: string; lastName: string;
  phone?: string; goal?: string; location?: string; photo?: string | null;
}

export default function FeedPageClient() {
  const router = useRouter();
  const [user,  setUser]  = useState<AppUser | null>(null);
  const [scope, setScope] = useState<Scope>("global");

  useEffect(() => {
    const stored = localStorage.getItem("cs_user");
    if (!stored) { router.push("/auth"); return; }
    setUser(JSON.parse(stored) as AppUser);
  }, [router]);

  if (!user) return null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--foreground)" }}>
      <AppNav
        user={user as MenuUser}
        onUserUpdate={u => { setUser(u as AppUser); localStorage.setItem("cs_user", JSON.stringify(u)); }}
        activeLabel="Feed"
      />

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "calc(var(--nav-total) + 1.25rem) 1rem 4rem" }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: "1.25rem" }}>
          <h1
            className="font-display"
            style={{ fontSize: "clamp(1.5rem, 4vw, 1.9rem)", fontWeight: 700, letterSpacing: "-0.015em", marginBottom: 4 }}>
            Community Feed
          </h1>
          <p style={{ margin: 0, fontSize: "0.83rem", color: "var(--muted-foreground)" }}>
            Sessions, achievements, and photos from your running community.
          </p>
        </div>

        {/* ── Scope toggle ── */}
        <div style={{
          display: "flex", gap: 3, padding: 3,
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 10, marginBottom: "1.25rem",
        }}>
          {(["global", "following"] as Scope[]).map(s => (
            <button
              key={s}
              onClick={() => setScope(s)}
              style={{
                flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
                cursor: "pointer", fontFamily: "var(--font-body)",
                fontSize: "0.8rem", fontWeight: 600,
                background: scope === s ? "var(--gradient-accent)" : "transparent",
                color:      scope === s ? "#fff" : "var(--muted-foreground)",
                boxShadow:  scope === s ? "var(--shadow-orange)" : "none",
                transition: "all 0.15s",
              }}>
              {s === "global" ? "🌍 Everyone" : "👥 Following"}
            </button>
          ))}
        </div>

        {/* ── Feed ── */}
        {/*
          Key prop forces ActivityFeed to remount on scope change,
          resetting its internal state (events, cursor, loading).
        */}
        <ActivityFeed
          key={scope}
          currentUserEmail={user.email}
          scope={scope}
        />

      </div>
    </div>
  );
}
