"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import UserMenu, { MenuUser } from "@/components/ui/UserMenu";

interface User {
  firstName: string;
  lastName:  string;
  email:     string;
  phone:     string;
  goal:      string;
  location:  string;
  photo:     string | null;
}

interface ServerData {
  sessionCount:    number;
  leaderboardRank: number | null;
  hasMembership:   boolean;
}

interface BadgeData { sd: ServerData; }

const MILESTONES: {
  id: string; label: string; desc: string; icon: string; category: string;
  check: (d: BadgeData) => boolean;
}[] = [
  // Sessions
  { id: "session_1",  label: "First Session", desc: "Attended your first CS session", icon: "🎯", category: "Sessions",    check: ({ sd }) => sd.sessionCount >= 1  },
  { id: "session_5",  label: "5 Sessions",    desc: "Attended 5 training sessions",   icon: "🌟", category: "Sessions",    check: ({ sd }) => sd.sessionCount >= 5  },
  { id: "session_10", label: "10 Sessions",   desc: "Attended 10 training sessions",  icon: "💪", category: "Sessions",    check: ({ sd }) => sd.sessionCount >= 10 },
  { id: "session_25", label: "25 Sessions",   desc: "Attended 25 training sessions",  icon: "🔑", category: "Sessions",    check: ({ sd }) => sd.sessionCount >= 25 },
  { id: "session_50", label: "50 Sessions",   desc: "Attended 50 training sessions",  icon: "🏅", category: "Sessions",    check: ({ sd }) => sd.sessionCount >= 50 },
  // Leaderboard
  { id: "top_10",     label: "Top 10",        desc: "Ranked top 10 on monthly board", icon: "📊", category: "Leaderboard", check: ({ sd }) => sd.leaderboardRank !== null && sd.leaderboardRank <= 10 },
  { id: "top_3",      label: "Podium Finish", desc: "Ranked top 3 on monthly board",  icon: "🥉", category: "Leaderboard", check: ({ sd }) => sd.leaderboardRank !== null && sd.leaderboardRank <= 3  },
  { id: "rank_1",     label: "Champion",      desc: "Ranked #1 on monthly board",     icon: "👑", category: "Leaderboard", check: ({ sd }) => sd.leaderboardRank === 1 },
  // Membership
  { id: "member",     label: "Active Member", desc: "Subscribed to Connected Steps",  icon: "💳", category: "Membership",  check: ({ sd }) => sd.hasMembership },
];

