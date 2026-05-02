"use client";

import { useEffect, useState, useCallback } from "react";
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

interface StravaTokens {
  access_token:  string;
  refresh_token: string;
  expires_at:    number;
  athlete_id:    number;
}

interface Activity {
  id:               number;
  name:             string;
  type:             string;
  start_date_local: string;
  distance:         number;
  moving_time:      number;
  average_speed:    number;
}

interface PRs {
  longestRunDist: number;   // metres
  longestRunTime: number;   // seconds
  fastestPace:    number;   // m/s
  best5KSecs:     number;
  best10KSecs:    number;
  bestHalfSecs:   number;
  bestFullSecs:   number;
  totalRuns:      number;
  totalKm:        number;
  totalTimeSecs:  number;
}

function fmtPace(mps: number) {
  if (!mps) return "—";
  const secPerKm = 1000 / mps;
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${sec.toString().padStart(2, "0")} /km`;
}

function fmtTime(secs: number) {
  if (!secs) return "—";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

async function getValidToken(tokens: StravaTokens): Promise<string> {
  if (Date.now() / 1000 < tokens.expires_at - 60) return tokens.access_token;
  const res = await fetch("/api/strava/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: tokens.refresh_token }),
  });
  if (!res.ok) throw new Error("Token refresh failed");
  const data = await res.json();
  const updated = { ...tokens, ...data };
  localStorage.setItem("cs_strava", JSON.stringify(updated));
  return data.access_token;
}

// Normalise a run's time to an exact target distance using actual pace
function bestTime(runs: Activity[], minM: number, maxM: number): number {
  const matches = runs.filter((a) => a.distance >= minM && a.distance <= maxM && a.moving_time > 0);
  if (!matches.length) return 0;
  // normalise each run's time to the target distance midpoint, pick shortest
  const target = (minM + maxM) / 2;
  return Math.min(...matches.map((a) => Math.round((target / a.distance) * a.moving_time)));
}

function computePRs(activities: Activity[]): PRs {
  const runs = activities.filter((a) => a.type === "Run" && a.distance > 0);
  if (!runs.length) return { longestRunDist: 0, longestRunTime: 0, fastestPace: 0, best5KSecs: 0, best10KSecs: 0, bestHalfSecs: 0, bestFullSecs: 0, totalRuns: 0, totalKm: 0, totalTimeSecs: 0 };

  // Longest run — find the run with max distance
  const longestRunActivity = runs.reduce((a, b) => a.distance >= b.distance ? a : b);
  const longestRunDist = longestRunActivity.distance;
  const longestRunTime = longestRunActivity.moving_time;

  const qualifying  = runs.filter((a) => a.distance >= 3000 && a.average_speed > 0);
  const fastestPace = qualifying.length ? Math.max(...qualifying.map((a) => a.average_speed)) : 0;

  const best5KSecs   = bestTime(runs, 4800,  5500);
  const best10KSecs  = bestTime(runs, 9500,  11000);
  const bestHalfSecs = bestTime(runs, 20000, 22500);
  const bestFullSecs = bestTime(runs, 40000, 44000);

  const totalRuns     = runs.length;
  const totalKm       = runs.reduce((s, a) => s + a.distance, 0) / 1000;
  const totalTimeSecs = runs.reduce((s, a) => s + a.moving_time, 0);

  return { longestRunDist, longestRunTime, fastestPace, best5KSecs, best10KSecs, bestHalfSecs, bestFullSecs, totalRuns, totalKm, totalTimeSecs };
}

const MILESTONES = [
  { id: "first_run",    label: "First Step",       desc: "Completed your first run",         icon: "👟", check: (a: Activity[]) => a.filter(r => r.type === "Run").length >= 1 },
  { id: "runs_10",      label: "10 Runs",           desc: "Logged 10 running activities",     icon: "🔟", check: (a: Activity[]) => a.filter(r => r.type === "Run").length >= 10 },
  { id: "runs_50",      label: "50 Runs",           desc: "Logged 50 running activities",     icon: "🏃", check: (a: Activity[]) => a.filter(r => r.type === "Run").length >= 50 },
  { id: "runs_100",     label: "Century Club",      desc: "Logged 100 running activities",    icon: "💯", check: (a: Activity[]) => a.filter(r => r.type === "Run").length >= 100 },
  { id: "first_5k",     label: "First 5K",          desc: "Ran 5 kilometres in one go",       icon: "5️⃣", check: (a: Activity[]) => a.some(r => r.type === "Run" && r.distance >= 5000) },
  { id: "first_10k",    label: "First 10K",         desc: "Ran 10 kilometres in one go",      icon: "🔥", check: (a: Activity[]) => a.some(r => r.type === "Run" && r.distance >= 10000) },
  { id: "first_half",   label: "Half Marathon",     desc: "Ran 21.1 kilometres in one go",    icon: "🥈", check: (a: Activity[]) => a.some(r => r.type === "Run" && r.distance >= 21097) },
  { id: "first_full",   label: "Full Marathon",     desc: "Ran 42.2 kilometres in one go",    icon: "🏅", check: (a: Activity[]) => a.some(r => r.type === "Run" && r.distance >= 42195) },
  { id: "km_100",       label: "100 km Club",       desc: "Total distance exceeded 100 km",   icon: "📍", check: (a: Activity[]) => a.filter(r => r.type === "Run").reduce((s, r) => s + r.distance, 0) >= 100000 },
  { id: "km_500",       label: "500 km Warrior",    desc: "Total distance exceeded 500 km",   icon: "⚡", check: (a: Activity[]) => a.filter(r => r.type === "Run").reduce((s, r) => s + r.distance, 0) >= 500000 },
  { id: "km_1000",      label: "1000 km Legend",    desc: "Total distance exceeded 1000 km",  icon: "🏆", check: (a: Activity[]) => a.filter(r => r.type === "Run").reduce((s, r) => s + r.distance, 0) >= 1000000 },
];

export default function Achievements() {
  const router = useRouter();
  const [user,       setUser]       = useState<User | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [prs,        setPrs]        = useState<PRs | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [noStrava,   setNoStrava]   = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const fetchActivities = useCallback(async (tokens: StravaTokens) => {
    setLoading(true);
    try {
      const token = await getValidToken(tokens);
      const res   = await fetch("https://www.strava.com/api/v3/athlete/activities?per_page=200", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Strava fetch failed");
      const data: Activity[] = await res.json();
      setActivities(data);
      setPrs(computePRs(data));
    } catch {
      setNoStrava(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("cs_user");
    if (!stored) { router.push("/auth"); return; }
    const u: User = JSON.parse(stored);
    setUser(u);

    const stravaRaw = localStorage.getItem("cs_strava")
      || localStorage.getItem(`cs_strava_${u.email}`);
    if (stravaRaw) {
      fetchActivities(JSON.parse(stravaRaw));
    } else {
      setNoStrava(true);
    }
  }, [router, fetchActivities]);

  if (!user) return null;

  const fullName  = `${user.firstName} ${user.lastName}`;
  const unlocked  = activities.length > 0 ? MILESTONES.filter((m) => m.check(activities)) : [];
  const locked    = MILESTONES.filter((m) => !unlocked.find((u) => u.id === m.id));

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
              <Link key={item.label} href={item.href} style={{ fontSize: "0.875rem", color: item.label === "Achievements" ? "var(--cs-orange)" : "var(--cs-muted)", textDecoration: "none" }}>
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
              <Link key={item.label} href={item.href} onClick={() => setMobileMenuOpen(false)} style={{ fontSize: "0.95rem", color: item.label === "Achievements" ? "var(--cs-orange)" : "var(--cs-muted)", textDecoration: "none" }}>
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </header>

      {/* Body */}
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "5rem 2rem 3rem" }}>

        {/* Header */}
        <div style={{ marginBottom: "2.5rem" }}>
          <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.5rem" }}>Connected Steps</div>
          <h1 className="font-display" style={{ fontSize: "2rem", fontWeight: 300, color: "var(--cs-white)", marginBottom: "0.5rem" }}>Your Achievements</h1>
          <p style={{ fontSize: "0.875rem", color: "var(--cs-muted)" }}>Personal records and milestones earned from your Strava activities.</p>
        </div>

        {/* No Strava */}
        {noStrava && (
          <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "3rem", textAlign: "center" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🏃</div>
            <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--cs-white)", marginBottom: "0.5rem" }}>Connect Strava to unlock achievements</div>
            <div style={{ fontSize: "0.875rem", color: "var(--cs-muted)", marginBottom: "1.5rem" }}>Your personal records and badges are computed from your Strava activities.</div>
            <Link href="/dashboard" style={{ display: "inline-block", padding: "10px 24px", background: "var(--cs-orange)", color: "var(--cs-white)", borderRadius: "4px", fontSize: "0.875rem", fontWeight: 600, textDecoration: "none" }}>
              Go to Dashboard to connect
            </Link>
          </div>
        )}

        {loading && (
          <div style={{ textAlign: "center", padding: "4rem", color: "var(--cs-muted)" }}>Loading your achievements…</div>
        )}

        {!loading && prs && (
          <>
            {/* Race PRs */}
            <div style={{ marginBottom: "2.5rem" }}>
              <div style={{ fontSize: "11px", color: "var(--cs-orange)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "1rem", fontWeight: 500 }}>Race Personal Bests</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
                {[
                  { label: "5K",           secs: prs.best5KSecs,   badge: "5K",  dist: "5.0 km" },
                  { label: "10K",          secs: prs.best10KSecs,  badge: "10K", dist: "10.0 km" },
                  { label: "Half Marathon",secs: prs.bestHalfSecs, badge: "HM",  dist: "21.1 km" },
                  { label: "Full Marathon",secs: prs.bestFullSecs, badge: "FM",  dist: "42.2 km" },
                ].map((r) => (
                  <div key={r.label} style={{ background: "var(--cs-dark)", border: `1px solid ${r.secs ? "rgba(232,98,10,0.3)" : "rgba(255,255,255,0.06)"}`, borderRadius: "8px", padding: "1.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                      <div style={{ width: "44px", height: "44px", borderRadius: "10px", border: `2px solid ${r.secs ? "var(--cs-orange)" : "rgba(255,255,255,0.15)"}`, display: "flex", alignItems: "center", justifyContent: "center", background: r.secs ? "rgba(232,98,10,0.12)" : "rgba(255,255,255,0.04)" }}>
                        <span style={{ fontSize: r.badge.length > 2 ? "0.75rem" : "0.9rem", fontWeight: 800, color: r.secs ? "var(--cs-orange)" : "rgba(255,255,255,0.3)", letterSpacing: "-0.02em", fontFamily: "var(--font-body)" }}>{r.badge}</span>
                      </div>
                      <span style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.06em" }}>{r.dist}</span>
                    </div>
                    <div style={{ fontSize: "1.4rem", fontWeight: 700, color: r.secs ? "var(--cs-orange)" : "rgba(255,255,255,0.2)", marginBottom: "4px", fontFamily: "var(--font-body)" }}>
                      {r.secs ? fmtTime(r.secs) : "No record yet"}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{r.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Key stats */}
            <div style={{ marginBottom: "2.5rem" }}>
              <div style={{ fontSize: "11px", color: "var(--cs-orange)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "1rem", fontWeight: 500 }}>Lifetime Stats</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
                {/* Longest run — shows both distance and time */}
                <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "1.5rem" }}>
                  <div style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>📏</div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--cs-orange)", fontFamily: "var(--font-body)" }}>{(prs.longestRunDist / 1000).toFixed(2)} km</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--cs-muted)", margin: "4px 0 6px" }}>{fmtTime(prs.longestRunTime)}</div>
                  <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Longest Run</div>
                </div>
                {[
                  { label: "Total Runs",     value: String(prs.totalRuns),              sub: "activities",                  icon: "🏃" },
                  { label: "Total Distance", value: `${prs.totalKm.toFixed(1)} km`,     sub: "lifetime",                    icon: "🗺️" },
                  { label: "Best Pace",      value: fmtPace(prs.fastestPace),           sub: "on a run ≥ 3 km",             icon: "⚡" },
                ].map((s) => (
                  <div key={s.label} style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "1.5rem" }}>
                    <div style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>{s.icon}</div>
                    <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--cs-orange)", fontFamily: "var(--font-body)" }}>{s.value}</div>
                    <div style={{ fontSize: "0.8rem", color: "var(--cs-muted)", margin: "4px 0 6px" }}>{s.sub}</div>
                    <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{s.label}</div>
                  </div>
                ))}
              </div>
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

            {/* Locked badges */}
            {locked.length > 0 && (
              <div>
                <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "1rem", fontWeight: 500 }}>
                  Still to unlock — {locked.length} remaining
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
                  {locked.map((m) => (
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
