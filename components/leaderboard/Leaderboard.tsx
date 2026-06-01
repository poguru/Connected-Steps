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
  id:           string;
  user_email:   string;
  user_name:    string;
  location:     string;
  goal:         string;
  month_points: number;
  total_points: number;
  updated_at:   string;
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
  const [tab,       setTab]       = useState<"month" | "total">("month");

  useEffect(() => {
    const stored = localStorage.getItem("cs_user");
    if (!stored) { router.push("/auth"); return; }
    const u: User = JSON.parse(stored);
    setUser(u);

  }, [router]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await getSupabase()
        .from("leaderboard")
        .select("id, user_email, user_name, location, goal, month_points, total_points, updated_at")
        .order(tab === "month" ? "month_points" : "total_points", { ascending: false });
      if (!error && data) setEntries(data);
      setLoading(false);
    }
    load();
  }, [tab]);

  if (!user) return null;

  const fullName = `${user.firstName} ${user.lastName}`;

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
              <Link key={item.label} href={item.href} style={{ fontSize: "0.875rem", color: item.label === "Leaderboard" ? "var(--cs-orange)" : "var(--cs-muted)", textDecoration: "none" }}>
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
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.5rem" }}>Connected Steps</div>
          <h1 className="font-display" style={{ fontSize: "2rem", fontWeight: 300, color: "var(--cs-white)", marginBottom: "0.5rem" }}>Community Leaderboard</h1>
          <p style={{ fontSize: "0.875rem", color: "var(--cs-muted)" }}>Top 3 this month win prizes. Earn points by attending training sessions.</p>
        </div>

        {/* Tab switcher */}
        <div style={{ display: "flex", gap: "4px", padding: "4px", marginBottom: "1.5rem", borderRadius: "6px", background: "rgba(255,255,255,0.05)", width: "fit-content" }}>
          {(["month", "total"] as const).map((t) => (
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
              {t === "month" ? "This Month" : "All Time"}
            </button>
          ))}
        </div>

        {/* Table */}
        <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", overflow: "hidden" }}>
          {/* Table header */}
          <div className="cs-lb-header">
            <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Rank</div>
            <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Athlete</div>
            <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Points</div>
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
              <div style={{ fontSize: "0.875rem", color: "var(--cs-muted)" }}>Attend a training session to earn your first points.</div>
            </div>
          )}

          {entries.map((entry, i) => {
            const isMe  = entry.user_name === fullName;
            const pts   = (tab === "month" ? entry.month_points : entry.total_points) ?? 0;

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

                <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--cs-orange)" }}>
                  {pts}
                  <span style={{ fontSize: "10px", fontWeight: 400, color: "var(--cs-muted)", marginLeft: "3px" }}>pts</span>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: "1rem", fontSize: "11px", color: "var(--cs-muted)", textAlign: "center" }}>
          Monthly points reset at the start of each month. Top 3 performers receive a gift from Connected Steps.
        </div>
      </div>
    </div>
  );
}
