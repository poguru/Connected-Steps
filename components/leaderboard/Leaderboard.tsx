"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { TrendingUp, X } from "lucide-react";
import { MenuUser } from "@/components/ui/UserMenu";
import AppNav from "@/components/layout/AppNav";
import { getSupabaseSafe } from "@/lib/supabase";

interface User  { firstName: string; lastName: string; email: string; phone: string; photo: string | null; goal: string; location: string; }
interface Entry {
  id: string; user_email: string; user_name: string; location: string; goal: string;
  month_points: number; total_points: number; week_points: number; photo: string | null;
}

type TimeTab = "week" | "month" | "all";

const GOAL_LABELS: Record<string, string> = {
  "5k": "5K", "10k": "10K", "half": "Half Marathon", "full": "Full Marathon",
  "ultra": "Ultra", "fitness": "General Fitness", "speed": "Speed", "weight": "Weight Loss", "strength": "Strength",
};

const MEDAL      = ["🥇", "🥈", "🥉"];
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

// ── Avatar helper ─────────────────────────────────────────────────────────────

function Avatar({ photo, name, size, border }: { photo: string | null; name: string; size: number; border?: string }) {
  if (photo) {
    return (
      <img src={photo} alt={name}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0,
          border: border ?? "2px solid transparent", display: "block" }} />
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "var(--gradient-primary)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.32 + "px", fontWeight: 700, color: "#fff", flexShrink: 0,
      border: border ?? "2px solid transparent" }}>
      {initials(name)}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Leaderboard() {
  const router = useRouter();
  const [user,         setUser]         = useState<User | null>(null);
  const [entries,      setEntries]      = useState<Entry[]>([]);
  const [tab,          setTab]          = useState<TimeTab>("month");
  const [loading,      setLoading]      = useState(true);
  const [locFilter,    setLocFilter]    = useState("All");
  const [goalFilter,   setGoalFilter]   = useState("All");
  const [live,         setLive]         = useState(false);
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [followBusy,   setFollowBusy]   = useState<Set<string>>(new Set());
  const [preview,      setPreview]      = useState<Entry | null>(null);

  const tabRef  = useRef(tab);
  const liveRef = useRef(false);
  useEffect(() => { tabRef.current = tab; }, [tab]);

  const fetchLeaderboard = useCallback(() => {
    fetch("/api/leaderboard")
      .then(r => r.json())
      .then(d => {
        if (d.entries) {
          const key = ptsKey(tabRef.current);
          setEntries([...d.entries].sort((a: Entry, b: Entry) => (b[key] ?? 0) - (a[key] ?? 0)));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch("/api/leaderboard")
      .then(r => r.json())
      .then(d => {
        if (d.entries) {
          const key = ptsKey(tab);
          setEntries([...d.entries].sort((a: Entry, b: Entry) => (b[key] ?? 0) - (a[key] ?? 0)));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tab]);

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
    if (!stored) { router.push("/auth"); return; }
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

  const key       = ptsKey(tab);
  const locations = ["All", ...Array.from(new Set(entries.map(e => e.location).filter(l => l && !l.includes("@")))).sort()];
  const goals     = ["All", ...Array.from(new Set(entries.map(e => e.goal).filter(Boolean))).sort()];

  let filtered = entries;
  if (locFilter  !== "All") filtered = filtered.filter(e => e.location === locFilter);
  if (goalFilter !== "All") filtered = filtered.filter(e => e.goal === goalFilter);

  const ranks: number[] = [];
  for (let i = 0; i < filtered.length; i++) {
    if (i === 0) { ranks.push(1); continue; }
    ranks.push((filtered[i][key] ?? 0) === (filtered[i - 1][key] ?? 0) ? ranks[i - 1] : ranks[i - 1] + 1);
  }

  const myIndex        = filtered.findIndex(e => e.user_email === user.email);
  const myRank         = myIndex >= 0 ? ranks[myIndex] : null;
  const myEntry        = myIndex >= 0 ? filtered[myIndex] : null;
  const podium         = filtered.slice(0, 3);
  const rest           = filtered.slice(3);
  const showStickyRank = myRank !== null && myRank > 10;

  function followBtn(email: string, compact = false) {
    const isFollowing = followingSet.has(email);
    const busy        = followBusy.has(email);
    return (
      <button
        onClick={e => toggleFollow(email, e)}
        disabled={busy}
        style={{
          padding: compact ? "4px 10px" : "6px 14px",
          borderRadius: compact ? 6 : 8,
          fontSize: compact ? "0.72rem" : "0.78rem",
          fontWeight: 600,
          cursor: busy ? "not-allowed" : "pointer",
          fontFamily: "var(--font-body)",
          border: "1px solid",
          transition: "all 0.15s",
          opacity: busy ? 0.6 : 1,
          background:  isFollowing ? "transparent" : "var(--gradient-accent)",
          color:       isFollowing ? "var(--muted-foreground)" : "#fff",
          borderColor: isFollowing ? "var(--border)" : "transparent",
          whiteSpace: "nowrap",
        }}>
        {busy ? "…" : isFollowing ? "Following" : "Follow"}
      </button>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--foreground)" }}>
      <AppNav
        user={user as MenuUser}
        onUserUpdate={u => { setUser(u as User); localStorage.setItem("cs_user", JSON.stringify(u)); }}
        activeLabel="Leaderboard"
      />

      <div style={{ maxWidth: 860, margin: "0 auto", padding: `calc(var(--nav-total) + 1.5rem) 1.5rem ${showStickyRank ? "6rem" : "3rem"}` }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <h1 className="font-display" style={{ fontSize: "clamp(1.6rem, 4vw, 2rem)", fontWeight: 700, letterSpacing: "-0.015em", margin: 0 }}>
              Leaderboard
            </h1>
            {live && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 20, background: "oklch(0.74 0.22 150 / 10%)", border: "1px solid oklch(0.74 0.22 150 / 25%)", padding: "3px 10px", fontSize: 11, color: "#4ade80", fontWeight: 600 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", display: "inline-block" }} className="animate-pulse" />
                Live
              </span>
            )}
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
            { val: filtered.filter(e => followingSet.has(e.user_email)).length, label: "Following" },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: "var(--surface)", padding: "8px 12px", textAlign: "center" }}>
              <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--cs-orange)", letterSpacing: "-0.3px" }}>{s.val}</div>
              <div style={{ fontSize: 9, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Time tabs ── */}
        <div style={{ display: "flex", gap: 4, padding: 4, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, marginBottom: "1rem" }}>
          {([["week", "This Week"], ["month", "This Month"], ["all", "All Time"]] as [TimeTab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: "8px 8px", borderRadius: 8, border: "none", cursor: "pointer",
              fontFamily: "var(--font-body)", fontSize: "0.75rem", fontWeight: 600,
              background: tab === t ? "var(--gradient-accent)" : "transparent",
              color:      tab === t ? "#fff" : "var(--muted-foreground)",
              boxShadow:  tab === t ? "var(--shadow-orange)" : "none",
              transition: "all 0.15s", whiteSpace: "nowrap",
            }}>
              {label}
            </button>
          ))}
        </div>

        {/* ── Goal + location filters ── */}
        {(goals.length > 2 || locations.length > 2) && (
          <div style={{ display: "flex", gap: 8, marginBottom: "1.5rem", flexWrap: "wrap" }}>
            {goals.length > 2 && (
              <select value={goalFilter} onChange={e => setGoalFilter(e.target.value)}
                style={{ flex: 1, minWidth: 120, padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--foreground)", fontSize: "0.8rem", fontFamily: "var(--font-body)", outline: "none", cursor: "pointer", colorScheme: "dark" }}>
                {goals.map(g => <option key={g} value={g} style={{ background: "#1a1a1a" }}>{g === "All" ? "All goals" : GOAL_LABELS[g] ?? g}</option>)}
              </select>
            )}
            {locations.length > 2 && (
              <select value={locFilter} onChange={e => setLocFilter(e.target.value)}
                style={{ flex: 1, minWidth: 120, padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--foreground)", fontSize: "0.8rem", fontFamily: "var(--font-body)", outline: "none", cursor: "pointer", colorScheme: "dark" }}>
                {locations.map(l => <option key={l} value={l} style={{ background: "#1a1a1a" }}>{l === "All" ? "All locations" : l}</option>)}
              </select>
            )}
          </div>
        )}

        {/* ── Loading skeleton ── */}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ height: 72, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)", opacity: 0.6 }} />
            ))}
          </div>
        )}

        {!loading && (
          <>
            {/* ── Podium (top 3) ── */}
            {podium.length >= 3 && (
              <div style={{ marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
                  {PODIUM_IDX.map((entryIdx, displayPos) => {
                    const r         = podium[entryIdx];
                    const rank      = entryIdx + 1;
                    const isMe      = r.user_email === user.email;
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
                          <div style={{ fontSize: isFirst ? "1.5rem" : "1.2rem", marginBottom: 6 }}>{MEDAL[entryIdx]}</div>
                          <Avatar
                            photo={r.photo} name={r.user_name}
                            size={isFirst ? 54 : 42}
                            border={`2px solid ${isMe ? "var(--cs-orange)" : colors.border}`}
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
                {rest.map((r, i) => {
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
                      <Avatar photo={r.photo} name={r.user_name} size={42} border={isMe ? "2px solid var(--cs-orange)" : "2px solid transparent"} />
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
              </div>
            )}

            {filtered.length === 0 && (
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "2.5rem 1.5rem", textAlign: "center" }}>
                <div style={{ fontSize: "2rem", marginBottom: 8 }}>🏆</div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: 4 }}>No runners found</div>
                <div style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>Try adjusting the filters above.</div>
              </div>
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
              <Avatar photo={myEntry.photo} name={myEntry.user_name} size={32} border="2px solid var(--cs-orange)" />
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
          <div
            style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
            onClick={() => setPreview(null)}>
            <div
              style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "16px 16px 0 0", padding: "1.5rem", width: "100%", maxWidth: 500, paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
              onClick={e => e.stopPropagation()}>
              {/* Top bar */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
                {rank != null ? (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "oklch(0.72 0.19 49 / 10%)", border: "1px solid oklch(0.72 0.19 49 / 25%)", borderRadius: 20, padding: "4px 12px" }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--muted-foreground)" }}>Rank</span>
                    <span style={{ fontSize: "0.95rem", fontWeight: 800, color: "var(--cs-orange)" }}>
                      {rank <= 3 ? MEDAL[rank - 1] + " " : ""}#{rank}
                    </span>
                  </div>
                ) : <div />}
                <button onClick={() => setPreview(null)} style={{ background: "none", border: "none", color: "var(--muted-foreground)", cursor: "pointer", display: "flex", padding: 4 }}>
                  <X size={20} />
                </button>
              </div>

              {/* Avatar + name */}
              <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
                <div style={{ display: "inline-block", marginBottom: "0.75rem" }}>
                  <Avatar photo={preview.photo} name={preview.user_name} size={72} border="3px solid var(--cs-orange)" />
                </div>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 6 }}>{preview.user_name}</div>
                <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                  {preview.location && (
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "var(--surface-elevated)", color: "var(--muted-foreground)" }}>📍 {preview.location}</span>
                  )}
                  {preview.goal && (
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "oklch(0.72 0.19 49 / 8%)", color: "var(--cs-orange)", fontWeight: 600 }}>🎯 {GOAL_LABELS[preview.goal] ?? preview.goal}</span>
                  )}
                </div>
              </div>

              {/* Stats strip */}
              <div style={{ display: "flex", gap: "1px", background: "var(--border)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: "1.25rem" }}>
                {[
                  { val: preview.week_points  ?? 0, label: "This Week" },
                  { val: preview.month_points ?? 0, label: "This Month" },
                  { val: preview.total_points ?? 0, label: "All Time" },
                ].map(s => (
                  <div key={s.label} style={{ flex: 1, background: "var(--background)", padding: "10px 8px", textAlign: "center" }}>
                    <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--cs-orange)" }}>{s.val}</div>
                    <div style={{ fontSize: 9, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Follow button */}
              {!isMe && (
                <button
                  onClick={() => toggleFollow(preview.user_email)}
                  disabled={followBusy.has(preview.user_email)}
                  style={{
                    width: "100%", padding: "12px", borderRadius: 10,
                    fontSize: "0.9rem", fontWeight: 700,
                    cursor: followBusy.has(preview.user_email) ? "not-allowed" : "pointer",
                    fontFamily: "var(--font-body)", border: "1px solid", transition: "all 0.15s",
                    opacity: followBusy.has(preview.user_email) ? 0.6 : 1,
                    background:  followingSet.has(preview.user_email) ? "transparent" : "var(--gradient-accent)",
                    color:       followingSet.has(preview.user_email) ? "var(--muted-foreground)" : "#fff",
                    borderColor: followingSet.has(preview.user_email) ? "var(--border)" : "transparent",
                    boxShadow:   followingSet.has(preview.user_email) ? "none" : "var(--shadow-orange)",
                  }}>
                  {followBusy.has(preview.user_email) ? "…" : followingSet.has(preview.user_email) ? "Following" : "Follow"}
                </button>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
