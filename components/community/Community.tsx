"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { MenuUser } from "@/components/ui/UserMenu";
import AppNav from "@/components/layout/AppNav";
import ActivityFeed from "@/components/feed/ActivityFeed";

interface User   { firstName: string; lastName: string; email: string; phone: string; goal: string; location: string; photo: string | null; }
interface Runner { user_email: string; user_name: string; location: string; goal: string; total_points: number; month_points: number; }

type Tab = "discover" | "activity";

const goalLabel: Record<string, string> = {
  "5k": "5K", "10k": "10K", "half": "Half Marathon", "full": "Full Marathon",
  "ultra": "Ultra", "fitness": "General Fitness", "speed": "Speed", "weight": "Weight Loss", "strength": "Strength",
};

function initials(name: string) { return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase(); }

// ── Runner card ───────────────────────────────────────────────────────────────

function RunnerCard({
  runner, isFollowing, busy, isSelf, onFollow,
}: {
  runner: Runner; isFollowing: boolean; busy: boolean; isSelf: boolean;
  onFollow: (email: string) => void;
}) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "0.875rem 1rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <div style={{ width: 42, height: 42, borderRadius: "50%", background: "var(--gradient-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.85rem", fontWeight: 700, color: "#fff", flexShrink: 0 }}>
        {initials(runner.user_name)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "0.875rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{runner.user_name}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: "var(--surface-elevated)", color: "var(--muted-foreground)" }}>📍 {runner.location}</span>
          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: "oklch(0.72 0.19 49 / 8%)", color: "var(--cs-orange)", fontWeight: 600 }}>{runner.total_points ?? 0} pts</span>
          {runner.goal && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: "var(--surface-elevated)", color: "var(--muted-foreground)" }}>🎯 {goalLabel[runner.goal] ?? runner.goal}</span>}
        </div>
      </div>
      {!isSelf && (
        <button onClick={() => onFollow(runner.user_email)} disabled={busy} style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 8, fontSize: "0.78rem", fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", fontFamily: "var(--font-body)", border: "1px solid", transition: "all 0.15s", opacity: busy ? 0.6 : 1, background: isFollowing ? "transparent" : "var(--gradient-accent)", color: isFollowing ? "var(--muted-foreground)" : "#fff", borderColor: isFollowing ? "var(--border)" : "transparent" }}>
          {busy ? "…" : isFollowing ? "Following" : "Follow"}
        </button>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Community() {
  const router = useRouter();
  const [user,         setUser]         = useState<User | null>(null);
  const [tab,          setTab]          = useState<Tab>("discover");
  const [query,        setQuery]        = useState("");
  const [runners,      setRunners]      = useState<Runner[]>([]);
  const [searching,    setSearching]    = useState(false);
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [followBusy,   setFollowBusy]   = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(async (q: string) => {
    setSearching(true);
    try {
      const res  = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.users) setRunners(data.users);
    } finally { setSearching(false); }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("cs_user");
    if (!stored) { router.push("/auth"); return; }
    const u: User = JSON.parse(stored);
    setUser(u);
    doSearch("");
    fetch(`/api/follow?email=${encodeURIComponent(u.email)}&type=following`)
      .then(r => r.json())
      .then(d => setFollowingSet(new Set((d.users ?? []).map((x: { email: string }) => x.email))))
      .catch(() => {});
  }, [router, doSearch]);

  useEffect(() => {
    const t = setTimeout(() => doSearch(query), 300);
    return () => clearTimeout(t);
  }, [query, doSearch]);

  async function toggleFollow(targetEmail: string) {
    if (!user) return;
    setFollowBusy(prev => new Set(prev).add(targetEmail));
    try {
      const res  = await fetch("/api/follow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ follower_email: user.email, following_email: targetEmail }) });
      const data = await res.json();
      if (res.ok) setFollowingSet(prev => { const n = new Set(prev); data.action === "followed" ? n.add(targetEmail) : n.delete(targetEmail); return n; });
    } finally {
      setFollowBusy(prev => { const n = new Set(prev); n.delete(targetEmail); return n; });
    }
  }

  if (!user) return null;

  const others       = runners.filter(r => r.user_email !== user.email);
  const following    = runners.filter(r => followingSet.has(r.user_email) && r.user_email !== user.email);
  const notFollowing = others.filter(r => !followingSet.has(r.user_email));

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--foreground)" }}>
      <AppNav user={user as MenuUser} onUserUpdate={u => { setUser(u as User); localStorage.setItem("cs_user", JSON.stringify(u)); }} activeLabel="Community" />

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "calc(var(--nav-total) + 1.5rem) 1.5rem 3rem" }}>

        {/* Header */}
        <div style={{ marginBottom: "1.25rem" }}>
          <h1 className="font-display" style={{ fontSize: "clamp(1.6rem, 4vw, 2rem)", fontWeight: 700, letterSpacing: "-0.015em", marginBottom: 4 }}>Community</h1>
          <p style={{ fontSize: "0.85rem", color: "var(--muted-foreground)", margin: 0 }}>Find runners, follow their sessions, and celebrate together.</p>
        </div>

        {/* Summary strip */}
        <div style={{ display: "flex", gap: "1px", background: "var(--border)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: "1.25rem" }}>
          {[{ val: others.length, label: "Runners" }, { val: following.length, label: "Following" }, { val: notFollowing.length, label: "Discover" }].map(s => (
            <div key={s.label} style={{ flex: 1, background: "var(--surface)", padding: "8px 12px", textAlign: "center" }}>
              <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--cs-orange)", letterSpacing: "-0.3px" }}>{s.val}</div>
              <div style={{ fontSize: 9, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, padding: 4, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, marginBottom: "1.25rem" }}>
          {(["discover", "activity"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: "0.8rem", fontWeight: 600, background: tab === t ? "var(--gradient-accent)" : "transparent", color: tab === t ? "#fff" : "var(--muted-foreground)", boxShadow: tab === t ? "var(--shadow-orange)" : "none", transition: "all 0.15s" }}>
              {t === "discover" ? "🔍 Discover" : "⚡ Activity"}
            </button>
          ))}
        </div>

        {/* ── DISCOVER TAB ── */}
        {tab === "discover" && (
          <>
            <div style={{ position: "relative", marginBottom: "1rem" }}>
              <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)" }} />
              <input ref={inputRef} type="text" placeholder="Search by name or location…" value={query} onChange={e => setQuery(e.target.value)}
                style={{ width: "100%", padding: "11px 36px 11px 38px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)", fontSize: "0.875rem", fontFamily: "var(--font-body)", outline: "none", boxSizing: "border-box" }}
                onFocus={e => { e.currentTarget.style.borderColor = "oklch(0.72 0.19 49 / 60%)"; }}
                onBlur={e  => { e.currentTarget.style.borderColor = "var(--border)"; }} />
              {query && (
                <button onClick={() => { setQuery(""); inputRef.current?.focus(); }}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--muted-foreground)", cursor: "pointer", display: "flex", padding: 0 }}>
                  <X size={15} />
                </button>
              )}
            </div>

            <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: "0.75rem" }}>
              {searching ? "Searching…" : `${others.length} runner${others.length !== 1 ? "s" : ""} found`}
            </div>

            {!searching && following.length > 0 && !query && (
              <div style={{ marginBottom: "1.25rem" }}>
                <div style={{ fontSize: 10, color: "var(--cs-orange)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: "0.5rem" }}>Following · {following.length}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {following.map(r => <RunnerCard key={r.user_email} runner={r} isFollowing={true} busy={followBusy.has(r.user_email)} isSelf={false} onFollow={toggleFollow} />)}
                </div>
              </div>
            )}

            <div>
              {!searching && (notFollowing.length > 0 || query) && (
                <div style={{ fontSize: 10, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, marginBottom: "0.5rem" }}>
                  {query ? `Results for "${query}"` : "Discover runners"}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {searching ? (
                  [1,2,3].map(i => <div key={i} style={{ height: 68, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)", opacity: 0.6 }} />)
                ) : (query ? others : notFollowing).length === 0 ? (
                  <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "2rem", textAlign: "center" }}>
                    <div style={{ fontSize: "1.75rem", marginBottom: 8 }}>🔍</div>
                    <div style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: 4 }}>{query ? "No runners found" : "No new runners to discover"}</div>
                    <div style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>{query ? "Try a different name or location." : "Check back as more members join."}</div>
                  </div>
                ) : (
                  (query ? others : notFollowing).map(r => <RunnerCard key={r.user_email} runner={r} isFollowing={followingSet.has(r.user_email)} busy={followBusy.has(r.user_email)} isSelf={r.user_email === user.email} onFollow={toggleFollow} />)
                )}
              </div>
            </div>
          </>
        )}

        {/* ── ACTIVITY TAB — uses ActivityFeed ── */}
        {tab === "activity" && user && (
          <ActivityFeed
            currentUserEmail={user.email}
            scope="following"
            onDiscoverClick={() => setTab("discover")}
          />
        )}

      </div>
    </div>
  );
}
