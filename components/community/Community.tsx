"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { MenuUser } from "@/components/ui/UserMenu";
import AppNav from "@/components/layout/AppNav";
import ActivityFeed from "@/components/feed/ActivityFeed";
import PostCard from "@/components/community/PostCard";
import CreatePost from "@/components/community/CreatePost";
import type { UserPost } from "@/app/api/posts/route";
import { Avatar, Card, Chip, Button, Label, Tabs, SearchInput, EmptyState, Skeleton, color } from "@/components/ui/ds";

interface User   { firstName: string; lastName: string; email: string; phone: string; goal: string; location: string; photo: string | null; }
interface Runner { user_email: string; user_name: string; location: string; goal: string; total_points: number; month_points: number; }

type Tab = "discover" | "posts" | "activity";

const goalLabel: Record<string, string> = {
  "5k": "5K", "10k": "10K", "half": "Half Marathon", "full": "Full Marathon",
  "ultra": "Ultra", "fitness": "General Fitness", "speed": "Speed", "weight": "Weight Loss", "strength": "Strength",
};

function initials(name: string | null | undefined) { return (name ?? "").split(" ").map(n => n[0] ?? "").join("").slice(0, 2).toUpperCase() || "?"; }

// ── Runner card ───────────────────────────────────────────────────────────────

function RunnerCard({
  runner, isFollowing, busy, isSelf, onFollow,
}: {
  runner: Runner; isFollowing: boolean; busy: boolean; isSelf: boolean;
  onFollow: (email: string) => void;
}) {
  return (
    <Card style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <Avatar name={runner.user_name} size={42} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "0.875rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{runner.user_name}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" as const }}>
          <Chip label={`📍 ${runner.location}`} size="xs" color={color.textMuted} />
          <Chip label={`${runner.total_points ?? 0} pts`} size="xs" color={color.orange} />
          {runner.goal && <Chip label={`🎯 ${goalLabel[runner.goal] ?? runner.goal}`} size="xs" color={color.textMuted} />}
        </div>
      </div>
      {!isSelf && (
        <Button size="sm" variant={isFollowing ? "ghost" : "primary"} loading={busy}
          onClick={() => onFollow(runner.user_email)} style={{ flexShrink: 0 }}>
          {busy ? "…" : isFollowing ? "Following" : "Follow"}
        </Button>
      )}
    </Card>
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

  // Posts tab
  const [posts,        setPosts]        = useState<UserPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [showCreate,   setShowCreate]   = useState(false);

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
    let u: User;
    try { u = JSON.parse(stored); } catch { localStorage.removeItem("cs_user"); router.push("/auth"); return; }
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

  // Load posts when Posts tab is opened
  useEffect(() => {
    if (tab !== "posts" || !user || posts.length > 0) return;
    setPostsLoading(true);
    fetch(`/api/posts?scope=global&limit=20&email=${encodeURIComponent(user.email)}`)
      .then(r => r.json())
      .then(d => setPosts(d.posts ?? []))
      .catch(() => {})
      .finally(() => setPostsLoading(false));
  }, [tab, user, posts.length]);

  async function toggleFollow(targetEmail: string) {
    if (!user) return;
    setFollowBusy(prev => new Set(prev).add(targetEmail));
    try {
      const token = localStorage.getItem("cs_user_token") ?? "";
      const res  = await fetch("/api/follow", { method: "POST", headers: { "Content-Type": "application/json", "x-user-token": token }, body: JSON.stringify({ following_email: targetEmail }) });
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

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "var(--page-top-pad) 1.5rem var(--page-bottom-pad)" }}>

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
        <Tabs
          tabs={[{ key: "discover", label: "🔍 Discover" }, { key: "posts", label: "✍️ Posts" }, { key: "activity", label: "⚡ Activity" }]}
          active={tab} onChange={v => setTab(v as Tab)} variant="pill"
          style={{ marginBottom: "1.25rem" }} />

        {/* ── DISCOVER TAB ── */}
        {tab === "discover" && (
          <>
            <SearchInput
              value={query} placeholder="Search by name or location…"
              onChange={e => setQuery(e.target.value)}
              onClear={() => setQuery("")}
              loading={searching}
              style={{ marginBottom: "1rem" }} />

            <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: "0.75rem" }}>
              {searching ? "Searching…" : `${others.length} runner${others.length !== 1 ? "s" : ""} found`}
            </div>

            {!searching && following.length > 0 && !query && (
              <div style={{ marginBottom: "1.25rem" }}>
                <Label style={{ marginBottom: "0.5rem" }}>Following · {following.length}</Label>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {following.map(r => <RunnerCard key={r.user_email} runner={r} isFollowing={true} busy={followBusy.has(r.user_email)} isSelf={false} onFollow={toggleFollow} />)}
                </div>
              </div>
            )}

            <div>
              {!searching && (notFollowing.length > 0 || query) && (
                <Label style={{ color: color.textMuted, marginBottom: "0.5rem" }}>
                  {query ? `Results for "${query}"` : "Discover runners"}
                </Label>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {searching ? (
                  [1,2,3].map(i => <Skeleton key={i} height="68px" radius="12px" />)
                ) : (query ? others : notFollowing).length === 0 ? (
                  <EmptyState icon="🔍"
                    title={query ? "No runners found" : "No new runners to discover"}
                    body={query ? "Try a different name or location." : "Check back as more members join."}
                    style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }} />
                ) : (
                  (query ? others : notFollowing).map(r => <RunnerCard key={r.user_email} runner={r} isFollowing={followingSet.has(r.user_email)} busy={followBusy.has(r.user_email)} isSelf={r.user_email === user.email} onFollow={toggleFollow} />)
                )}
              </div>
            </div>
          </>
        )}

        {/* ── POSTS TAB ── */}
        {tab === "posts" && user && (
          <>
            {/* Compose button */}
            <Card hoverable onClick={() => setShowCreate(true)} style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1rem", cursor: "pointer" }}>
              <Avatar name={user.firstName} size={34} />
              <span style={{ fontSize: "0.85rem", color: "var(--muted-foreground)", flex: 1 }}>Share a run, achievement, or question…</span>
              <span style={{ fontSize: "0.75rem", color: color.orange, fontWeight: 700, flexShrink: 0 }}>Post</span>
            </Card>

            {postsLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                {[1,2,3].map(i => <Skeleton key={i} height="120px" radius="14px" />)}
              </div>
            ) : posts.length === 0 ? (
              <EmptyState icon="✍️" title="No posts yet"
                body="Be the first to share a run update, achievement, or question."
                action={<Button size="sm" onClick={() => setShowCreate(true)}>Create first post →</Button>}
                style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14 }} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {posts.map(p => (
                  <PostCard key={p.id} post={p} currentUserEmail={user.email}
                    onDeleted={id => setPosts(prev => prev.filter(x => x.id !== id))} />
                ))}
              </div>
            )}

            {/* CreatePost sheet */}
            {showCreate && (
              <CreatePost
                currentUserEmail={user.email}
                currentUserName={`${user.firstName} ${user.lastName}`.trim()}
                onPosted={post => { setPosts(prev => [post, ...prev]); setShowCreate(false); }}
                onClose={() => setShowCreate(false)}
              />
            )}
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
