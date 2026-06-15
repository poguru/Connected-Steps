"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Flame, TrendingUp } from "lucide-react";
import { MenuUser } from "@/components/ui/UserMenu";
import AppNav from "@/components/layout/AppNav";
import { getSupabase } from "@/lib/supabase";

interface User  { firstName: string; lastName: string; email: string; phone: string; photo: string | null; goal: string; location: string; }
interface Entry { id: string; user_email: string; user_name: string; location: string; month_points: number; total_points: number; photo: string | null; }

function initials(name: string | null | undefined) { return (name ?? "").split(" ").map(n => n[0] ?? "").join("").slice(0, 2).toUpperCase() || "?"; }

const MEDAL = ["🥇", "🥈", "🥉"];

export default function Leaderboard() {
  const router = useRouter();
  const [user,          setUser]          = useState<User | null>(null);
  const [entries,       setEntries]       = useState<Entry[]>([]);
  const [tab,           setTab]           = useState<"month" | "total">("month");
  const [loading,       setLoading]       = useState(true);
  const [locFilter,     setLocFilter]     = useState("All");
  const [live,          setLive]          = useState(false);
  const [followingSet,  setFollowingSet]  = useState<Set<string>>(new Set());
  const [followBusy,    setFollowBusy]    = useState<Set<string>>(new Set());

  const tabRef  = useRef(tab);
  const liveRef = useRef(false);               // true once first SUBSCRIBED fires
  useEffect(() => { tabRef.current = tab; }, [tab]);

  const fetchLeaderboard = useCallback(() => {
    fetch("/api/leaderboard")
      .then(r => r.json())
      .then(d => {
        if (d.entries) {
          const key = tabRef.current === "month" ? "month_points" : "total_points";
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
          const key = tab === "month" ? "month_points" : "total_points";
          setEntries([...d.entries].sort((a: Entry, b: Entry) => (b[key] ?? 0) - (a[key] ?? 0)));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tab]);

  useEffect(() => {
    const supabase = getSupabase();
    const channel = supabase
      .channel("leaderboard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "leaderboard" }, (payload) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { eventType, new: newRow } = payload as any;

        // INSERT → new user needs photo/email from API; DELETE → row must be removed
        if (eventType !== "UPDATE") { fetchLeaderboard(); return; }

        // UPDATE → patch the affected row in-place, no API call needed
        setEntries(prev => {
          const idx = prev.findIndex(e => e.id === newRow?.id);
          // Row missing from local state = inconsistency; fall back to full refetch
          if (idx === -1) { fetchLeaderboard(); return prev; }
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],  // preserve photo (users join) and user_email (column-restricted in anon realtime)
            ...newRow,
            user_email: updated[idx].user_email,
            photo:      updated[idx].photo,
          };
          const key = tabRef.current === "month" ? "month_points" : "total_points";
          return [...updated].sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0));
        });
      })
      .subscribe(status => {
        if (status === "SUBSCRIBED") {
          // Reconnect after a prior connection = data may have drifted; catch up
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

  const pointsKey = tab === "month" ? "month_points" : "total_points";
  const locations = ["All", ...Array.from(new Set(entries.map(e => e.location).filter(l => l && !l.includes("@")))).sort()];
  const filtered  = locFilter === "All" ? entries : entries.filter(e => e.location === locFilter);

  const ranks: number[] = [];
  for (let i = 0; i < filtered.length; i++) {
    if (i === 0) { ranks.push(1); continue; }
    ranks.push((filtered[i][pointsKey] ?? 0) === (filtered[i-1][pointsKey] ?? 0) ? ranks[i-1] : ranks[i-1] + 1);
  }

  const myIndex  = filtered.findIndex(e => e.user_email === user.email);
  const myRank   = myIndex >= 0 ? ranks[myIndex] : null;
  const podium   = filtered.slice(0, 3);
  const rest     = filtered.slice(3);

  return (
    <div style={{ minHeight:"100vh", background:"var(--background)", color:"var(--foreground)" }}>

      <AppNav
        user={user as MenuUser}
        onUserUpdate={u => { setUser(u as User); localStorage.setItem("cs_user", JSON.stringify(u)); }}
        activeLabel="Leaderboard"
      />

      {/* ── Page header ── */}
      <section style={{ position:"relative", overflow:"hidden" }}>
        <div className="dot-bg absolute inset-0" style={{ opacity:0.3 }} />
        <div style={{ position:"relative", maxWidth:960, margin:"0 auto", padding:"calc(var(--nav-total) + 1.5rem) 1.5rem 2rem" }}>

          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12, marginBottom:"1.5rem" }}>
            {/* Title + live indicator */}
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                <h1 className="font-display" style={{ fontSize:"clamp(1.75rem, 5vw, 2.5rem)", fontWeight:700, lineHeight:1.05, letterSpacing:"-0.015em", margin:0 }}>
                  Leaderboard
                </h1>
                {live && (
                  <span style={{ display:"inline-flex", alignItems:"center", gap:5, borderRadius:20, background:"oklch(0.74 0.22 150 / 10%)", border:"1px solid oklch(0.74 0.22 150 / 25%)", padding:"3px 10px", fontSize:11, color:"#4ade80", fontWeight:600 }}>
                    <span style={{ width:6, height:6, borderRadius:"50%", background:"#4ade80", display:"inline-block" }} className="animate-pulse" />
                    Live
                  </span>
                )}
              </div>
              <p style={{ fontSize:"0.85rem", color:"var(--muted-foreground)", margin:0 }}>
                Earn points by attending sessions — the more you show up, the higher you climb.
              </p>
            </div>

            {/* My rank badge */}
            {myRank && (
              <div style={{ display:"inline-flex", alignItems:"center", gap:8, borderRadius:8, background:"oklch(0.72 0.19 49 / 10%)", border:"1px solid oklch(0.72 0.19 49 / 30%)", padding:"8px 16px" }}>
                <span style={{ fontSize:"0.8rem", color:"var(--muted-foreground)" }}>Your rank</span>
                <span style={{ fontSize:"1.25rem", fontWeight:800, color:"var(--cs-orange)", letterSpacing:"-0.5px" }}>#{myRank}</span>
              </div>
            )}
          </div>

          {/* Tab + filter row */}
          <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            <div style={{ display:"inline-flex", borderRadius:8, border:"1px solid var(--border)", background:"var(--surface)", padding:3 }}>
              {(["month", "total"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  borderRadius:6, padding:"7px 16px", fontSize:"0.8rem", fontWeight:600, border:"none", cursor:"pointer", fontFamily:"var(--font-body)", transition:"all 0.15s",
                  background: tab === t ? "var(--gradient-accent)" : "transparent",
                  color:      tab === t ? "#fff" : "var(--muted-foreground)",
                  boxShadow:  tab === t ? "var(--shadow-orange)" : "none",
                }}>
                  {t === "month" ? "This month" : "All time"}
                </button>
              ))}
            </div>
            {locations.length > 2 && (
              <select value={locFilter} onChange={e => setLocFilter(e.target.value)}
                style={{ padding:"7px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--surface)", color:"var(--foreground)", fontSize:"0.8rem", fontFamily:"var(--font-body)", outline:"none", cursor:"pointer", colorScheme:"dark" }}>
                {locations.map(l => <option key={l} value={l} style={{ background:"#1a1a1a" }}>{l === "All" ? "All locations" : l}</option>)}
              </select>
            )}
          </div>

          {/* ── Compact podium strip ── */}
          {!loading && podium.length >= 3 && (
            <div style={{ marginTop:"1.5rem", display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:8, maxWidth:520 }}>
              {[1, 0, 2].map(idx => {
                const r   = podium[idx];
                const isMe = r.user_email === user.email;
                const following = followingSet.has(r.user_email);
                const busy = followBusy.has(r.user_email);
                const borderColors = ["rgba(252,211,77,0.4)", "rgba(228,228,231,0.3)", "rgba(251,146,60,0.35)"];
                return (
                  <div key={r.user_email} style={{
                    background:"var(--surface)",
                    border:`1px solid ${isMe ? "oklch(0.72 0.19 49 / 35%)" : borderColors[idx]}`,
                    borderRadius:12, padding:"0.875rem 0.75rem", textAlign:"center",
                    boxShadow: idx === 0 ? "0 0 0 1px rgba(252,211,77,0.15), var(--shadow-md)" : "var(--shadow-md)",
                  }}>
                    <div style={{ fontSize:"1.25rem", marginBottom:6 }}>{MEDAL[idx]}</div>
                    <div style={{ width:44, height:44, borderRadius:"50%", background:"var(--gradient-primary)", display:"grid", placeItems:"center", margin:"0 auto 6px", fontSize:"0.85rem", fontWeight:700, color:"#fff" }}>
                      {initials(r.user_name)}
                    </div>
                    <div style={{ fontSize:"0.8rem", fontWeight:700, color: isMe ? "var(--cs-orange)" : "var(--foreground)", marginBottom:2 }}>
                      {(r.user_name ?? "Runner").split(" ")[0] || "Runner"}{isMe ? " ★" : ""}
                    </div>
                    <div style={{ fontSize:"1rem", fontWeight:800, color:"var(--cs-orange)", letterSpacing:"-0.3px" }}>{r[pointsKey] ?? 0}</div>
                    <div style={{ fontSize:9, color:"var(--muted-foreground)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>pts</div>
                    {!isMe && (
                      <button onClick={() => toggleFollow(r.user_email)} disabled={busy}
                        style={{ padding:"4px 12px", borderRadius:20, fontSize:10, fontWeight:700, cursor: busy ? "not-allowed" : "pointer", fontFamily:"var(--font-body)", border:"1px solid", transition:"all 0.15s", opacity: busy ? 0.6 : 1,
                          background:  following ? "transparent" : "var(--gradient-accent)",
                          color:       following ? "var(--muted-foreground)" : "#fff",
                          borderColor: following ? "var(--border)" : "transparent",
                        }}>
                        {busy ? "…" : following ? "Following" : "Follow"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── Rankings table ── */}
      {!loading && filtered.length > 3 && (
        <section style={{ maxWidth:960, margin:"0 auto", padding:"0 1.5rem 4rem" }}>
          <div style={{ overflow:"hidden", borderRadius:12, border:"1px solid var(--border)", background:"var(--surface)" }}>

            {/* Header */}
            <div className="cs-lb-header">
              <div>Rank</div>
              <div>Runner</div>
              <div className="cs-lb-monthly-col" style={{ textAlign:"right" }}>Month pts</div>
              <div style={{ textAlign:"right" }}>All-time</div>
            </div>

            {/* Rows */}
            {rest.map((r, i) => {
              const isMe      = r.user_email === user.email;
              const following = followingSet.has(r.user_email);
              const busy      = followBusy.has(r.user_email);
              return (
                <div key={r.id} className={`cs-lb-row${isMe ? " is-me" : ""}`}>
                  <div style={{ fontFamily:"monospace", fontSize:"0.8rem", fontWeight:700, color: isMe ? "var(--cs-orange)" : "var(--muted-foreground)" }}>
                    #{ranks[i + 3]}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:32, height:32, flexShrink:0, borderRadius:"50%", background:"var(--gradient-primary)", display:"grid", placeItems:"center", fontSize:"0.72rem", fontWeight:700, color:"#fff" }}>
                      {initials(r.user_name)}
                    </div>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:"0.82rem", fontWeight:600, color: isMe ? "var(--cs-orange)" : "var(--foreground)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {r.user_name}{isMe ? " (you)" : ""}
                      </div>
                      {r.location && <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>{r.location}</div>}
                    </div>
                  </div>
                  <div className="cs-lb-monthly-col" style={{ textAlign:"right", fontSize:"0.82rem", fontWeight:600, color:"var(--muted-foreground)" }}>
                    {r.month_points ?? 0}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-end", gap:8 }}>
                    <span style={{ fontWeight:700, color:"var(--cs-orange)", fontSize:"0.85rem" }}>{r[pointsKey] ?? 0}</span>
                    {!isMe && (
                      <button onClick={() => toggleFollow(r.user_email)} disabled={busy}
                        style={{ padding:"3px 10px", borderRadius:6, fontSize:10, fontWeight:600, cursor: busy ? "not-allowed" : "pointer", fontFamily:"var(--font-body)", border:"1px solid", opacity: busy ? 0.6 : 1,
                          background:  following ? "transparent" : "oklch(0.72 0.19 49 / 12%)",
                          color:       following ? "var(--muted-foreground)" : "var(--cs-orange)",
                          borderColor: following ? "var(--border)" : "oklch(0.72 0.19 49 / 30%)",
                        }}>
                        {busy ? "…" : following ? "✓" : "+Follow"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop:"1.25rem", display:"flex", alignItems:"center", justifyContent:"center", gap:6, fontSize:"0.72rem", color:"var(--muted-foreground)" }}>
            <TrendingUp size={13} style={{ color:"var(--accent)" }} />
            Attend sessions to earn points and climb the ranks.
          </div>
        </section>
      )}

      {loading && (
        <div style={{ display:"flex", flexDirection:"column", gap:1, maxWidth:960, margin:"0 auto", padding:"0 1.5rem" }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="cs-lb-row" style={{ borderRadius: i === 0 ? "12px 12px 0 0" : i === 7 ? "0 0 12px 12px" : 0 }}>
              <div style={{ width:28, height:10, background:"rgba(255,255,255,0.06)", borderRadius:4 }} />
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:32, height:32, borderRadius:"50%", background:"rgba(255,255,255,0.06)" }} />
                <div style={{ width:"60%", height:10, background:"rgba(255,255,255,0.05)", borderRadius:4 }} />
              </div>
              <div style={{ width:30, height:10, background:"rgba(255,255,255,0.04)", borderRadius:4, marginLeft:"auto" }} />
              <div style={{ width:30, height:10, background:"rgba(255,255,255,0.04)", borderRadius:4, marginLeft:"auto" }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