export default function Achievements() {
  const router = useRouter();
  const [user,           setUser]           = useState<User | null>(null);
  const [serverData,     setServerData]     = useState<ServerData>({ sessionCount: 0, leaderboardRank: null, hasMembership: false });

  const [loading,        setLoading]        = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("cs_user");
    if (!stored) { router.push("/auth"); return; }
    const u: User = JSON.parse(stored);
    setUser(u);

    fetch(`/api/user/achievements?email=${encodeURIComponent(u.email)}`)
      .then((r) => r.json())
      .then((d) => setServerData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  if (!user) return null;

  const badgeData: BadgeData = { sd: serverData };
  const unlocked = MILESTONES.filter((m) => m.check(badgeData));
  const locked   = MILESTONES.filter((m) => !unlocked.find((u) => u.id === m.id));

  return (
    <div style={{ minHeight: "100vh", background: "var(--cs-black)", color: "var(--cs-white)" }}>

      {/* Navbar */}
      <header className="cs-app-nav">
        <div className="cs-app-nav-inner">
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none" }}>
            <Image src="/logo.png" alt="Connected Steps" width={36} height={36} className="rounded-full" />
            <span className="font-display" style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--cs-white)", whiteSpace: "nowrap" }}>Connected Steps</span>
          </Link>
          <nav className="cs-app-nav-links">
            {[
              { label: "Dashboard",    href: "/dashboard" },
              { label: "Weekend Run",  href: "/weekend-run" },
              { label: "Leaderboard", href: "/leaderboard" },
              { label: "Community",   href: "/community" },
              { label: "Achievements",href: "/achievements" },
              { label: "Pricing",     href: "/pricing" },
            ].map((item) => (
              <Link key={item.label} href={item.href} style={{ fontSize: "0.875rem", color: item.label === "Achievements" ? "var(--cs-orange)" : "var(--cs-muted)", textDecoration: "none" }}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="cs-app-nav-user">
            <UserMenu user={user as MenuUser} onUserUpdate={(u) => { setUser(u as User); localStorage.setItem("cs_user", JSON.stringify(u)); }} />
          </div>
        </div>
      </header>

      {/* Body */}
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "5rem 2rem 3rem" }}>

        {/* Header */}
        <div style={{ marginBottom: "2.5rem" }}>
          <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.5rem" }}>Connected Steps</div>
          <h1 className="font-display" style={{ fontSize: "2rem", fontWeight: 300, color: "var(--cs-white)", marginBottom: "0.5rem" }}>Your Achievements</h1>
          <p style={{ fontSize: "0.875rem", color: "var(--cs-muted)" }}>Milestones earned through training sessions, leaderboard performance, and membership.</p>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "4rem", color: "var(--cs-muted)" }}>Loading…</div>
        ) : (
          <>
            {/* Stats summary */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", marginBottom: "2.5rem" }}>
              {[
                { label: "Sessions Attended", value: String(serverData.sessionCount),                                           icon: "🏃" },
                { label: "Leaderboard Rank",  value: serverData.leaderboardRank != null ? `#${serverData.leaderboardRank}` : "—", icon: "📊" },
                { label: "Membership",        value: serverData.hasMembership ? "Active" : "Inactive",                          icon: "💳" },
                { label: "Badges Earned",     value: `${unlocked.length} / ${MILESTONES.length}`,                               icon: "🏅" },
              ].map((s) => (
                <div key={s.label} style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "1.25rem" }}>
                  <div style={{ fontSize: "1.4rem", marginBottom: "0.5rem" }}>{s.icon}</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--cs-orange)", fontFamily: "var(--font-body)" }}>{s.value}</div>
                  <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: "4px" }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Unlocked badges */}
            {unlocked.length > 0 && (
              <div style={{ marginBottom: "2.5rem" }}>
                <div style={{ fontSize: "11px", color: "var(--cs-orange)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "1rem", fontWeight: 500 }}>
                  Badges Earned — {unlocked.length} / {MILESTONES.length}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
                  {unlocked.map((m) => (
                    <div key={m.id} style={{ background: "var(--cs-dark)", border: "1px solid rgba(232,98,10,0.3)", borderRadius: "8px", padding: "1.25rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <div style={{ fontSize: "2rem", flexShrink: 0 }}>{m.icon}</div>
                      <div>
                        <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--cs-white)", marginBottom: "2px" }}>{m.label}</div>
                        <div style={{ fontSize: "11px", color: "var(--cs-muted)" }}>{m.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {unlocked.length === 0 && (
              <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "3rem", textAlign: "center", marginBottom: "2.5rem" }}>
                <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🎯</div>
                <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--cs-white)", marginBottom: "0.5rem" }}>No badges yet</div>
                <div style={{ fontSize: "0.875rem", color: "var(--cs-muted)" }}>Attend your first training session to start earning badges.</div>
              </div>
            )}

            {/* Locked badges */}
            {locked.length > 0 && (
              <div>
                <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "1rem", fontWeight: 500 }}>
                  Still to unlock — {locked.length} remaining
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
                  {locked.map((m) => m.id === "member" ? (
                    <Link key={m.id} href="/pricing" style={{ textDecoration: "none" }}>
                      <div style={{ background: "rgba(232,98,10,0.06)", border: "1px solid rgba(232,98,10,0.25)", borderRadius: "8px", padding: "1.25rem", display: "flex", alignItems: "center", gap: "0.75rem", cursor: "pointer", transition: "border-color 0.2s" }}>
                        <div style={{ fontSize: "2rem", flexShrink: 0 }}>💳</div>
                        <div>
                          <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--cs-orange)", marginBottom: "2px" }}>Get Membership</div>
                          <div style={{ fontSize: "11px", color: "var(--cs-muted)", marginBottom: "6px" }}>Unlock this badge + full access</div>
                          <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--cs-orange)", letterSpacing: "0.08em", textTransform: "uppercase" }}>View plans →</div>
                        </div>
                      </div>
                    </Link>
                  ) : (
                    <div key={m.id} style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "8px", padding: "1.25rem", display: "flex", alignItems: "center", gap: "0.75rem", opacity: 0.4 }}>
                      <div style={{ fontSize: "2rem", flexShrink: 0, filter: "grayscale(1)" }}>{m.icon}</div>
                      <div>
                        <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--cs-muted)", marginBottom: "2px" }}>{m.label}</div>
                        <div style={{ fontSize: "11px", color: "var(--cs-muted)" }}>{m.desc}</div>
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
