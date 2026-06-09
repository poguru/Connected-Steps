"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { MenuUser } from "@/components/ui/UserMenu";
import AppNav from "@/components/layout/AppNav";

interface User   { firstName: string; lastName: string; email: string; phone: string; goal: string; location: string; photo: string | null; }
interface Runner { user_email: string; user_name: string; location: string; goal: string; total_points: number; month_points: number; }
interface FeedEvent {
  id: string; actor_email: string; actor_name: string;
  event_type: "session_attended" | "photo_uploaded" | "badge_earned";
  payload: Record<string, string | number>;
  created_at: string;
}

type Tab = "discover" | "activity";

const goalLabel: Record<string, string> = {
  "5k": "5K", "10k": "10K", "half": "Half Marathon", "full": "Full Marathon",
  "ultra": "Ultra", "fitness": "General Fitness", "speed": "Speed", "weight": "Weight Loss", "strength": "Strength",
};

function initials(name: string) { return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase(); }

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function feedCopy(ev: FeedEvent) {
  if (ev.event_type === "session_attended") return `ran ${ev.payload.session_title as string}`;
  if (ev.event_type === "photo_uploaded")   return "uploaded a photo";
  if (ev.event_type === "badge_earned")     return `earned the ${ev.payload.badge as string} badge`;
  return "was active";
}
function feedIcon(ev: FeedEvent) {
  if (ev.event_type === "session_attended") return "🏃";
  if (ev.event_type === "photo_uploaded")   return "📸";
  if (ev.event_type === "badge_earned")     return "🏅";
  return "⚡";
}

// ── Runner card with follow button ────────────────────────────────────────────
function RunnerCard({
  runner, isFollowing, busy, isSelf,
  onFollow,
}: {
  runner: Runner; isFollowing: boolean; busy: boolean; isSelf: boolean;
  onFollow: (email: string) => void;
}) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
      padding: "0.875rem 1rem", display: "flex", alignItems: "center", gap: "0.75rem",
    }}>
      <div style={{ width: 42, height: 42, borderRadius: "50%", background: "var(--gradient-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.85rem", fontWeight: 700, color: "#fff", flexShrink: 0 }}>
        {initials(runner.user_name)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "0.875rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{runner.user_name}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: "var(--surface-elevated)", color: "var(--muted-foreground)" }}>
            📍 {runner.location}
          </span>
          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: "oklch(0.72 0.19 49 / 8%)", color: "var(--cs-orange)", fontWeight: 600 }}>
            {runner.total_points ?? 0} pts
          </span>
          {runner.goal && (
            <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: "var(--surface-elevated)", color: "var(--muted-foreground)" }}>
              🎯 {goalLabel[runner.goal] ?? runner.goal}
            </span>
          )}
        </div>
      </div>
      {!isSelf && (
        <button
          onClick={() => onFollow(runner.user_email)}
          disabled={busy}
          style={{
            flexShrink: 0, padding: "6px 14px", borderRadius: 8, fontSize: "0.78rem", fontWeight: 600,
            cursor: busy ? "not-allowed" : "pointer", fontFamily: "var(--font-body)",
            border: "1px solid", transition: "all 0.15s", opacity: busy ? 0.6 : 1,
            background:  isFollowing ? "transparent" : "var(--gradient-accent)",
            color:       isFollowing ? "var(--muted-foreground)" : "#fff",
            borderColor: isFollowing ? "var(--border)" : "transparent",
          }}>
          {busy ? "…" : isFollowing ? "Following" : "Follow"}
        </button>
      )}
    </div>
  );
}

