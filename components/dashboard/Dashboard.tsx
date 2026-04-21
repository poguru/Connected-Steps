"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";

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
  id:             number;
  name:           string;
  type:           string;
  start_date_local: string;
  distance:       number;
  moving_time:    number;
  average_speed:  number;
}

const goalLabel: Record<string, string> = {
  "5k":  "First 5K",
  "10k": "10K",
  "half":"Half Marathon",
  "full":"Full Marathon",
};

function fmtDistance(m: number) {
  return `${(m / 1000).toFixed(1)} km`;
}

function fmtPace(mps: number) {
  if (!mps) return "—";
  const secPerKm = 1000 / mps;
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${sec.toString().padStart(2, "0")} /km`;
}

function fmtTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
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
  if (Date.now() / 1000 < tokens.expires_at - 60) {
    return tokens.access_token;
  }
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
  const [user,       setUser]       = useState<User | null>(null);
  const [strava,     setStrava]     = useState<StravaTokens | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [stravaMsg,  setStravaMsg]  = useState("");
  const [consent,    setConsent]    = useState(false);
  const [followers,  setFollowers]  = useState<string[]>([]);
  const [following,  setFollowing]  = useState<string[]>([]);
  const [modal,      setModal]      = useState<ModalType>(null);

  // Load user
  useEffect(() => {
    const stored = localStorage.getItem("cs_user");
    if (!stored) { router.push("/auth"); return; }
    const u: User = JSON.parse(stored);
    setUser(u);

    const storedStrava = localStorage.getItem("cs_strava");
    if (storedStrava) setStrava(JSON.parse(storedStrava));

    // Load followers/following
    Promise.all([
      fetch(`/api/follow?email=${encodeURIComponent(u.email)}&type=followers`).then((r) => r.json()),
      fetch(`/api/follow?email=${encodeURIComponent(u.email)}&type=following`).then((r) => r.json()),
    ]).then(([fwers, fwing]) => {
      if (fwers.users) setFollowers(fwers.users);
      if (fwing.users) setFollowing(fwing.users);
    });
  }, [router]);

  // Handle OAuth callback params
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
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const weekActs  = acts.filter((a) => new Date(a.start_date_local) >= weekAgo);
    const week_runs = weekActs.filter((a) => a.type === "Run").length;
    const week_km   = weekActs.reduce((s, a) => s + a.distance, 0) / 1000;
    const week_time_secs = weekActs.reduce((s, a) => s + a.moving_time, 0);
    const total_runs = acts.filter((a) => a.type === "Run").length;
    const total_km   = acts.reduce((s, a) => s + a.distance, 0) / 1000;

    await getSupabase().from("leaderboard").upsert({
      user_email: user.email,
      user_name:  `${user.firstName} ${user.lastName}`,
      location:   user.location,
      goal:       user.goal,
      week_runs,
      week_km:    parseFloat(week_km.toFixed(2)),
      week_time_secs,
      total_runs,
      total_km:   parseFloat(total_km.toFixed(2)),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_email" });
  }, []);

  const fetchActivities = useCallback(async (tokens: StravaTokens) => {
    setLoading(true);
    try {
      const token = await getValidToken(tokens);
      const res = await fetch(
        "https://www.strava.com/api/v3/athlete/activities?per_page=100",
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Strava ${res.status}: ${errBody}`);
      }
      const data: Activity[] = await res.json();
      setActivities(data);

      // Sync to leaderboard — non-critical, don't let failure block activities
      try {
        const stored = localStorage.getItem("cs_user");
        if (stored) {
          const u: User = JSON.parse(stored);
          await syncToLeaderboard(u, data);
        }
      } catch (syncErr) {
        console.error("Leaderboard sync failed:", syncErr);
        setStravaMsg("Activities loaded! (Leaderboard sync failed: " + (syncErr instanceof Error ? syncErr.message : String(syncErr)) + ")");
      }
    } catch (e: unknown) {
      setStravaMsg("Could not load activities: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }, [syncToLeaderboard]);

  useEffect(() => {
    if (strava) fetchActivities(strava);
  }, [strava, fetchActivities]);

  if (!user) return null;

  const fullName = `${user.firstName} ${user.lastName}`;

  const stravaAuthUrl = `https://www.strava.com/oauth/authorize?client_id=${process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(
    typeof window !== "undefined"
      ? `${window.location.origin}/api/strava/callback`
      : "http://localhost:3000/api/strava/callback"
  )}&response_type=code&approval_prompt=auto&scope=activity:read_all`;

  const weekActivities = activities.filter((a) => {
    const d = new Date(a.start_date_local);
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    return d >= weekAgo;
  });
  const weekRuns     = weekActivities.filter((a) => a.type === "Run").length;
  const weekKm       = weekActivities.reduce((s, a) => s + a.distance, 0) / 1000;
  const weekTimeSecs = weekActivities.reduce((s, a) => s + a.moving_time, 0);
  const weekH        = Math.floor(weekTimeSecs / 3600);
  const weekM        = Math.floor((weekTimeSecs % 3600) / 60);

  return (
    <div style={{ minHeight: "100vh", background: "var(--cs-black)", color: "var(--cs-white)" }}>

      {/* ── Navbar ── */}
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
              { label: "Community",   href: "/community" },
              { label: "Achievements",href: "#" },
            ].map((item) => (
              <Link key={item.label} href={item.href} style={{ fontSize: "0.875rem", color: item.label === "Dashboard" ? "var(--cs-orange)" : "var(--cs-muted)", textDecoration: "none" }}>
                {item.label}
              </Link>
            ))}
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {user.photo ? (
              <img src={user.photo} alt={fullName} style={{ width: "36px", height: "36px", borderRadius: "50%", objectFit: "cover", border: "2px solid var(--cs-orange)" }} />
            ) : (
              <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "var(--cs-orange)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.875rem", fontWeight: 700, color: "var(--cs-white)" }}>
                {user.firstName[0]}{user.lastName[0]}
              </div>
            )}
            <span style={{ fontSize: "0.875rem", color: "var(--cs-white)" }}>{fullName}</span>
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "5rem 2rem 3rem", display: "grid", gridTemplateColumns: "280px 1fr 260px", gap: "2rem" }}>

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
                { num: String(following.length),  label: "Following",   type: "following"  as ModalType },
                { num: String(followers.length),  label: "Followers",   type: "followers"  as ModalType },
                { num: String(activities.length), label: "Activities",  type: null },
              ].map((s) => (
                <div
                  key={s.label}
                  style={{ textAlign: "center", cursor: s.type ? "pointer" : "default" }}
                  onClick={() => s.type && setModal(s.type)}
                >
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

          {/* Strava connect — only show if not yet connected */}
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
                <a
                  href={stravaAuthUrl}
                  style={{ display: "block", textAlign: "center", padding: "8px", background: "#fc4c02", color: "#fff", borderRadius: "4px", fontSize: "0.8rem", fontWeight: 600, textDecoration: "none" }}
                >
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
              <div style={{ fontSize: "0.875rem", color: "var(--cs-orange)", marginTop: "4px" }}>{fmtDistance(activities[0].distance)}</div>
            </div>
          )}
        </aside>

        {/* ── Main feed ── */}
        <main>
          {stravaMsg && (
            <div style={{ background: stravaMsg.includes("success") ? "rgba(232,98,10,0.12)" : "rgba(226,75,74,0.1)", border: `1px solid ${stravaMsg.includes("success") ? "rgba(232,98,10,0.4)" : "rgba(226,75,74,0.3)"}`, borderRadius: "6px", padding: "10px 14px", marginBottom: "1rem", fontSize: "0.8rem", color: stravaMsg.includes("success") ? "var(--cs-orange)" : "#f09595" }}>
              {stravaMsg}
            </div>
          )}

          <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "1rem" }}>
            {strava ? "Your Activities (from Strava)" : "Your Activities"}
          </div>

          {loading && (
            <div style={{ textAlign: "center", padding: "3rem", color: "var(--cs-muted)", fontSize: "0.875rem" }}>
              Loading your Strava activities…
            </div>
          )}

          {!loading && !strava && (
            <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "3rem", textAlign: "center" }}>
              <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>🏃</div>
              <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--cs-white)", marginBottom: "0.5rem" }}>No activities yet</div>
              <div style={{ fontSize: "0.875rem", color: "var(--cs-muted)" }}>Connect your Strava account to see your runs here.</div>
            </div>
          )}

          {!loading && strava && activities.length === 0 && (
            <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "3rem", textAlign: "center" }}>
              <div style={{ fontSize: "0.875rem", color: "var(--cs-muted)" }}>No activities found on your Strava account.</div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {activities.map((a) => (
              <div key={a.id} style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "1.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
                  {user.photo ? (
                    <img src={user.photo} alt={fullName} style={{ width: "40px", height: "40px", borderRadius: "50%", objectFit: "cover", border: "2px solid var(--cs-orange)" }} />
                  ) : (
                    <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "var(--cs-orange)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.875rem", fontWeight: 700, color: "var(--cs-white)" }}>
                      {user.firstName[0]}{user.lastName[0]}
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--cs-white)" }}>{fullName}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--cs-muted)" }}>{fmtDate(a.start_date_local)} · {user.location}</div>
                  </div>
                  <span style={{ marginLeft: "auto", fontSize: "11px", padding: "3px 10px", borderRadius: "20px", background: "rgba(232,98,10,0.15)", color: "var(--cs-orange)", border: "1px solid rgba(232,98,10,0.3)" }}>{a.type}</span>
                </div>

                <div className="font-display" style={{ fontSize: "1.3rem", fontWeight: 300, color: "var(--cs-white)", marginBottom: "1rem" }}>{a.name}</div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1rem", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "1rem" }}>
                  {[
                    { label: "Distance", value: fmtDistance(a.distance) },
                    { label: "Pace",     value: fmtPace(a.average_speed) },
                    { label: "Time",     value: fmtTime(a.moving_time) },
                  ].map((s) => (
                    <div key={s.label}>
                      <div style={{ fontSize: "11px", color: "var(--cs-muted)", marginBottom: "4px" }}>{s.label}</div>
                      <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--cs-white)" }}>{s.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </main>

        {/* ── Right sidebar ── */}
        <aside>
          <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "1.25rem", marginBottom: "1rem" }}>
            <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "1rem" }}>Your Goal</div>
            <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--cs-orange)" }}>{goalLabel[user.goal] ?? user.goal}</div>
            <div style={{ fontSize: "0.8rem", color: "var(--cs-muted)", marginTop: "4px" }}>Keep going — your coach will reach out soon.</div>
          </div>

          <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "1.25rem", marginBottom: "1rem" }}>
            <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "1rem" }}>Weekly Summary</div>
            {[
              { label: "Runs",     value: strava ? String(weekRuns) : "—" },
              { label: "Distance", value: strava ? `${weekKm.toFixed(1)} km` : "—" },
              { label: "Time",     value: strava ? `${weekH}h ${weekM}m` : "—" },
            ].map((s) => (
              <div key={s.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.6rem" }}>
                <span style={{ fontSize: "0.875rem", color: "var(--cs-muted)" }}>{s.label}</span>
                <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--cs-white)" }}>{s.value}</span>
              </div>
            ))}
            {!strava && (
              <div style={{ fontSize: "11px", color: "var(--cs-muted)", marginTop: "0.5rem" }}>Connect Strava to see real stats.</div>
            )}
          </div>

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
        <div
          onClick={() => setModal(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", padding: "1.5rem", width: "360px", maxHeight: "80vh", overflowY: "auto" }}
          >
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
                {(modal === "followers" ? followers : following).map((email) => {
                  const name = email.split("@")[0];
                  return (
                    <div key={email} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "var(--cs-orange)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 700 }}>
                          {name[0].toUpperCase()}
                        </div>
                        <span style={{ fontSize: "0.875rem", color: "var(--cs-white)" }}>{email}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
