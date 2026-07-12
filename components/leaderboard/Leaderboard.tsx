"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { TrendingUp, X } from "lucide-react";
import { MenuUser } from "@/components/ui/UserMenu";
import AppNav from "@/components/layout/AppNav";
import { getSupabaseSafe } from "@/lib/supabase";
import { Avatar, Tabs, Chip, Button, Select, EmptyState, Skeleton, color } from "@/components/ui/ds";

interface User  { firstName: string; lastName: string; email: string; phone: string; photo: string | null; goal: string; location: string; }
interface Entry {
  id: string; user_email: string | null; user_name: string; location: string; goal: string;
  month_points: number; total_points: number; week_points: number; photo: string | null;
  is_me?: boolean;
}

type TimeTab = "week" | "month" | "all";

const GOAL_LABELS: Record<string, string> = {
  "5k": "5K", "10k": "10K", "half": "Half Marathon", "full": "Full Marathon",
  "ultra": "Ultra", "fitness": "General Fitness", "speed": "Speed", "weight": "Weight Loss", "strength": "Strength",
};

const MEDAL_COLORS = [
  { bg: "#f6cc4a", text: "#5a3a00" },  // gold
  { bg: "#c0c7d4", text: "#3d4049" },  // silver
  { bg: "#d4845a", text: "#5a2a0a" },  // bronze
];
// display order: #2 left, #1 center, #3 right
const PODIUM_IDX = [1, 0, 2];
const PLATFORM_H = [44, 76, 30]; // heights for display positions 0/1/2
const PODIUM_COLORS = [
  { border: "rgba(252,211,77,0.45)",  bg: "oklch(0.85 0.15 95 / 7%)",  plat: "oklch(0.75 0.15 95 / 18%)" },
  { border: "rgba(210,214,220,0.35)", bg: "rgba(255,255,255,0.03)",     plat: "rgba(210,214,220,0.10)" },
  { border: "rgba(251,146,60,0.38)",  bg: "oklch(0.72 0.19 49 / 5%)",  plat: "oklch(0.72 0.19 49 / 13%)" },
];

function initials(name: string | null | undefined) {
  return (name ?? "").split(" ").map(n => n[0] ?? "").join("").slice(0, 2).toUpperCase() || "?";
}