// ── Activity feed event row ───────────────────────────────────────────────────
function FeedRow({ event }: { event: FeedEvent }) {
  const photoUrl = event.payload.photo_url as string | undefined;
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", padding: "0.75rem 1rem" }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "oklch(0.72 0.19 49 / 15%)", border: "1px solid oklch(0.72 0.19 49 / 25%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 700, color: "var(--cs-orange)", flexShrink: 0 }}>
          {event.actor_name.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "0.82rem", color: "var(--foreground)", lineHeight: 1.4 }}>
            <span style={{ fontWeight: 700 }}>{event.actor_name.split(" ")[0]}</span>
            {"  "}{feedCopy(event)}
          </div>
          <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 2 }}>{timeAgo(event.created_at)}</div>
        </div>
        <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>{feedIcon(event)}</span>
        {photoUrl && (
          <button onClick={() => setExpanded(e => !e)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--muted-foreground)", fontFamily: "inherit", fontSize: "0.7rem" }}>
            {expanded ? "▲" : "▼"}
          </button>
        )}
      </div>
      {photoUrl && expanded && (
        <img src={photoUrl} alt="Activity" style={{ width: "100%", maxHeight: 240, objectFit: "cover", display: "block" }} />
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
  const [feedEvents,   setFeedEvents]   = useState<FeedEvent[]>([]);
  const [feedLoading,  setFeedLoading]  = useState(false);
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
    // Load following list
    fetch(`/api/follow?email=${encodeURIComponent(u.email)}&type=following`)
      .then(r => r.json())
      .then(d => setFollowingSet(new Set((d.users ?? []).map((x: { email: string }) => x.email))))
      .catch(() => {});
  }, [router, doSearch]);

  // Load feed when tab switches to activity
  useEffect(() => {
    if (tab !== "activity" || !user) return;
    if (feedEvents.length > 0) return; // already loaded
    setFeedLoading(true);
    fetch(`/api/feed?email=${encodeURIComponent(user.email)}`)
      .then(r => r.json())
      .then(d => setFeedEvents(d.events ?? []))
      .catch(() => {})
      .finally(() => setFeedLoading(false));
  }, [tab, user, feedEvents.length]);

  useEffect(() => {
    const t = setTimeout(() => doSearch(query), 300);
    return () => clearTimeout(t);
  }, [query, doSearch]);

  async function toggleFollow(targetEmail: string) {
    if (!user) return;
    setFollowBusy(prev => new Set(prev).add(targetEmail));
    try {
      const res  = await fetch("/api/follow", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ follower_email: user.email, following_email: targetEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        setFollowingSet(prev => {
          const next = new Set(prev);
          data.action === "followed" ? next.add(targetEmail) : next.delete(targetEmail);
          return next;
        });
      }
    } finally {
      setFollowBusy(prev => { const next = new Set(prev); next.delete(targetEmail); return next; });
    }
  }

  if (!user) return null;

  const others        = runners.filter(r => r.user_email !== user.email);
  const following     = runners.filter(r => followingSet.has(r.user_email) && r.user_email !== user.email);
  const notFollowing  = others.filter(r => !followingSet.has(r.user_email));

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--foreground)" }}>
      <AppNav
        user={user as MenuUser}
        onUserUpdate={u => { setUser(u as User); localStorage.setItem("cs_user", JSON.stringify(u)); }}
        activeLabel="Community"
      />

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "calc(var(--nav-total) + 1.5rem) 1.5rem 3rem" }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: "1.25rem" }}>
          <h1 className="font-display" style={{ fontSize: "clamp(1.6rem, 4vw, 2rem)", fontWeight: 700, letterSpacing: "-0.015em", marginBottom: 4 }}>Community</h1>
          <p style={{ fontSize: "0.85rem", color: "var(--muted-foreground)", margin: 0 }}>
            Find and follow runners in Hyderabad. See what the community is up to.
          </p>
        </div>

        {/* ── Summary strip ── */}
        <div style={{ display: "flex", gap: "1px", background: "var(--border)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: "1.25rem" }}>
          {[
            { val: others.length,        label: "Runners"  },
            { val: following.length,      label: "Following" },
            { val: notFollowing.length,   label: "Discover" },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: "var(--surface)", padding: "8px 12px", textAlign: "center" }}>
              <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--cs-orange)", letterSpacing: "-0.3px" }}>{s.val}</div>
              <div style={{ fontSize: 9, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: "flex", gap: 4, padding: 4, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, marginBottom: "1.25rem" }}>
          {(["discover", "activity"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
              fontFamily: "var(--font-body)", fontSize: "0.8rem", fontWeight: 600,
              background: tab === t ? "var(--gradient-accent)" : "transparent",
              color: tab === t ? "#fff" : "var(--muted-foreground)",
              boxShadow: tab === t ? "var(--shadow-orange)" : "none",
              transition: "all 0.15s",
            }}>
              {t === "discover" ? "🔍 Discover" : "⚡ Activity"}
            </button>
          ))}
        </div>

        {/* ── DISCOVER TAB ── */}
        {tab === "discover" && (
          <>
            {/* Search */}
            <div style={{ position: "relative", marginBottom: "1rem" }}>
              <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)" }} />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search by name or location…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                style={{
                  width: "100%", padding: "11px 36px 11px 38px",
                  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
                  color: "var(--foreground)", fontSize: "0.875rem", fontFamily: "var(--font-body)",
                  outline: "none", boxSizing: "border-box",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = "oklch(0.72 0.19 49 / 60%)"; }}
                onBlur={e  => { e.currentTarget.style.borderColor = "var(--border)"; }}
              />
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

            {/* Following runners first, then discover */}
            {!searching && following.length > 0 && !query && (
              <div style={{ marginBottom: "1.25rem" }}>
                <div style={{ fontSize: 10, color: "var(--cs-orange)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: "0.5rem" }}>
                  Following · {following.length}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {following.map(r => (
                    <RunnerCard key={r.user_email} runner={r} isFollowing={true} busy={followBusy.has(r.user_email)} isSelf={false} onFollow={toggleFollow} />
                  ))}
                </div>
              </div>
            )}

            {/* Discover / search results */}
            <div>
              {!searching && (notFollowing.length > 0 || query) && (
                <div style={{ fontSize: 10, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, marginBottom: "0.5rem" }}>
                  {query ? `Results for "${query}"` : "Discover runners"}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {searching ? (
                  [1,2,3].map(i => (
                    <div key={i} style={{ height: 68, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)", opacity: 0.6 }} />
                  ))
                ) : (query ? others : notFollowing).length === 0 ? (
                  <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "2rem", textAlign: "center" }}>
                    <div style={{ fontSize: "1.75rem", marginBottom: 8 }}>🔍</div>
                    <div style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: 4 }}>
                      {query ? "No runners found" : "No new runners to discover"}
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>
                      {query ? "Try a different name or location." : "Check back as more members join."}
                    </div>
                  </div>
                ) : (
                  (query ? others : notFollowing).map(r => (
                    <RunnerCard key={r.user_email} runner={r} isFollowing={followingSet.has(r.user_email)} busy={followBusy.has(r.user_email)} isSelf={r.user_email === user.email} onFollow={toggleFollow} />
                  ))
                )}
              </div>
            </div>
          </>
        )}

        {/* ── ACTIVITY TAB ── */}
        {tab === "activity" && (
          <>
            {feedLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                {[1,2,3,4].map(i => (
                  <div key={i} style={{ height: 72, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)", opacity: 0.6 }} />
                ))}
              </div>
            ) : feedEvents.length === 0 ? (
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "2rem", textAlign: "center" }}>
                <div style={{ fontSize: "1.75rem", marginBottom: 8 }}>⚡</div>
                <div style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: 4 }}>No community activity yet</div>
                <div style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
                  Follow runners to see their sessions, photos, and badges here.
                </div>
                <button onClick={() => setTab("discover")} style={{ padding: "8px 20px", background: "var(--gradient-accent)", color: "#fff", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: "0.8rem", fontWeight: 700, boxShadow: "var(--shadow-orange)" }}>
                  Discover runners →
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                {feedEvents.map(ev => <FeedRow key={ev.id} event={ev} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
