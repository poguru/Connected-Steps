"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { MenuUser } from "@/components/ui/UserMenu";
import AppNav from "@/components/layout/AppNav";

interface User       { firstName: string; lastName: string; email: string; phone: string; goal: string; location: string; photo: string | null; }
interface ServerData { sessionCount: number; leaderboardRank: number | null; hasMembership: boolean; }
interface BadgeData  { sd: ServerData; }

const MILESTONES: { id: string; label: string; desc: string; icon: string; category: string; check: (d: BadgeData) => boolean; }[] = [
  { id: "session_1",  label: "First Session", desc: "Attended your first CS session", icon: "🎯", category: "Sessions",    check: ({ sd }) => sd.sessionCount >= 1  },
  { id: "session_5",  label: "5 Sessions",    desc: "Attended 5 training sessions",   icon: "🌟", category: "Sessions",    check: ({ sd }) => sd.sessionCount >= 5  },
  { id: "session_10", label: "10 Sessions",   desc: "Attended 10 training sessions",  icon: "💪", category: "Sessions",    check: ({ sd }) => sd.sessionCount >= 10 },
  { id: "session_25", label: "25 Sessions",   desc: "Attended 25 training sessions",  icon: "🔑", category: "Sessions",    check: ({ sd }) => sd.sessionCount >= 25 },
  { id: "session_50", label: "50 Sessions",   desc: "Attended 50 training sessions",  icon: "🏅", category: "Sessions",    check: ({ sd }) => sd.sessionCount >= 50 },
  { id: "top_10",     label: "Top 10",        desc: "Ranked top 10 on monthly board", icon: "📊", category: "Leaderboard", check: ({ sd }) => sd.leaderboardRank !== null && sd.leaderboardRank <= 10 },
  { id: "top_3",      label: "Podium Finish", desc: "Ranked top 3 on monthly board",  icon: "🥉", category: "Leaderboard", check: ({ sd }) => sd.leaderboardRank !== null && sd.leaderboardRank <= 3  },
  { id: "rank_1",     label: "Champion",      desc: "Ranked #1 on monthly board",     icon: "👑", category: "Leaderboard", check: ({ sd }) => sd.leaderboardRank === 1 },
  { id: "member",     label: "Active Member", desc: "Subscribed to Connected Steps",  icon: "💳", category: "Membership",  check: ({ sd }) => sd.hasMembership },
];


