"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";

interface User {
  firstName: string;
  lastName:  string;
  email:     string;
  photo:     string | null;
  goal:      string;
  location:  string;
}

interface LeaderboardEntry {
  id:             string;
  user_name:      string;
  location:       string;
  goal:           string;
  week_runs:      number;
  week_km:        number;
  week_time_secs: number;
  total_runs:     number;
  total_km:       number;
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
  const [tab,     setTab]     = useState<"week" | "total">("week");

  useEffect(() => {
    const stored = localStorage.getItem("cs_user");
    if (!stored) { router.push("/auth"); return; }
    setUser(JSON.parse(stored));
  }, [router]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await getSupabase()
        .from("leaderboard")
        .select("*")
        .order(tab === "week" ? "week_km" : "total_km", { ascending: false });
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
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, background: "rgba(10,10,10,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 2rem", display: "flex", alignItems: "center", justifyContent: "space-between", height: "64px" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none" }}>
            <Image src="/logo.png" alt="Connected Steps" width={36} height={36} className="rounded-full" />
            <span className="font-display" style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--cs-white)" }}>Connected Steps</span>
          </Link>

          <nav style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
            {[
              { label: "Dashboard",    href: "/dashboard" },
              { label: "Leaderboard", href: "/leaderboard" },
              { label: "Community",   href: "#" },
              { label: "Achievements",href: "#" },
            ].map((item) => (
              <Link key={item.label} href={item.href} style={{ fontSize: "0.875rem", color: item.label === "Leaderboard" ? "var(--cs-orange)" : "var(--cs-muted)", textDecoration: "none" }}>
                {item.label}
              </Link>
            ))}
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {user.photo ? (
              <img src={user.photo} alt={fullName} style={{ width: "36px", height: "36px", borderRadius: "50%", objectFit: "cover", border: "2px solid var(--cs-orange)" }} />
            ) : (
              <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "var(--cs-orange)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.875rem", fontWeight: 700 }}>
                {user.firstName[0]}{user.lastName[0]}
              </div>
            )}
            <span style={{ fontSize: "0.875rem" }}>{fullName}</span>
          </div>
        </div>
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
          <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 120px 100px 100px 100px", gap: "1rem", padding: "0.75rem 1.5rem", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
            {["Rank", "Athlete", tab === "week" ? "This Week km" : "Total km", "Runs", "Time", "Goal"].map((h) => (
              <div key={h} style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{h}</div>
            ))}
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
            const secs = tab === "week" ? entry.week_time_secs : 0;
            const h    = Math.floor(secs / 3600);
            const m    = Math.floor((secs % 3600) / 60);

            return (
              <div
                key={entry.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "60px 1fr 120px 100px 100px 100px",
                  gap: "1rem",
                  padding: "1rem 1.5rem",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  background: isMe ? "rgba(232,98,10,0.06)" : "transparent",
                  alignItems: "center",
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

                <div style={{ fontSize: "0.875rem", color: "var(--cs-white)" }}>
                  {tab === "week" ? `${h}h ${m}m` : "—"}
                </div>

                <div style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "20px", background: "rgba(232,98,10,0.15)", color: "var(--cs-orange)", border: "1px solid rgba(232,98,10,0.3)", width: "fit-content" }}>
                  {goalLabel[entry.goal] ?? entry.goal}
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
