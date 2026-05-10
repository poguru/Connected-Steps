"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import UserMenu, { MenuUser } from "@/components/ui/UserMenu";

type ModalType = "followers" | "following" | null;

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

interface PersonalBests {
  longestRun:  number;
  fastestPace: number;
  totalRuns:   number;
  totalKm:     number;
}

const goalLabel: Record<string, string> = {
  "5k":  "First 5K",
  "10k": "10K",
  "half":"Half Marathon",
  "full":"Full Marathon",
};

function calcActivityPoints(type: string, distanceM: number, movingTimeSecs: number): number {
  if (type === "Run") {
    const km = distanceM / 1000;
    let points = km;
    if (km > 42.2)       points += 20;
    else if (km >= 21.2) points += 15;
    else if (km >= 15)   points += 10;
    else if (km >= 10)   points += 7;
    else if (km >= 5)    points += 5;
    return Math.round(points);
  } else {
    const mins = movingTimeSecs / 60;
    let points = Math.floor(mins / 15) * 3;
    if (mins > 30) points += Math.floor((mins - 30) / 30) * 3;
    return points;
  }
}

function fmtPace(mps: number) {
  if (!mps) return "—";
  const secPerKm = 1000 / mps;
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${sec.toString().padStart(2, "0")} /km`;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
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

export default function Dashboard() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [user,           setUser]           = useState<User | null>(null);
  const [strava,         setStrava]         = useState<StravaTokens | null>(null);
  const [activities,     setActivities]     = useState<Activity[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [stravaMsg,      setStravaMsg]      = useState("");
  const [consent,        setConsent]        = useState(false);
  const [followers,      setFollowers]      = useState<string[]>([]);
  const [following,      setFollowing]      = useState<string[]>([]);
  const [modal,          setModal]          = useState<ModalType>(null);
  const [pbs,            setPbs]            = useState<PersonalBests | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [points,         setPoints]         = useState<{ month_points: number; total_points: number } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("cs_user");
    if (!stored) { router.push("/auth"); return; }
    const u: User = JSON.parse(stored);
    setUser(u);

    const storedStrava = localStorage.getItem("cs_strava") || localStorage.getItem(`cs_strava_${u.email}`);
    if (storedStrava) {
      localStorage.setItem("cs_strava", storedStrava);
      localStorage.setItem(`cs_strava_${u.email}`, storedStrava);
      setStrava(JSON.parse(storedStrava));
    }

    Promise.all([
      fetch(`/api/follow?email=${encodeURIComponent(u.email)}&type=followers`).then((r) => r.json()),
      fetch(`/api/follow?email=${encodeURIComponent(u.email)}&type=following`).then((r) => r.json()),
    ]).then(([fwers, fwing]) => {
      if (fwers.users) setFollowers(fwers.users);
      if (fwing.users) setFollowing(fwing.users);
    });

    fetch(`/api/leaderboard/user?email=${encodeURIComponent(u.email)}`)
      .then((r) => r.json())
      .then((d) => { if (d.month_points !== undefined) setPoints(d); })
      .catch(() => {});
  }, [router]);

  useEffect(() => {
    const status = searchParams.get("strava");
    if (!status) return;
    if (status === "connected") {
      const tokens: StravaTokens = {
        access_token:  searchParams.get("access_token")!,
        refresh_token: searchParams.get("refresh_token")!,
        expires_at:    Number(searchParams.get("expires_at")),
        athlete_id:    Number(searchParams.get("athlete_id")),
      };
      localStorage.setItem("cs_strava", JSON.stringify(tokens));
      const currentUser = localStorage.getItem("cs_user");
      if (currentUser) {
        const email = JSON.parse(currentUser).email;
        localStorage.setItem(`cs_strava_${email}`, JSON.stringify(tokens));
      }
      setStrava(tokens);
      setStravaMsg("Strava connected successfully!");
      router.replace("/dashboard");
    } else if (status === "denied") {
      setStravaMsg("Strava connection was cancelled.");
      router.replace("/dashboard");
    } else if (status === "error") {
      setStravaMsg("Failed to connect Strava. Please try again.");
      router.replace("/dashboard");
    }
  }, [searchParams, router]);

  const syncToLeaderboard = useCallback(async (user: User, acts: Activity[]) => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const points_month   = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`;
    const monthActs      = acts.filter((a) => new Date(a.start_date_local) >= monthStart);
    const month_runs      = monthActs.filter((a) => a.type === "Run").length;
    const month_km        = monthActs.reduce((s, a) => s + a.distance, 0) / 1000;
    const month_time_secs = monthActs.reduce((s, a) => s + a.moving_time, 0);
    const total_runs      = acts.filter((a) => a.type === "Run").length;
    const total_km        = acts.reduce((s, a) => s + a.distance, 0) / 1000;
    const total_time_secs = acts.reduce((s, a) => s + a.moving_time, 0);
    const month_points    = monthActs.reduce((s, a) => s + calcActivityPoints(a.type, a.distance, a.moving_time), 0);
    const total_points    = acts.reduce((s, a) => s + calcActivityPoints(a.type, a.distance, a.moving_time), 0);

    await fetch("/api/leaderboard/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_email: user.email, user_name: `${user.firstName} ${user.lastName}`, location: user.location, goal: user.goal, month_runs, month_km: parseFloat(month_km.toFixed(2)), month_time_secs, total_runs, total_km: parseFloat(total_km.toFixed(2)), total_time_secs, month_points, total_points, points_month }),
    });
  }, []);

  const fetchActivities = useCallback(async (tokens: StravaTokens) => {
    setLoading(true);
    try {
      const token = await getValidToken(tokens);
      const res = await fetch("https://www.strava.com/api/v3/athlete/activities?per_page=100", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Strava ${res.status}`);
      const data: Activity[] = await res.json();
      setActivities(data);
      const runs = data.filter((a) => a.type === "Run" && a.distance > 0);
      if (runs.length > 0) {
        const longestRun     = Math.max(...runs.map((a) => a.distance));
        const qualifyingRuns = runs.filter((a) => a.distance >= 3000 && a.average_speed > 0);
        const fastestPace    = qualifyingRuns.length > 0 ? Math.max(...qualifyingRuns.map((a) => a.average_speed)) : 0;
        setPbs({ longestRun, fastestPace, totalRuns: runs.length, totalKm: runs.reduce((s, a) => s + a.distance, 0) / 1000 });
      }
      try {
        const stored = localStorage.getItem("cs_user");
        if (stored) await syncToLeaderboard(JSON.parse(stored), data);
      } catch (e) { console.error("Leaderboard sync failed:", e); }
    } catch (e: unknown) {
      setStravaMsg("Could not load Strava activities: " + (e instanceof Error ? e.message : String(e)));
    } finally { setLoading(false); }
  }, [syncToLeaderboard]);

  useEffect(() => {
    if (strava) fetchActivities(strava);
  }, [strava, fetchActivities]);

  if (!user) return null;

  const fullName = `${user.firstName} ${user.lastName}`;

  const stravaAuthUrl = `https://www.strava.com/oauth/authorize?client_id=${process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(
    typeof window !== "undefined" ? `${window.location.origin}/api/strava/callback` : "http://localhost:3000/api/strava/callback"
  )}&response_type=code&approval_prompt=auto&scope=activity:read_all`;

  const monthStart      = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const monthActivities = activities.filter((a) => new Date(a.start_date_local) >= monthStart);
  const monthRuns       = monthActivities.filter((a) => a.type === "Run").length;
  const monthKm         = monthActivities.reduce((s, a) => s + a.distance, 0) / 1000;
  const monthTimeSecs   = monthActivities.reduce((s, a) => s + a.moving_time, 0);
  const monthH          = Math.floor(monthTimeSecs / 3600);
  const monthM          = Math.floor((monthTimeSecs % 3600) / 60);

  return (
    <div style={{ minHeight: "100vh", background: "var(--cs-black)", color: "var(--cs-white)" }}>

      {/* ── Navbar ── */}
      <header className="cs-app-nav">
        <div className="cs-app-nav-inner">
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none" }}>
            <Image src="/logo.png" alt="Connected Steps" width={36} height={36} className="rounded-full" />
            <span className="font-display" style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--cs-white)" }}>Connected Steps</span>
          </Link>
          <nav className="cs-app-nav-links">
            {[{ label: "Dashboard", href: "/dashboard" }, { label: "Leaderboard", href: "/leaderboard" }, { label: "Community", href: "/community" }, { label: "Achievements", href: "/achievements" }].map((item) => (
              <Link key={item.label} href={item.href} style={{ fontSize: "0.875rem", color: item.label === "Dashboard" ? "var(--cs-orange)" : "var(--cs-muted)", textDecoration: "none" }}>{item.label}</Link>
            ))}
          </nav>
          <div className="cs-app-nav-user">
            <UserMenu user={user as MenuUser} onUserUpdate={(u) => { setUser(u as User); localStorage.setItem("cs_user", JSON.stringify(u)); }} />
            <button className="cs-mobile-nav-toggle" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle menu"><span /><span /><span /></button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="cs-mobile-menu">
            {[{ label: "Dashboard", href: "/dashboard" }, { label: "Leaderboard", href: "/leaderboard" }, { label: "Community", href: "/community" }, { label: "Achievements", href: "/achievements" }].map((item) => (
              <Link key={item.label} href={item.href} onClick={() => setMobileMenuOpen(false)} style={{ fontSize: "0.95rem", color: item.label === "Dashboard" ? "var(--cs-orange)" : "var(--cs-muted)", textDecoration: "none" }}>{item.label}</Link>
            ))}
          </div>
        )}
      </header>

      {/* ── Body ── */}
      <div className="cs-dashboard-body">

        {/* ── Left sidebar ── */}
        <aside>
          <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "1.75rem", textAlign: "center" }}>
            {user.photo ? (
              <img src={user.photo} alt={fullName} style={{ width: "80px", height: "80px", borderRadius: "50%", objectFit: "cover", border: "3px solid var(--cs-orange)", margin: "0 auto 1rem" }} />
            ) : (
              <div style={{ width: "80px", height: "80px", borderRadius: "50%", background: "var(--cs-orange)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", fontWeight: 700, color: "var(--cs-white)", margin: "0 auto 1rem" }}>
                {user.firstName[0]}{user.lastName[0]}
              </div>
            )}
            <div className="font-display" style={{ fontSize: "1.2rem", fontWeight: 600, color: "var(--cs-white)", marginBottom: "0.25rem" }}>{fullName}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--cs-orange)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "1.25rem" }}>{goalLabel[user.goal] ?? user.goal}</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", marginBottom: "1.25rem" }}>
              {[
                { num: String(following.length),  label: "Following", type: "following" as ModalType },
                { num: String(followers.length),  label: "Followers", type: "followers" as ModalType },
                { num: String(activities.length), label: "Activities", type: null },
              ].map((s) => (
                <div key={s.label} style={{ textAlign: "center", cursor: s.type ? "pointer" : "default" }} onClick={() => s.type && setModal(s.type)}>
                  <div style={{ fontSize: "1.1rem", fontWeight: 700, color: s.type ? "var(--cs-orange)" : "var(--cs-white)" }}>{s.num}</div>
                  <div style={{ fontSize: "10px", color: "var(--cs-muted)", marginTop: "2px" }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "1rem", textAlign: "left" }}>
              <div style={{ fontSize: "11px", color: "var(--cs-muted)", marginBottom: "6px" }}>Training location</div>
              <div style={{ fontSize: "0.875rem", color: "var(--cs-white)" }}>📍 {user.location || "—"}</div>
            </div>
          </div>

          {/* Strava connect */}
          {!strava && (
            <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "1.25rem", marginTop: "1rem" }}>
              <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.75rem" }}>Connect Strava</div>
              <p style={{ fontSize: "11px", color: "var(--cs-muted)", lineHeight: 1.6, marginBottom: "0.75rem" }}>
                Pull your real activities and appear on the leaderboard. We store weekly totals only — no GPS data.
              </p>
              <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", cursor: "pointer", marginBottom: "0.75rem" }}>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: "2px", accentColor: "var(--cs-orange)" }} />
                <span style={{ fontSize: "11px", color: "var(--cs-muted)" }}>I agree to share my activity summaries for the leaderboard.</span>
              </label>
              {consent && (
                <a href={stravaAuthUrl} style={{ display: "block", textAlign: "center", padding: "8px", background: "#fc4c02", color: "#fff", borderRadius: "4px", fontSize: "0.8rem", fontWeight: 600, textDecoration: "none" }}>
                  Connect with Strava
                </a>
              )}
            </div>
          )}

          {/* Latest activity */}
          {activities.length > 0 && (
            <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "1.25rem", marginTop: "1rem" }}>
              <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.75rem" }}>Latest Activity</div>
              <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--cs-white)" }}>{activities[0].name}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--cs-muted)", marginTop: "2px" }}>{fmtDate(activities[0].start_date_local)}</div>
              <div style={{ fontSize: "0.875rem", color: "var(--cs-orange)", marginTop: "4px" }}>{(activities[0].distance / 1000).toFixed(1)} km</div>
            </div>
          )}
        </aside>

        {/* ── Main feed — activity cards removed, show session placeholder ── */}
        <main>
          {stravaMsg && (
            <div style={{ background: stravaMsg.includes("success") ? "rgba(232,98,10,0.12)" : "rgba(226,75,74,0.1)", border: `1px solid ${stravaMsg.includes("success") ? "rgba(232,98,10,0.4)" : "rgba(226,75,74,0.3)"}`, borderRadius: "6px", padding: "10px 14px", marginBottom: "1rem", fontSize: "0.8rem", color: stravaMsg.includes("success") ? "var(--cs-orange)" : "#f09595" }}>
              {stravaMsg}
            </div>
          )}

          <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "1rem" }}>
            Training Sessions
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "var(--cs-muted)", fontSize: "0.875rem" }}>Loading…</div>
          ) : (
            <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "3rem", textAlign: "center" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🏃</div>
              <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--cs-white)", marginBottom: "0.5rem" }}>
                Your session history will appear here
              </div>
              <p style={{ fontSize: "0.875rem", color: "var(--cs-muted)", maxWidth: "380px", margin: "0 auto 1.5rem", lineHeight: 1.7 }}>
                Attend a Connected Steps training session and your coach will log your attendance. Your points and progress will show up here automatically.
              </p>
              <Link href="/weekend-run" style={{ display: "inline-block", padding: "10px 24px", background: "var(--cs-orange)", color: "#fff", borderRadius: "4px", textDecoration: "none", fontSize: "0.85rem", fontWeight: 600 }}>
                Register for the next run →
              </Link>
            </div>
          )}
        </main>

        {/* ── Right sidebar ── */}
        <aside>
          {/* Points */}
          <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(232,98,10,0.2)", borderRadius: "8px", padding: "1.25rem", marginBottom: "1rem" }}>
            <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "1rem" }}>Your Points</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              {[
                { label: "This month", value: points?.month_points ?? "—" },
                { label: "All time",  value: points?.total_points ?? "—" },
              ].map((s) => (
                <div key={s.label} style={{ background: "rgba(232,98,10,0.07)", borderRadius: "6px", padding: "0.75rem", textAlign: "center" }}>
                  <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--cs-orange)" }}>{s.value}</div>
                  <div style={{ fontSize: "10px", color: "var(--cs-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: "2px" }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Personal Bests */}
          {pbs && (
            <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "1.25rem", marginBottom: "1rem" }}>
              <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "1rem" }}>Personal Bests</div>
              {[
                { label: "Longest Run",    value: `${(pbs.longestRun / 1000).toFixed(2)} km` },
                { label: "Best Pace",      value: pbs.fastestPace > 0 ? fmtPace(pbs.fastestPace) : "—" },
                { label: "Total Runs",     value: String(pbs.totalRuns) },
                { label: "Total Distance", value: `${pbs.totalKm.toFixed(1)} km` },
              ].map((s) => (
                <div key={s.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.6rem", alignItems: "center" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--cs-muted)" }}>{s.label}</span>
                  <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--cs-orange)" }}>{s.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Weekly Summary */}
          <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "1.25rem", marginBottom: "1rem" }}>
            <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "1rem" }}>Monthly Summary</div>
            {[
              { label: "Runs",     value: strava ? String(monthRuns) : "—" },
              { label: "Distance", value: strava ? `${monthKm.toFixed(1)} km` : "—" },
              { label: "Time",     value: strava ? `${monthH}h ${monthM}m` : "—" },
            ].map((s) => (
              <div key={s.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.6rem" }}>
                <span style={{ fontSize: "0.875rem", color: "var(--cs-muted)" }}>{s.label}</span>
                <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--cs-white)" }}>{s.value}</span>
              </div>
            ))}
            {!strava && <div style={{ fontSize: "11px", color: "var(--cs-muted)", marginTop: "0.5rem" }}>Connect Strava to see this month's stats.</div>}
          </div>

          {/* Community */}
          <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "1.25rem" }}>
            <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "1rem" }}>Community</div>
            <div style={{ fontSize: "0.875rem", color: "var(--cs-off-white)", lineHeight: 1.6 }}>You're now part of the Connected Steps community. Join a group run near {user.location || "you"}!</div>
            <button style={{ marginTop: "1rem", width: "100%", padding: "10px", background: "var(--cs-orange)", color: "var(--cs-white)", border: "none", borderRadius: "4px", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}>
              Find Group Runs
            </button>
          </div>
        </aside>
      </div>

      {/* Followers / Following modal */}
      {modal && (
        <div onClick={() => setModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", padding: "1.5rem", width: "360px", maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <div className="font-display" style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--cs-white)", textTransform: "capitalize" }}>{modal}</div>
              <button onClick={() => setModal(null)} style={{ background: "none", border: "none", color: "var(--cs-muted)", cursor: "pointer", fontSize: "1.2rem" }}>✕</button>
            </div>
            {(modal === "followers" ? followers : following).length === 0 ? (
              <div style={{ textAlign: "center", padding: "2rem 0", color: "var(--cs-muted)", fontSize: "0.875rem" }}>
                {modal === "followers" ? "No followers yet." : "Not following anyone yet."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {(modal === "followers" ? followers : following).map((email) => (
                  <div key={email} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.5rem 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "var(--cs-orange)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 700 }}>
                      {email[0].toUpperCase()}
                    </div>
                    <span style={{ fontSize: "0.875rem", color: "var(--cs-white)" }}>{email}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
