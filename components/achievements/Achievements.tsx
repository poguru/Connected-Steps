"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MenuUser } from "@/components/ui/UserMenu";
import AppNav from "@/components/layout/AppNav";

interface User       { firstName: string; lastName: string; email: string; phone: string; goal: string; location: string; photo: string | null; }
interface ServerData { sessionCount: number; leaderboardRank: number | null; hasMembership: boolean; }
interface BadgeData  { sd: ServerData; }

const MILESTONES: {
  id: string; label: string; desc: string; icon: string; category: string;
  check: (d: BadgeData) => boolean;
  next?: (d: BadgeData) => string;
}[] = [
  { id: "session_1",  label: "First Session",  desc: "Attended your first CS session",  icon: "🎯", category: "Sessions",    check: ({ sd }) => sd.sessionCount >= 1,  next: ({ sd }) => `${Math.max(0, 1 - sd.sessionCount)} session to go` },
  { id: "session_5",  label: "5 Sessions",     desc: "Attended 5 training sessions",    icon: "🌟", category: "Sessions",    check: ({ sd }) => sd.sessionCount >= 5,  next: ({ sd }) => `${Math.max(0, 5 - sd.sessionCount)} to go` },
  { id: "session_10", label: "10 Sessions",    desc: "Attended 10 training sessions",   icon: "💪", category: "Sessions",    check: ({ sd }) => sd.sessionCount >= 10, next: ({ sd }) => `${Math.max(0, 10 - sd.sessionCount)} to go` },
  { id: "session_25", label: "25 Sessions",    desc: "Attended 25 training sessions",   icon: "🔑", category: "Sessions",    check: ({ sd }) => sd.sessionCount >= 25, next: ({ sd }) => `${Math.max(0, 25 - sd.sessionCount)} to go` },
  { id: "session_50", label: "50 Sessions",    desc: "Attended 50 training sessions",   icon: "🏅", category: "Sessions",    check: ({ sd }) => sd.sessionCount >= 50, next: ({ sd }) => `${Math.max(0, 50 - sd.sessionCount)} to go` },
  { id: "top_10",     label: "Top 10",         desc: "Ranked top 10 on monthly board",  icon: "📊", category: "Leaderboard", check: ({ sd }) => sd.leaderboardRank !== null && sd.leaderboardRank <= 10 },
  { id: "top_3",      label: "Podium Finish",  desc: "Ranked top 3 on monthly board",   icon: "🥉", category: "Leaderboard", check: ({ sd }) => sd.leaderboardRank !== null && sd.leaderboardRank <= 3  },
  { id: "rank_1",     label: "Champion",       desc: "Ranked #1 on monthly board",      icon: "👑", category: "Leaderboard", check: ({ sd }) => sd.leaderboardRank === 1 },
  { id: "member",     label: "Active Member",  desc: "Subscribed to Connected Steps",   icon: "💳", category: "Membership",  check: ({ sd }) => sd.hasMembership },
];

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div style={{ height: 6, borderRadius: 999, background: "var(--muted)", overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: "var(--gradient-accent)", transition: "width 0.8s ease" }} />
    </div>
  );
}

