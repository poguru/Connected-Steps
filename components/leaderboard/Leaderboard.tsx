"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import UserMenu, { MenuUser } from "@/components/ui/UserMenu";

interface User {
  firstName: string;
  lastName:  string;
  email:     string;
  phone:     string;
  photo:     string | null;
  goal:      string;
  location:  string;
}

interface LeaderboardEntry {
  id:             string;
  user_email:     string;
  user_name:      string;
  location:       string;
  goal:           string;
  week_runs:      number;
  week_km:        number;
  week_time_secs: number;
  week_points:    number;
  total_runs:     number;
  total_km:       number;
  total_time_secs:number;
  total_points:   number;
  updated_at:     string;
}

const goalLabel: Record<string, string> = {
  "5k":  "First 5K",
  "10k": "10K",
  "half":"Half Marathon",
  "full":"Full Marathon",
};

function medal(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

export default function Leaderboard() {
  const router = useRouter();
  const [user,    setUser]    = useState<User | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab,       setTab]       = useState<"week" | "total">("week");
  const [following, setFollowing] = useState<string[]>([]);
  const [followLoading, setFollowLoading] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("cs_user");
    if (!stored) { router.push("/auth"); return; }
    const u: User = JSON.parse(stored);
    setUser(u);

    // Load who this user is following
    fetch(`/api/follow?email=${encodeURIComponent(u.email)}&type=following`)
      .then((r) => r.json())
      .then((data) => { if (data.users) setFollowing(data.users); });
  }, [router]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await getSupabase()
        .from("leaderboard")
        .select("id, user_email, user_name, location, goal, week_runs, week_km, week_time_secs, week_points, total_runs, total_km, total_time_secs, total_points, updated_at")
        .order(tab === "week" ? "week_points" : "total_points", { ascending: false });
      if (!error && data) setEntries(data);
      setLoading(false);
    }
    load();
  }, [tab]);

  const toggleFollow = async (targetEmail: string) => {
    if (!user) return;
    setFollowLoading(targetEmail);
    try {
      const res = await fetch("/api/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ follower_email: user.email, following_email: targetEmail }),
      });
      const data = await res.json();
      if (data.action === "followed") {
        setFollowing((prev) => [...prev, targetEmail]);
      } else {
        setFollowing((prev) => prev.filter((e) => e !== targetEmail));
      }
    } finally {
      setFollowLoading(null);
    }
  };

  if (!user) return null;

  const fullName = `${user.firstName} ${user.lastName}`;

  return (
    <div style={{ minHeight: "100vh", background: "var(--cs-black)", color: "var(--cs-white)" }}>

      {/* Navbar */}
      <header className="cs-app-nav">
        <div className="cs-app-nav-inner">
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none" }}>
            <Image src="/logo.png" alt="Connected Steps" width={36} height={36} className="rounded-full" />
            <span className="font-display" style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--cs-white)" }}>Connected Steps</span>
          </Link>

          <nav className="cs-app-nav-links">
            {[
              { label: "Dashboard",    href: "/dashboard" },
              { label: "Leaderboard", href: "/leaderboard" },
              { label: "Community",   href: "/community" },
              { label: "Achievements",href: "/achievements" },
            ].map((item) => (
              <Link key={item.label} href={item.href} style={{ fontSize: "0.875rem", color: item.label === "Leaderboard" ? "var(--cs-orange)" : "var(--cs-muted)", textDecoration: "none" }}>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="cs-app-nav-user">
            <UserMenu user={user as MenuUser} onUserUpdate={(u) => { setUser(u as User); localStorage.setItem("cs_user", JSON.stringify(u)); }} />
            <button className="cs-mobile-nav-toggle" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle menu">
              <span /><span /><span />
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="cs-mobile-menu">
            {[
              { label: "Dashboard",    href: "/dashboard" },
              { label: "Leaderboard", href: "/leaderboard" },
              { label: "Community",   href: "/community" },
              { label: "Achievements",href: "/achievements" },
            ].map((item) => (
              <Link key={item.label} href={item.href} onClick={() => setMobileMenuOpen(false)} style={{ fontSize: "0.95rem", color: item.label === "Leaderboard" ? "var(--cs-orange)" : "var(--cs-muted)", textDecoration: "none" }}>
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </header>

      {/* Body */}
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "5rem 2rem 3rem" }}>

        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.5rem" }}>Connected Steps</div>
          <h1 className="font-display" style={{ fontSize: "2rem", fontWeight: 300, color: "var(--cs-white)", marginBottom: "0.5rem" }}>Community Leaderboard</h1>
          <p style={{ fontSize: "0.875rem", color: "var(--cs-muted)" }}>Ranked by distance. Connect Strava from your dashboard to appear here.</p>
        </div>

        {/* Tab switcher */}
        <div style={{ display: "flex", gap: "4px", padding: "4px", marginBottom: "1.5rem", borderRadius: "6px", background: "rgba(255,255,255,0.05)", width: "fit-content" }}>
          {(["week", "total"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "8px 20px",
                borderRadius: "4px",
                fontSize: "0.875rem",
                fontWeight: 500,
                background: tab === t ? "var(--cs-orange)" : "transparent",
                color: tab === t ? "var(--cs-white)" : "var(--cs-muted)",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-body)",
                transition: "background 0.2s",
              }}
            >
              {t === "week" ? "This Week" : "All Time"}
            </button>
          ))}
        </div>

        {/* Table */}
        <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", overflow: "hidden" }}>
          {/* Table header */}
          <div className="cs-lb-header">
            <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Rank</div>
            <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Athlete</div>
            <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{tab === "week" ? "This Week km" : "Total km"}</div>
            <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Runs</div>
            <div className="cs-lb-hide-mobile" style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Time</div>
            <div className="cs-lb-hide-mobile" style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Points</div>
          </div>

          {loading && (
            <div style={{ padding: "3rem", textAlign: "center", color: "var(--cs-muted)", fontSize: "0.875rem" }}>
              Loading leaderboard…
            </div>
          )}

          {!loading && entries.length === 0 && (
            <div style={{ padding: "3rem", textAlign: "center" }}>
              <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>🏃</div>
              <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--cs-white)", marginBottom: "0.5rem" }}>No entries yet</div>
              <div style={{ fontSize: "0.875rem", color: "var(--cs-muted)" }}>Be the first! Connect your Strava from the dashboard.</div>
            </div>
          )}

          {entries.map((entry, i) => {
            const isMe = entry.user_name === fullName;
            const km   = tab === "week" ? entry.week_km : entry.total_km;
            const runs = tab === "week" ? entry.week_runs : entry.total_runs;
            const secs = tab === "week" ? entry.week_time_secs : (entry.total_time_secs ?? 0);
            const h    = Math.floor(secs / 3600);
            const m    = Math.floor((secs % 3600) / 60);

            return (
              <div
                key={entry.id}
                className="cs-lb-row"
                style={{
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  background: isMe ? "rgba(232,98,10,0.06)" : "transparent",
                }}
              >
                <div style={{ fontSize: i < 3 ? "1.25rem" : "0.875rem", fontWeight: 700, color: i < 3 ? "var(--cs-orange)" : "var(--cs-muted)" }}>
                  {medal(i + 1)}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "var(--cs-orange)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 700, flexShrink: 0 }}>
                    {entry.user_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: "0.875rem", fontWeight: 600, color: isMe ? "var(--cs-orange)" : "var(--cs-white)" }}>
                      {entry.user_name} {isMe && <span style={{ fontSize: "10px", color: "var(--cs-orange)" }}>(you)</span>}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--cs-muted)" }}>📍 {entry.location}</div>
                  </div>
                </div>

                <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--cs-white)" }}>
                  {km.toFixed(1)} <span style={{ fontSize: "11px", color: "var(--cs-muted)", fontWeight: 400 }}>km</span>
                </div>

                <div style={{ fontSize: "0.875rem", color: "var(--cs-white)" }}>{runs}</div>

                <div className="cs-lb-hide-mobile" style={{ fontSize: "0.875rem", color: "var(--cs-white)" }}>
                  {`${h}h ${m}m`}
                </div>

                <div className="cs-lb-hide-mobile" style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--cs-orange)", minWidth: "48px" }}>
                    {(tab === "week" ? entry.week_points : entry.total_points) ?? 0}
                    <span style={{ fontSize: "10px", fontWeight: 400, color: "var(--cs-muted)", marginLeft: "3px" }}>pts</span>
                  </div>
                  {!isMe && (
                    <button
                      onClick={() => toggleFollow(entry.user_email)}
                      disabled={followLoading === entry.user_email}
                      style={{
                        fontSize: "11px",
                        padding: "3px 10px",
                        borderRadius: "20px",
                        border: following.includes(entry.user_email) ? "1px solid rgba(255,255,255,0.2)" : "1px solid var(--cs-orange)",
                        background: following.includes(entry.user_email) ? "rgba(255,255,255,0.06)" : "var(--cs-orange)",
                        color: following.includes(entry.user_email) ? "var(--cs-muted)" : "var(--cs-white)",
                        cursor: followLoading === entry.user_email ? "not-allowed" : "pointer",
                        fontFamily: "var(--font-body)",
                        fontWeight: 600,
                      }}
                    >
                      {followLoading === entry.user_email ? "..." : following.includes(entry.user_email) ? "Following" : "Follow"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: "1rem", fontSize: "11px", color: "var(--cs-muted)", textAlign: "center" }}>
          Stats sync when you visit your dashboard with Strava connected. Updated daily.
        </div>
      </div>
    </div>
  );
}