function ptsKey(tab: TimeTab): "week_points" | "month_points" | "total_points" {
  if (tab === "week") return "week_points";
  if (tab === "month") return "month_points";
  return "total_points";
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Leaderboard() {
  const router = useRouter();
  const [user,         setUser]         = useState<User | null>(null);
  const [entries,      setEntries]      = useState<Entry[]>([]);
  const [tab,          setTab]          = useState<TimeTab>("month");
  const [loading,      setLoading]      = useState(true);
  const [locFilter,    setLocFilter]    = useState("All");
  const [locationScope, setLocationScope] = useState<"all" | "my">("all");
  const [myLocationId,  setMyLocationId]  = useState<string | null>(null);
  const [myLocationName,setMyLocationName]= useState<string | null>(null);
  const [goalFilter,   setGoalFilter]   = useState("All");
  const [live,         setLive]         = useState(false);
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [followBusy,   setFollowBusy]   = useState<Set<string>>(new Set());
  const [preview,      setPreview]      = useState<Entry | null>(null);
  const [visibleCount, setVisibleCount] = useState(47); // 3 podium + 47 = 50 total visible
  const [viewMode,     setViewMode]     = useState<"overall" | "location">("overall");

  const tabRef     = useRef(tab);
  const liveRef    = useRef(false);
  const rawRef     = useRef<Entry[]>([]); // cached raw entries so tab switches don't re-fetch
  useEffect(() => { tabRef.current = tab; }, [tab]);

  // Lock body scroll while the profile sheet is open
  useEffect(() => {
    if (preview) {
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";
    } else {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    };
  }, [preview]);

  const authHeaders = (): Record<string, string> => {
    const tok = typeof window !== "undefined" ? (localStorage.getItem("cs_user_token") ?? "") : "";
    return tok ? { "x-user-token": tok } : {};
  };

  const fetchLeaderboard = useCallback(() => {
    fetch("/api/leaderboard", { headers: authHeaders() })
      .then(r => r.json())
      .then(d => {
        if (d.entries) {
          rawRef.current = d.entries;
          const key = ptsKey(tabRef.current);
          setEntries([...d.entries].sort((a: Entry, b: Entry) => (b[key] ?? 0) - (a[key] ?? 0)));
        }
      })
      .catch(() => {});
  }, []);

  // Fetch user's training location on mount (for "My Location" scope)
  useEffect(() => {
    const tok = typeof window !== "undefined" ? (localStorage.getItem("cs_user_token") ?? "") : "";
    if (!tok) return;
    fetch("/api/user/location", { headers: { "x-user-token": tok } })
      .then(r => r.json())
      .then(d => {
        const primary = (d.locations ?? []).find((l: { is_primary: boolean }) => l.is_primary) ?? d.locations?.[0];
        if (primary?.training_locations) {
          setMyLocationId(primary.training_locations.id);
          setMyLocationName(primary.training_locations.name);
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch leaderboard — re-fetches when scope changes
  const fetchWithScope = useCallback((scope: "all" | "my") => {
    setLoading(true);
    const locParam = scope === "my" && myLocationId ? `?location_id=${myLocationId}` : "";
    fetch(`/api/leaderboard${locParam}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => {
        if (d.entries) {
          rawRef.current = d.entries;
          const key = ptsKey(tabRef.current);
          setEntries([...d.entries].sort((a: Entry, b: Entry) => (b[key] ?? 0) - (a[key] ?? 0)));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [myLocationId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (locationScope === "my" && myLocationId) fetchWithScope("my"); }, [locationScope, myLocationId]); // eslint-disable-line

  // Fetch once on mount — do NOT re-fetch on tab change
  useEffect(() => {
    setLoading(true);
    fetch("/api/leaderboard", { headers: authHeaders() })
      .then(r => r.json())
      .then(d => {
        if (d.entries) {
          rawRef.current = d.entries;
          const key = ptsKey(tabRef.current);
          setEntries([...d.entries].sort((a: Entry, b: Entry) => (b[key] ?? 0) - (a[key] ?? 0)));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Tab change: re-sort already-fetched data — no network request
  useEffect(() => {
    if (rawRef.current.length > 0) {
      const key = ptsKey(tab);
      setEntries([...rawRef.current].sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0)));
    }
    setVisibleCount(47);
  }, [tab]);

  // Reset visible count when filters change
  useEffect(() => { setVisibleCount(47); }, [locFilter, goalFilter]);

  useEffect(() => {
    const supabase = getSupabaseSafe();
    if (!supabase) return;
    const channel = supabase
      .channel("leaderboard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "leaderboard" }, (payload) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { eventType, new: newRow } = payload as any;
        if (eventType !== "UPDATE") { fetchLeaderboard(); return; }
        setEntries(prev => {
          const idx = prev.findIndex(e => e.id === newRow?.id);
          if (idx === -1) { fetchLeaderboard(); return prev; }
          const updated = [...prev];
          updated[idx] = { ...updated[idx], ...newRow, user_email: updated[idx].user_email, photo: updated[idx].photo };
          const key = ptsKey(tabRef.current);
          return [...updated].sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0));
        });
      })
      .subscribe(status => {
        if (status === "SUBSCRIBED") {
          if (liveRef.current) fetchLeaderboard();
          liveRef.current = true;
          setLive(true);
        }
      });
    return () => { supabase.removeChannel(channel); };
  }, [fetchLeaderboard]);

  useEffect(() => {
    const stored = localStorage.getItem("cs_user");
    if (!stored) { router.push("/auth?redirect=/leaderboard"); return; }
    let u: User;
    try { u = JSON.parse(stored); } catch { localStorage.removeItem("cs_user"); router.push("/auth"); return; }
    setUser(u);
    fetch(`/api/follow?email=${encodeURIComponent(u.email)}&type=following`)
      .then(r => r.json())
      .then(d => setFollowingSet(new Set((d.users ?? []).map((x: { email: string }) => x.email))))
      .catch(() => {});
  }, [router]);

  async function toggleFollow(targetEmail: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!user) return;
    setFollowBusy(prev => new Set(prev).add(targetEmail));
    try {
      const token = localStorage.getItem("cs_user_token") ?? "";
      const res  = await fetch("/api/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-token": token },
        body: JSON.stringify({ following_email: targetEmail }),
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

  const key       = ptsKey(tab);
  const locations = ["All", ...Array.from(new Set(entries.map(e => e.location).filter(l => l && !l.includes("@")))).sort()];
  const goals     = ["All", ...Array.from(new Set(entries.map(e => e.goal).filter(Boolean))).sort()];

  // By-location grouping (uses all entries, ignores locFilter when in location view)
  const locationGroups = (() => {
    const map = new Map<string, Entry[]>();
    for (const e of entries) {
      const loc = (e.location || "Unknown").trim();
      if (!map.has(loc)) map.set(loc, []);
      map.get(loc)!.push(e);
    }
    return [...map.entries()]
      .map(([loc, members]) => ({
        loc,
        members: members.sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0)),
        total:   members.reduce((s, m) => s + (m[key] ?? 0), 0),
      }))
      .sort((a, b) => b.total - a.total);
  })();

  let filtered = entries;
  if (locFilter  !== "All") filtered = filtered.filter(e => e.location === locFilter);
  if (goalFilter !== "All") filtered = filtered.filter(e => e.goal === goalFilter);

  const ranks: number[] = [];
  for (let i = 0; i < filtered.length; i++) {
    if (i === 0) { ranks.push(1); continue; }
    ranks.push((filtered[i][key] ?? 0) === (filtered[i - 1][key] ?? 0) ? ranks[i - 1] : ranks[i - 1] + 1);
  }

  const myIndex        = filtered.findIndex(e => e.is_me || (e.user_email && e.user_email === user.email));
  const myRank         = myIndex >= 0 ? ranks[myIndex] : null;
  const myEntry        = myIndex >= 0 ? filtered[myIndex] : null;
  const podium         = filtered.slice(0, 3);
  const rest           = filtered.slice(3);
  const restVisible    = rest.slice(0, visibleCount);
  const showLoadMore   = rest.length > visibleCount;
  const showStickyRank = myRank !== null && myRank > 10;

  function followBtn(email: string | null, compact = false) {
    if (!email) return null;
    const isFollowing = followingSet.has(email);
    const busy        = followBusy.has(email);
    return (
      <Button
        size={compact ? "xs" : "sm"}
        variant={isFollowing ? "ghost" : "primary"}
        loading={busy}
        onClick={e => { e.stopPropagation(); toggleFollow(email); }}
        style={{ whiteSpace: "nowrap" }}>
        {busy ? "…" : isFollowing ? "Following" : "Follow"}
      </Button>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--foreground)" }}>
      <AppNav
        user={user as MenuUser}
        onUserUpdate={u => { setUser(u as User); localStorage.setItem("cs_user", JSON.stringify(u)); }}
        activeLabel="Leaderboard"
      />

      <div style={{ maxWidth: 860, margin: "0 auto", padding: `var(--page-top-pad) 1.5rem ${showStickyRank ? "6rem" : "var(--page-bottom-pad)"}` }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <h1 className="font-display" style={{ fontSize: "clamp(1.6rem, 4vw, 2rem)", fontWeight: 700, letterSpacing: "-0.015em", margin: 0 }}>
              Leaderboard
            </h1>
            {live && <Chip label="● Live" color={color.success} size="xs" />}
          </div>
          <p style={{ fontSize: "0.85rem", color: "var(--muted-foreground)", margin: 0 }}>
            Earn points by attending sessions — the more you show up, the higher you climb.
          </p>
        </div>

        {/* ── Summary strip ── */}
        <div style={{ display: "flex", gap: "1px", background: "var(--border)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: "1.25rem" }}>
          {[
            { val: filtered.length,                                             label: "Runners" },
            { val: myRank ? `#${myRank}` : "—",                                label: "Your rank" },
            { val: filtered.filter(e => e.user_email != null && followingSet.has(e.user_email)).length, label: "Following" },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: "var(--surface)", padding: "8px 12px", textAlign: "center" }}>
              <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--cs-orange)", letterSpacing: "-0.3px" }}>{s.val}</div>
              <div style={{ fontSize: 9, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Time tabs ── */}
        <Tabs
          tabs={[{ key: "week", label: "This Week" }, { key: "month", label: "This Month" }, { key: "all", label: "All Time" }]}
          active={tab} onChange={v => setTab(v as TimeTab)} variant="pill"
          style={{ marginBottom: "1rem" }} />

        {/* ── View mode: Overall vs By Location ── */}
        <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: 3, marginBottom: "1rem", width: "fit-content" }}>
          {(["overall", "location"] as const).map(v => (
            <button key={v} type="button" onClick={() => setViewMode(v)}
              style={{ padding: "6px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600, background: viewMode === v ? "var(--cs-orange)" : "transparent", color: viewMode === v ? "#fff" : "var(--muted-foreground)", fontFamily: "var(--font-body)", transition: "all 0.15s" }}>
              {v === "overall" ? "Overall" : "By Location"}
            </button>
          ))}
        </div>

        {/* ── Training location scope: My Location vs All (overall only) ── */}
        {myLocationId && viewMode === "overall" && (
          <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: 3, marginBottom: "1rem", width: "fit-content" }}>
            {(["all","my"] as const).map(s => (
              <button key={s} type="button" onClick={() => { setLocationScope(s); if (s==="all") fetchWithScope("all"); else if (myLocationId) fetchWithScope("my"); }}
                style={{ padding: "6px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600, background: locationScope===s ? "var(--cs-orange)" : "transparent", color: locationScope===s ? "#fff" : "var(--muted-foreground)", fontFamily: "var(--font-body)" }}>
                {s === "all" ? "🌍 All" : `📍 ${myLocationName ?? "My Location"}`}
              </button>
            ))}
          </div>
        )}

        {/* ── Goal + location filters (overall only) ── */}
        {viewMode === "overall" && (goals.length > 2 || locations.length > 2) && (
          <div style={{ display: "flex", gap: 8, marginBottom: "1.5rem", flexWrap: "wrap" as const }}>
            {goals.length > 2 && (
              <Select value={goalFilter} onChange={e => setGoalFilter(e.target.value)} style={{ flex: 1, minWidth: 120 }}>
                {goals.map(g => <option key={g} value={g}>{g === "All" ? "All goals" : GOAL_LABELS[g] ?? g}</option>)}
              </Select>
            )}
            {locations.length > 2 && (
              <Select value={locFilter} onChange={e => setLocFilter(e.target.value)} style={{ flex: 1, minWidth: 120 }}>
                {locations.map(l => <option key={l} value={l}>{l === "All" ? "All locations" : l}</option>)}
              </Select>
            )}
          </div>
        )}

        {/* ── Loading skeleton ── */}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} height="72px" radius="12px" />
            ))}
          </div>
        )}

        {!loading && viewMode === "location" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1rem" }}>
            {locationGroups.length === 0 && (
              <EmptyState icon="📍" title="No location data" body="Runners without a training location won't appear here." style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }} />
            )}
            {locationGroups.map((group, gi) => {
              const myGroup = group.members.some(m => m.user_email === user?.email);
              return (
                <div key={group.loc} style={{ background: "var(--surface)", border: `1px solid ${myGroup ? "oklch(0.72 0.19 49 / 35%)" : "var(--border)"}`, borderRadius: 14, overflow: "hidden" }}>
                  {/* Group header */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.875rem 1rem", background: gi === 0 ? "oklch(0.72 0.19 49 / 6%)" : "transparent", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: "1rem" }}>{gi === 0 ? "🥇" : gi === 1 ? "🥈" : gi === 2 ? "🥉" : "📍"}</span>
                      <div>
                        <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--foreground)" }}>{group.loc}</div>
                        <div style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: 1 }}>{group.members.length} runner{group.members.length !== 1 ? "s" : ""}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--cs-orange)" }}>{group.total}</div>
                      <div style={{ fontSize: 9, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em" }}>GROUP PTS</div>
                    </div>
                  </div>
                  {/* Members */}
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {group.members.map((m, mi) => {
                      const isMe = m.user_email === user?.email;
                      return (
                        <div key={m.id} onClick={() => setPreview(m)}
                          style={{ display: "flex", alignItems: "center", gap: "0.65rem", padding: "0.65rem 1rem", borderTop: mi === 0 ? "none" : "1px solid var(--border)", cursor: "pointer", background: isMe ? "oklch(0.72 0.19 49 / 4%)" : "transparent" }}>
                          <div style={{ width: 24, textAlign: "center", fontFamily: "monospace", fontSize: "0.78rem", fontWeight: 700, color: mi < 3 ? "var(--cs-orange)" : "var(--muted-foreground)", flexShrink: 0 }}>
                            {mi === 0 ? "🥇" : mi === 1 ? "🥈" : mi === 2 ? "🥉" : `#${mi + 1}`}
                          </div>
                          <Avatar src={m.photo} name={m.user_name} size={34} style={{ border: isMe ? "2px solid var(--cs-orange)" : "2px solid transparent", flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: "0.82rem", fontWeight: 600, color: isMe ? "var(--cs-orange)" : "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {m.user_name}{isMe ? " (you)" : ""}
                            </div>
                          </div>
                          <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--cs-orange)", flexShrink: 0 }}>{m[key] ?? 0} <span style={{ fontSize: 9, color: "var(--muted-foreground)", fontWeight: 400 }}>pts</span></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && viewMode === "overall" && (
          <>
            {/* ── Podium (top 3) ── */}
            {podium.length >= 3 && (
              <div style={{ marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
                  {PODIUM_IDX.map((entryIdx, displayPos) => {
                    const r         = podium[entryIdx];
                    const rank      = entryIdx + 1;
                    const isMe      = r.is_me || (r.user_email != null && r.user_email === user.email);
                    const colors    = PODIUM_COLORS[entryIdx];
                    const platformH = PLATFORM_H[displayPos];
                    const isFirst   = rank === 1;

                    return (
                      <div key={r.user_email} style={{ flex: 1, display: "flex", flexDirection: "column", cursor: "pointer" }}
                        onClick={() => setPreview(r)}>
                        {/* Card */}
                        <div style={{
                          background: isMe ? "oklch(0.72 0.19 49 / 8%)" : colors.bg,
                          border: `1px solid ${isMe ? "oklch(0.72 0.19 49 / 40%)" : colors.border}`,
                          borderBottom: "none",
                          borderRadius: "12px 12px 0 0",
                          padding: isFirst ? "1rem 0.75rem" : "0.875rem 0.625rem",
                          textAlign: "center",
                          display: "flex", flexDirection: "column", alignItems: "center",
                        }}>
                          <div style={{
                            width: isFirst ? 26 : 22, height: isFirst ? 26 : 22,
                            borderRadius: "50%",
                            background: MEDAL_COLORS[entryIdx].bg,
                            color: MEDAL_COLORS[entryIdx].text,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: isFirst ? "0.8rem" : "0.68rem", fontWeight: 800,
                            marginBottom: 6, flexShrink: 0,
                          }}>#{rank}</div>
                          <Avatar src={r.photo} name={r.user_name}
                            size={isFirst ? 54 : 42}
                            style={{ border: `2px solid ${isMe ? color.orange : colors.border}` }}
                          />
                          <div style={{ marginTop: 6, fontSize: isFirst ? "0.875rem" : "0.78rem", fontWeight: 700, color: isMe ? "var(--cs-orange)" : "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                            {(r.user_name ?? "Runner").split(" ")[0]}{isMe ? " ★" : ""}
                          </div>
                          <div style={{ fontSize: isFirst ? "1.1rem" : "0.95rem", fontWeight: 800, color: "var(--cs-orange)", letterSpacing: "-0.3px", marginTop: 2 }}>
                            {r[key] ?? 0}
                          </div>
                          <div style={{ fontSize: 9, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: isMe ? 0 : 8 }}>pts</div>
                          {!isMe && followBtn(r.user_email, true)}
                        </div>
                        {/* Platform base */}
                        <div style={{ height: platformH, background: colors.plat, border: `1px solid ${colors.border}`, borderTop: "none", borderRadius: "0 0 6px 6px" }} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Rank list (4+) ── */}
            {rest.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
                {restVisible.map((r, i) => {
                  const rank = ranks[i + 3];
                  const isMe = r.user_email === user.email;

                  return (
                    <div key={r.id} onClick={() => setPreview(r)}
                      style={{
                        background: "var(--surface)",
                        border: `1px solid ${isMe ? "oklch(0.72 0.19 49 / 35%)" : "var(--border)"}`,
                        borderRadius: 12,
                        padding: "0.875rem 1rem",
                        display: "flex", alignItems: "center", gap: "0.75rem",
                        cursor: "pointer", transition: "border-color 0.15s",
                      }}>
                      <div style={{ width: 28, flexShrink: 0, fontFamily: "monospace", fontSize: "0.82rem", fontWeight: 700, color: isMe ? "var(--cs-orange)" : "var(--muted-foreground)", textAlign: "center" }}>
                        #{rank}
                      </div>
                      <Avatar src={r.photo} name={r.user_name} size={42} style={{ border: isMe ? `2px solid ${color.orange}` : "2px solid transparent" }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "0.875rem", fontWeight: 600, color: isMe ? "var(--cs-orange)" : "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.user_name}{isMe ? " (you)" : ""}
                        </div>
                        <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                          {r.location && <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>📍 {r.location}</span>}
                          {r.goal && <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>🎯 {GOAL_LABELS[r.goal] ?? r.goal}</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: "0.9rem", fontWeight: 800, color: "var(--cs-orange)", letterSpacing: "-0.3px" }}>{r[key] ?? 0}</div>
                          <div style={{ fontSize: 9, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em" }}>pts</div>
                        </div>
                        {!isMe && followBtn(r.user_email)}
                      </div>
                    </div>
                  );
                })}

                {showLoadMore && (
                  <Button variant="secondary" fullWidth
                    onClick={() => setVisibleCount(c => c + 50)}
                    style={{ marginTop: "0.25rem" }}>
                    Show {Math.min(50, rest.length - visibleCount)} more runners
                  </Button>
                )}
              </div>
            )}

            {filtered.length === 0 && (
              <EmptyState icon="🏃" title="No runners found"
                body="Try adjusting the filters above."
                style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }} />
            )}

            {filtered.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "0.5rem" }}>
                <TrendingUp size={13} style={{ color: "var(--accent)" }} />
                Attend sessions to earn points and climb the ranks.
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Sticky "Your Rank" strip ── */}
      {!loading && showStickyRank && myEntry && (
        <div className="cs-lb-sticky-rank">
          <div style={{ maxWidth: 860, margin: "0 auto" }}>
            <div style={{
              background: "var(--surface)",
              border: "1px solid oklch(0.72 0.19 49 / 40%)",
              borderRadius: 12,
              padding: "0.75rem 1rem",
              display: "flex", alignItems: "center", gap: "0.75rem",
              boxShadow: "0 -4px 24px rgba(0,0,0,0.5)",
            }}>
              <div style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0 }}>Your rank</div>
              <div style={{ fontFamily: "monospace", fontSize: "1.1rem", fontWeight: 800, color: "var(--cs-orange)", flexShrink: 0 }}>#{myRank}</div>
              <Avatar src={myEntry.photo} name={myEntry.user_name} size={32} style={{ border: `2px solid ${color.orange}` }} />
              <div style={{ flex: 1, minWidth: 0, fontSize: "0.85rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {myEntry.user_name}
              </div>
              <div style={{ flexShrink: 0, textAlign: "right" }}>
                <div style={{ fontSize: "0.9rem", fontWeight: 800, color: "var(--cs-orange)" }}>{myEntry[key] ?? 0}</div>
                <div style={{ fontSize: 9, color: "var(--muted-foreground)", textTransform: "uppercase" }}>pts</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Profile preview bottom sheet ── */}
      {preview && (() => {
        const idx  = filtered.findIndex(e => e.user_email === preview.user_email);
        const rank = idx >= 0 ? ranks[idx] : null;
        const isMe = preview.user_email === user.email;
        return (
          <>
            {/* Backdrop — blocks background clicks & scroll */}
            <div
              style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.75)" }}
              onClick={() => setPreview(null)}
            />

            {/* Bottom sheet */}
            <div
              style={{
                position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 51,
                display: "flex", justifyContent: "center",
              }}
              onClick={() => setPreview(null)}
            >
              <div
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "20px 20px 0 0",
                  width: "100%",
                  maxWidth: 500,
                  // 90dvh cap so sheet never overflows; content scrolls inside
                  maxHeight: "90dvh",
                  display: "flex",
                  flexDirection: "column",
                  boxShadow: "0 -8px 40px rgba(0,0,0,0.6)",
                }}
                onClick={e => e.stopPropagation()}
              >
                {/* Drag handle */}
                <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px", flexShrink: 0 }}>
                  <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.2)" }} />
                </div>

                {/* Scrollable content area */}
                <div style={{ flex: 1, overflowY: "auto", padding: "0.75rem 1.5rem", paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}>

                  {/* Top bar: rank + close */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
                    {rank != null ? (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "oklch(0.72 0.19 49 / 10%)", border: "1px solid oklch(0.72 0.19 49 / 25%)", borderRadius: 20, padding: "4px 12px" }}>
                        <span style={{ fontSize: "0.72rem", color: "var(--muted-foreground)" }}>Rank</span>
                        <span style={{ fontSize: "0.95rem", fontWeight: 800, color: "var(--cs-orange)" }}>
                          {rank <= 3 && (
                            <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: "50%", background: MEDAL_COLORS[rank - 1].bg, verticalAlign: "middle", marginRight: 4 }} />
                          )}
                          #{rank}
                        </span>
                      </div>
                    ) : <div />}
                    <button
                      onClick={() => setPreview(null)}
                      aria-label="Close"
                      style={{ background: "rgba(255,255,255,0.07)", border: "none", color: "var(--muted-foreground)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 6, borderRadius: 8 }}
                    >
                      <X size={20} />
                    </button>
                  </div>

                  {/* Avatar + name + tags */}
                  <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
                    <div style={{ display: "inline-block", marginBottom: "0.75rem" }}>
                      <Avatar src={preview.photo} name={preview.user_name} size={80} style={{ border: `3px solid ${color.orange}` }} />
                    </div>
                    <div style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: 8 }}>{preview.user_name}</div>
                    <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                      {preview.location && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "var(--surface-elevated)", color: "var(--muted-foreground)" }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                          {preview.location}
                        </span>
                      )}
                      {preview.goal && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "oklch(0.72 0.19 49 / 8%)", color: "var(--cs-orange)", fontWeight: 600 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                          {GOAL_LABELS[preview.goal] ?? preview.goal}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stats strip */}
                  <div style={{ display: "flex", gap: "1px", background: "var(--border)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", marginBottom: "1.25rem" }}>
                    {[
                      { val: preview.week_points  ?? 0, label: "This Week" },
                      { val: preview.month_points ?? 0, label: "This Month" },
                      { val: preview.total_points ?? 0, label: "All Time" },
                    ].map(s => (
                      <div key={s.label} style={{ flex: 1, background: "var(--background)", padding: "12px 8px", textAlign: "center" }}>
                        <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--cs-orange)", letterSpacing: "-0.5px" }}>{s.val}</div>
                        <div style={{ fontSize: 9, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 3 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Follow / Following button — only shown when email is known (authenticated) */}
                  {!isMe && preview.user_email && (
                    <button
                      onClick={() => toggleFollow(preview.user_email!)}
                      disabled={followBusy.has(preview.user_email!)}
                      style={{
                        width: "100%", padding: "13px", borderRadius: 12,
                        fontSize: "0.9rem", fontWeight: 700,
                        cursor: followBusy.has(preview.user_email!) ? "not-allowed" : "pointer",
                        fontFamily: "var(--font-body)", border: "1px solid", transition: "all 0.15s",
                        opacity: followBusy.has(preview.user_email!) ? 0.6 : 1,
                        background:  followingSet.has(preview.user_email!) ? "transparent" : "var(--gradient-accent)",
                        color:       followingSet.has(preview.user_email!) ? "var(--muted-foreground)" : "#fff",
                        borderColor: followingSet.has(preview.user_email!) ? "var(--border)" : "transparent",
                        boxShadow:   followingSet.has(preview.user_email!) ? "none" : "var(--shadow-orange)",
                      }}
                    >
                      {followBusy.has(preview.user_email!) ? "…" : followingSet.has(preview.user_email!) ? "Following" : "Follow"}
                    </button>
                  )}

                  {/* If viewing own profile */}
                  {isMe && (
                    <div style={{ textAlign: "center", fontSize: "0.82rem", color: "var(--muted-foreground)", padding: "0.5rem 0" }}>
                      This is you
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