export default function Achievements() {
  const router = useRouter();
  const [user,       setUser]       = useState<User | null>(null);
  const [serverData, setServerData] = useState<ServerData>({ sessionCount: 0, leaderboardRank: null, hasMembership: false });
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("cs_user");
    if (!stored) { router.push("/auth"); return; }
    let u: User;
    try { u = JSON.parse(stored); } catch { localStorage.removeItem("cs_user"); router.push("/auth"); return; }
    setUser(u);
    const token = localStorage.getItem("cs_user_token") ?? "";
    fetch("/api/user/achievements", { headers: { "x-user-token": token } })
      .then(r => r.json()).then(d => setServerData(d)).catch(() => {}).finally(() => setLoading(false));
  }, [router]);

  if (!user) return null;

  const badgeData: BadgeData = { sd: serverData };
  const unlocked = MILESTONES.filter(m => m.check(badgeData));
  const locked   = MILESTONES.filter(m => !unlocked.find(u => u.id === m.id));
  const progress  = Math.round((unlocked.length / MILESTONES.length) * 100);

  const nextBadge = locked.find(m => m.next);

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--foreground)" }}>
      <AppNav
        user={user as MenuUser}
        onUserUpdate={u => { setUser(u as User); localStorage.setItem("cs_user", JSON.stringify(u)); }}
        activeLabel="Achievements"
      />

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "var(--page-top-pad) 1.5rem var(--page-bottom-pad)" }}>

        {/* ── Page header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: "1.5rem", flexWrap: "wrap" }}>
          <div>
            <h1 className="font-display" style={{ fontSize: "clamp(1.6rem, 4vw, 2.2rem)", fontWeight: 700, letterSpacing: "-0.015em", marginBottom: 4 }}>
              Achievements
            </h1>
            <p style={{ fontSize: "0.85rem", color: "var(--muted-foreground)", margin: 0 }}>
              Milestones earned through sessions, rankings, and membership.
            </p>
          </div>
          {!loading && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 16px", flexShrink: 0 }}>
              <span style={{ fontSize: "1.1rem" }}>🏅</span>
              <div>
                <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--cs-orange)", lineHeight: 1 }}>{unlocked.length}/{MILESTONES.length}</div>
                <div style={{ fontSize: 9, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em" }}>earned</div>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          /* ── Skeleton ── */
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ height: 80, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)" }} />
            <div className="stat-row">
              {[1,2,3,4].map(i => (
                <div key={i} className="stat-cell">
                  <div style={{ width: 48, height: 20, background: "rgba(255,255,255,0.07)", borderRadius: 4, margin: "0 auto 6px" }} />
                  <div style={{ width: 60, height: 10, background: "rgba(255,255,255,0.05)", borderRadius: 4, margin: "0 auto" }} />
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "0.75rem" }}>
              {[1,2,3,4,5,6].map(i => (
                <div key={i} style={{ height: 88, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)" }} />
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* ── Overall progress bar ── */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "0.875rem 1.25rem", marginBottom: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--foreground)" }}>Badge Progress</span>
                <span style={{ fontSize: "0.82rem", color: "var(--cs-orange)", fontWeight: 700 }}>{progress}% complete</span>
              </div>
              <ProgressBar value={unlocked.length} max={MILESTONES.length} />
              {nextBadge && (
                <div style={{ marginTop: 8, fontSize: "0.72rem", color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>Next: {nextBadge.icon} <strong style={{ color: "var(--foreground)" }}>{nextBadge.label}</strong></span>
                  {nextBadge.next && <span>— {nextBadge.next(badgeData)}</span>}
                </div>
              )}
            </div>

            {/* ── Compact stat row ── */}
            <div className="stat-row" style={{ marginBottom: "1.5rem" }}>
              <div className="stat-cell">
                <div className="stat-cell-val">{serverData.sessionCount}</div>
                <div className="stat-cell-label">Sessions</div>
              </div>
              <div className="stat-cell">
                <div className="stat-cell-val" style={serverData.leaderboardRank !== null ? { color: "var(--cs-orange)" } : {}}>
                  {serverData.leaderboardRank != null ? `#${serverData.leaderboardRank}` : "—"}
                </div>
                <div className="stat-cell-label">Rank</div>
              </div>
              <div className="stat-cell">
                <div className="stat-cell-val" style={{ color: serverData.hasMembership ? "#4ade80" : "var(--muted-foreground)" }}>
                  {serverData.hasMembership ? "✓" : "—"}
                </div>
                <div className="stat-cell-label">Member</div>
              </div>
              <div className="stat-cell">
                <div className="stat-cell-val">{unlocked.length}</div>
                <div className="stat-cell-label">Badges</div>
              </div>
            </div>

            {/* ── Unlocked badges ── */}
            {unlocked.length > 0 ? (
              <div style={{ marginBottom: "1.5rem" }}>
                <div style={{ fontSize: 10, color: "var(--cs-orange)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.65rem" }}>
                  Earned · {unlocked.length}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 180px), 1fr))", gap: "0.65rem" }}>
                  {unlocked.map(m => (
                    <div key={m.id} style={{
                      background: "oklch(0.72 0.19 49 / 6%)", border: "1px solid oklch(0.72 0.19 49 / 25%)",
                      borderRadius: 12, padding: "0.875rem", display: "flex", alignItems: "center", gap: "0.6rem",
                    }}>
                      <div style={{ fontSize: "1.6rem", flexShrink: 0 }}>{m.icon}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "0.8rem", fontWeight: 700, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</div>
                        <div style={{ fontSize: 10, color: "var(--muted-foreground)", lineHeight: 1.4 }}>{m.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", textAlign: "center", marginBottom: "1.5rem" }}>
                <div style={{ fontSize: "2rem", marginBottom: 8 }}>🎯</div>
                <div style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: 4 }}>No badges yet</div>
                <div style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
                  Attend your first training session to start earning.
                </div>
                <Link href="/community" style={{ display: "inline-block", padding: "8px 20px", background: "var(--gradient-accent)", color: "#fff", borderRadius: 8, textDecoration: "none", fontSize: "0.8rem", fontWeight: 700, boxShadow: "var(--shadow-orange)" }}>
                  Find a session →
                </Link>
              </div>
            )}

            {/* ── Locked badges ── */}
            {locked.length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: "var(--muted-foreground)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: "0.65rem" }}>
                  Still to unlock · {locked.length}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 180px), 1fr))", gap: "0.65rem" }}>
                  {locked.map(m => m.id === "member" ? (
                    <Link key={m.id} href="/pricing" style={{ textDecoration: "none" }}>
                      <div style={{
                        background: "oklch(0.72 0.19 49 / 5%)", border: "1px solid oklch(0.72 0.19 49 / 20%)",
                        borderRadius: 12, padding: "0.875rem", display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer",
                      }}>
                        <div style={{ fontSize: "1.6rem", flexShrink: 0 }}>💳</div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--cs-orange)", marginBottom: 2 }}>Get Membership</div>
                          <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>View plans →</div>
                        </div>
                      </div>
                    </Link>
                  ) : (
                    <div key={m.id} style={{
                      background: "var(--surface)", border: "1px solid var(--border)",
                      borderRadius: 12, padding: "0.875rem", display: "flex", alignItems: "center", gap: "0.6rem", opacity: 0.4,
                    }}>
                      <div style={{ fontSize: "1.6rem", flexShrink: 0, filter: "grayscale(1)" }}>{m.icon}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--muted-foreground)", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</div>
                        {m.next && (
                          <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{m.next(badgeData)}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