export default function Achievements() {
  const router = useRouter();
  const [user,       setUser]       = useState<User | null>(null);
  const [serverData, setServerData] = useState<ServerData>({ sessionCount: 0, leaderboardRank: null, hasMembership: false });
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("cs_user");
    if (!stored) { router.push("/auth"); return; }
    const u: User = JSON.parse(stored);
    setUser(u);
    fetch(`/api/user/achievements?email=${encodeURIComponent(u.email)}`)
      .then(r => r.json()).then(d => setServerData(d)).catch(() => {}).finally(() => setLoading(false));
  }, [router]);

  if (!user) return null;

  const badgeData: BadgeData = { sd: serverData };
  const unlocked = MILESTONES.filter(m => m.check(badgeData));
  const locked   = MILESTONES.filter(m => !unlocked.find(u => u.id === m.id));
  const progress  = Math.round((unlocked.length / MILESTONES.length) * 100);

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--foreground)" }}>
      <AppNav
        user={user as MenuUser}
        onUserUpdate={u => { setUser(u as User); localStorage.setItem("cs_user", JSON.stringify(u)); }}
        activeLabel="Achievements"
      />

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "5rem 1.5rem 3rem" }}>
        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ fontSize: 11, color: "var(--primary)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "0.5rem", fontWeight: 600 }}>Connected Steps</div>
          <h1 className="font-display" style={{ fontSize: "2.2rem", fontWeight: 700, letterSpacing: "-0.015em", marginBottom: "0.5rem" }}>Your Achievements</h1>
          <p style={{ fontSize: "0.875rem", color: "var(--muted-foreground)" }}>Milestones earned through training sessions, leaderboard performance, and membership.</p>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "4rem", color: "var(--muted-foreground)" }}>Loading…</div>
        ) : (
          <>
            {/* Progress bar */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "1.5rem", marginBottom: "2rem", boxShadow: "var(--shadow-md)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>Badge Progress</span>
                <span style={{ fontSize: "0.875rem", color: "var(--primary)", fontWeight: 700 }}>{unlocked.length} / {MILESTONES.length}</span>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: "var(--muted)", overflow: "hidden" }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 1, ease: "easeOut" }}
                  style={{ height: "100%", borderRadius: 999, background: "var(--gradient-accent)" }} />
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", marginBottom: "2.5rem" }}>
              {[
                { label: "Sessions Attended", value: String(serverData.sessionCount),                                                icon: "🏃" },
                { label: "Leaderboard Rank",  value: serverData.leaderboardRank != null ? `#${serverData.leaderboardRank}` : "—",   icon: "📊" },
                { label: "Membership",        value: serverData.hasMembership ? "Active" : "Inactive",                               icon: "💳" },
                { label: "Badges Earned",     value: `${unlocked.length} / ${MILESTONES.length}`,                                    icon: "🏅" },
              ].map((s, i) => (
                <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "1.25rem", boxShadow: "var(--shadow-md)" }}>
                  <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>{s.icon}</div>
                  <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--primary)", fontFamily: "var(--font-display)" }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 4 }}>{s.label}</div>
                </motion.div>
              ))}
            </div>

            {/* Unlocked */}
            {unlocked.length > 0 && (
              <div style={{ marginBottom: "2.5rem" }}>
                <div style={{ fontSize: 11, color: "var(--primary)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "1rem", fontWeight: 600 }}>
                  Badges Earned — {unlocked.length} / {MILESTONES.length}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem" }}>
                  {unlocked.map((m, i) => (
                    <motion.div key={m.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}
                      style={{ background: "var(--surface)", border: "1px solid oklch(0.72 0.19 49 / 30%)", borderRadius: 16, padding: "1.25rem", display: "flex", alignItems: "center", gap: "0.75rem", boxShadow: "var(--shadow-md)" }}>
                      <div style={{ fontSize: "2rem", flexShrink: 0 }}>{m.icon}</div>
                      <div>
                        <div style={{ fontSize: "0.875rem", fontWeight: 700, marginBottom: 2 }}>{m.label}</div>
                        <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{m.desc}</div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {unlocked.length === 0 && (
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "3rem", textAlign: "center", marginBottom: "2.5rem", boxShadow: "var(--shadow-md)" }}>
                <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🎯</div>
                <div style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.5rem" }}>No badges yet</div>
                <div style={{ fontSize: "0.875rem", color: "var(--muted-foreground)" }}>Attend your first training session to start earning badges.</div>
              </div>
            )}

            {/* Locked */}
            {locked.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: "var(--muted-foreground)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "1rem", fontWeight: 600 }}>
                  Still to unlock — {locked.length} remaining
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem" }}>
                  {locked.map(m => m.id === "member" ? (
                    <Link key={m.id} href="/pricing" style={{ textDecoration: "none" }}>
                      <div style={{ background: "oklch(0.72 0.19 49 / 6%)", border: "1px solid oklch(0.72 0.19 49 / 25%)", borderRadius: 16, padding: "1.25rem", display: "flex", alignItems: "center", gap: "0.75rem", cursor: "pointer", transition: "border-color 0.2s", boxShadow: "var(--shadow-md)" }}>
                        <div style={{ fontSize: "2rem", flexShrink: 0 }}>💳</div>
                        <div>
                          <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--primary)", marginBottom: 2 }}>Get Membership</div>
                          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 6 }}>Unlock this badge + full access</div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--primary)", letterSpacing: "0.08em", textTransform: "uppercase" }}>View plans →</div>
                        </div>
                      </div>
                    </Link>
                  ) : (
                    <div key={m.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "1.25rem", display: "flex", alignItems: "center", gap: "0.75rem", opacity: 0.45 }}>
                      <div style={{ fontSize: "2rem", flexShrink: 0, filter: "grayscale(1)" }}>{m.icon}</div>
                      <div>
                        <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--muted-foreground)", marginBottom: 2 }}>{m.label}</div>
                        <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{m.desc}</div>
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
