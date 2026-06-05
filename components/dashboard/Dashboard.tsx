"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import UserMenu, { MenuUser } from "@/components/ui/UserMenu";
import AppNav from "@/components/layout/AppNav";
import { getSupabase } from "@/lib/supabase";
import MembershipCard from "@/components/ui/MembershipCard";
import TrainingPlan from "@/components/dashboard/TrainingPlan";
import AskCoachFab from "@/components/ui/AskCoachFab";
import DashboardHero from "@/components/dashboard/DashboardHero";

interface SessionRecord {
  attended:      boolean;
  bonus_points:  number | null;
  bonus_reason:  string | null;
  points_synced: boolean;
  sessions: {
    id:        number;
    title:     string;
    date:      string;
    time:      string | null;
    venue:     string | null;
    location:  string;
    photo_url: string | null;
  } | null;
}

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

const COACHES = ["Ashokan K", "Durga Rao Vana", "Achyuta Kumari Kolli"];

function RateCoachWidget({ userEmail, hasAttended }: { userEmail: string; hasAttended: boolean | null }) {
  const [coach,   setCoach]   = useState(COACHES[0]);
  const [rating,  setRating]  = useState(5);
  const [feedback,setFeedback]= useState("");
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState("");

  async function submit() {
    setSaving(true); setMsg("");
    try {
      const res  = await fetch("/api/coach-rating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_email: userEmail, coach_name: coach, rating, feedback }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error ?? "Something went wrong."); return; }
      setMsg("✓ Thank you! Your rating has been submitted.");
      setFeedback("");
    } catch { setMsg("Something went wrong."); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "1.25rem" }}>
      <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.75rem" }}>Rate Your Coach</div>
      {hasAttended === null ? (
        <div style={{ fontSize: "0.82rem", color: "var(--cs-muted)" }}>Loading…</div>
      ) : !hasAttended ? (
        <div style={{ fontSize: "0.82rem", color: "var(--cs-muted)", lineHeight: 1.6 }}>
          Attend a Connected Steps training session to rate your coach.
        </div>
      ) : msg ? (
        <div style={{ fontSize: "0.82rem", color: msg.startsWith("✓") ? "#4ade80" : "#f09595", lineHeight: 1.5 }}>
          {msg}
          <button onClick={() => setMsg("")} style={{ display: "block", marginTop: "0.5rem", fontSize: "11px", color: "var(--cs-muted)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", padding: 0 }}>Rate again</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          <select value={coach} onChange={(e) => setCoach(e.target.value)}
            style={{ width: "100%", padding: "9px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "var(--cs-white)", fontSize: "0.82rem", fontFamily: "var(--font-body)", outline: "none", colorScheme: "dark" }}>
            {COACHES.map((c) => <option key={c} value={c} style={{ background: "#1a1a1a" }}>{c}</option>)}
          </select>
          <div>
            <div style={{ fontSize: "11px", color: "var(--cs-muted)", marginBottom: "6px" }}>Your rating</div>
            <div style={{ display: "flex", gap: "6px" }}>
              {[1,2,3,4,5].map((star) => (
                <button key={star} type="button" onClick={() => setRating(star)}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                      fill={star <= rating ? "var(--cs-orange)" : "rgba(255,255,255,0.15)"}
                      stroke={star <= rating ? "var(--cs-orange)" : "rgba(255,255,255,0.2)"} strokeWidth="1" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
          <textarea
            placeholder="Share your experience (optional)"
            rows={3} maxLength={300} value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            style={{ width: "100%", padding: "9px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "var(--cs-white)", fontSize: "0.82rem", fontFamily: "var(--font-body)", outline: "none", resize: "vertical", boxSizing: "border-box" }}
          />
          <button onClick={submit} disabled={saving}
            style={{ width: "100%", padding: "9px", background: "var(--cs-orange)", color: "var(--cs-white)", border: "none", borderRadius: "4px", fontSize: "0.8rem", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", fontFamily: "var(--font-body)", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Submitting…" : "Submit Rating"}
          </button>
        </div>
      )}
    </div>
  );
}

interface FeedbackItem { id: number; user_name: string; rating: number; comment: string; created_at: string; }

function SessionCard({ rec, userEmail }: { rec: SessionRecord; userEmail: string }) {
  const s = rec.sessions;
  const [feedback,    setFeedback]    = useState<FeedbackItem[]>([]);
  const [fbLoading,   setFbLoading]   = useState(true);
  const [showFb,      setShowFb]      = useState(false);
  const [myRating,    setMyRating]    = useState(0);
  const [myComment,   setMyComment]   = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const [submitted,   setSubmitted]   = useState(false);
  const [fbMsg,       setFbMsg]       = useState("");

  useEffect(() => {
    if (!s) return;
    fetch(`/api/sessions/${s.id}/feedback?email=${encodeURIComponent(userEmail)}`)
      .then((r) => r.json())
      .then((d) => {
        setFeedback(d.feedback ?? []);
        if (d.myFeedback) { setSubmitted(true); setMyRating(d.myFeedback.rating); setMyComment(d.myFeedback.comment ?? ""); }
      })
      .finally(() => setFbLoading(false));
  }, [s, userEmail]);

  if (!s) return null;
  const dateStr = new Date(s.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const totalPts = rec.bonus_points ?? 0;

  async function submitFeedback() {
    if (!myRating) return;
    if (!myComment.trim()) { setFbMsg("Please write a review before submitting."); return; }
    setSubmitting(true); setFbMsg("");
    const res  = await fetch(`/api/sessions/${s!.id}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: userEmail, rating: myRating, comment: myComment }),
    });
    const data = await res.json();
    if (res.ok) {
      setSubmitted(true);
      setFbMsg("Thanks for your feedback!");
      const r2 = await fetch(`/api/sessions/${s!.id}/feedback`);
      const d2 = await r2.json();
      setFeedback(d2.feedback ?? []);
    } else {
      setFbMsg(data.error ?? "Something went wrong.");
    }
    setSubmitting(false);
  }

  const Stars = ({ value, interactive }: { value: number; interactive?: boolean }) => (
    <div style={{ display: "flex", gap: "3px" }}>
      {[1,2,3,4,5].map((star) => (
        <svg key={star} width="16" height="16" viewBox="0 0 24 24"
          onClick={interactive ? () => setMyRating(star) : undefined}
          style={{ cursor: interactive ? "pointer" : "default" }}>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
            fill={star <= value ? "var(--cs-orange)" : "rgba(255,255,255,0.15)"}
            stroke={star <= value ? "var(--cs-orange)" : "rgba(255,255,255,0.2)"} strokeWidth="1" />
        </svg>
      ))}
    </div>
  );

  return (
    <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", overflow: "hidden" }}>
      {s.photo_url && (
        <img src={s.photo_url} alt={`${s.title} group photo`} style={{ width: "100%", maxHeight: "220px", objectFit: "cover", display: "block" }} />
      )}
      <div style={{ padding: "1rem 1.25rem", display: "flex", alignItems: "center", gap: "1rem" }}>
        <div style={{ width: "44px", height: "44px", borderRadius: "8px", background: rec.attended ? "rgba(232,98,10,0.12)" : "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem", flexShrink: 0 }}>
          {rec.attended ? "✅" : "❌"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--cs-white)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</div>
          <div style={{ fontSize: "0.78rem", color: "var(--cs-muted)", marginTop: "2px" }}>{dateStr} · 📍 {s.venue || s.location}</div>
          {rec.bonus_reason && <div style={{ fontSize: "0.75rem", color: "var(--cs-orange)", marginTop: "2px" }}>{rec.bonus_reason}</div>}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: "0.8rem", color: rec.attended ? "var(--cs-orange)" : "var(--cs-muted)", fontWeight: 700 }}>
            {rec.attended ? (totalPts > 0 ? `+${totalPts} pts` : "Attended") : "Not attended"}
          </div>
          <div style={{ fontSize: "10px", color: "var(--cs-muted)", marginTop: "2px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {rec.attended ? (totalPts > 0 ? "Bonus points" : "No bonus") : "—"}
          </div>
        </div>
      </div>

      {/* Feedback section */}
      {rec.attended && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "0.875rem 1.25rem" }}>
          {/* Rate prompt / submitted state */}
          {!submitted ? (
            <div>
              <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "0.5rem" }}>Rate this session</div>
              <Stars value={myRating} interactive />
              {myRating > 0 && (
                <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <textarea
                    placeholder="Share your experience (required)"
                    value={myComment} onChange={(e) => setMyComment(e.target.value)}
                    rows={2} maxLength={300}
                    style={{ width: "100%", padding: "8px 10px", background: "rgba(255,255,255,0.04)", border: `1px solid ${!myComment.trim() ? "rgba(240,149,149,0.4)" : "rgba(255,255,255,0.1)"}`, borderRadius: "6px", color: "var(--cs-white)", fontSize: "0.8rem", fontFamily: "var(--font-body)", outline: "none", resize: "none", boxSizing: "border-box" }}
                  />
                  <button onClick={submitFeedback} disabled={submitting}
                    style={{ alignSelf: "flex-start", padding: "7px 16px", background: "var(--cs-orange)", color: "#fff", border: "none", borderRadius: "4px", fontSize: "0.78rem", fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer", fontFamily: "var(--font-body)", opacity: submitting ? 0.7 : 1 }}>
                    {submitting ? "Submitting…" : "Submit"}
                  </button>
                </div>
              )}
              {fbMsg && <div style={{ fontSize: "0.75rem", color: fbMsg.startsWith("Thanks") ? "#4ade80" : "#f09595", marginTop: "0.4rem" }}>{fbMsg}</div>}
            </div>
          ) : (
            <div style={{ fontSize: "0.78rem", color: "var(--cs-muted)" }}>
              Your rating: <Stars value={myRating} />
              {fbMsg && <span style={{ color: "#4ade80", marginLeft: "8px" }}>{fbMsg}</span>}
            </div>
          )}

          {/* All feedback */}
          {!fbLoading && feedback.length > 0 && (
            <div style={{ marginTop: "0.75rem" }}>
              <button onClick={() => setShowFb((p) => !p)}
                style={{ fontSize: "11px", color: "var(--cs-orange)", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "var(--font-body)", letterSpacing: "0.05em" }}>
                {showFb ? "▲ Hide" : `▼ See ${feedback.length} review${feedback.length !== 1 ? "s" : ""}`}
              </button>
              {showFb && (
                <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  {feedback.map((f) => (
                    <div key={f.id} style={{ background: "rgba(255,255,255,0.03)", borderRadius: "6px", padding: "0.6rem 0.75rem" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--cs-white)" }}>{f.user_name}</span>
                        <Stars value={f.rating} />
                      </div>
                      {f.comment && <div style={{ fontSize: "0.78rem", color: "var(--cs-muted)", lineHeight: 1.5 }}>{f.comment}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [user,           setUser]           = useState<User | null>(null);
  const [strava,         setStrava]         = useState<StravaTokens | null>(null);
  const [activities,     setActivities]     = useState<Activity[]>([]);
  const [loading,        setLoading]        = useState(false); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [stravaMsg,      setStravaMsg]      = useState(""); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [pbs,            setPbs]            = useState<PersonalBests | null>(null); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [points,         setPoints]         = useState<{ month_points: number; total_points: number } | null>(null);
  const [sessions,          setSessions]          = useState<SessionRecord[]>([]);
  const [sessionsLoading,   setSessLoading]        = useState(true);
  const [upcomingSessions,  setUpcomingSessions]   = useState<{ id: string; title: string; date: string; time: string | null; venue: string | null; location: string }[]>([]);
  const [joinedSessionIds,  setJoinedSessionIds]   = useState<Set<string>>(new Set());
  const [leaveConfirmId,    setLeaveConfirmId]     = useState<string | null>(null);
  const [leavingId,         setLeavingId]          = useState<string | null>(null);
  const [leaveError,        setLeaveError]         = useState<string>("");
  const [rsvpCounts,     setRsvpCounts]     = useState<Record<string, number>>({});
  const [pushEnabled,    setPushEnabled]    = useState(false);
  const [pushSupported,  setPushSupported]  = useState(false);
  const [storyOpen,      setStoryOpen]      = useState(false);
  const [storyForm,      setStoryForm]      = useState({ quote: "", achievement: "", rating: 5 });
  const [storySaving,    setStorySaving]    = useState(false);
  const [storyMsg,       setStoryMsg]       = useState("");
  const [qaOpen,         setQaOpen]         = useState(false);
  const [qaForm,         setQaForm]         = useState({ category: "General", title: "", body: "" });
  const [qaSaving,       setQaSaving]       = useState(false);
  const [qaMsg,          setQaMsg]          = useState("");

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

    fetch(`/api/leaderboard/user?email=${encodeURIComponent(u.email)}`)
      .then((r) => r.json())
      .then((d) => { if (d.month_points !== undefined) setPoints(d); })
      .catch(() => {});

    fetch("/api/sessions")
      .then((r) => r.json())
      .then((d) => setUpcomingSessions(d.data ?? []))
      .catch(() => {});

    fetch(`/api/user/joined-sessions?email=${encodeURIComponent(u.email)}`)
      .then((r) => r.json())
      .then((d) => { if (d.session_ids) setJoinedSessionIds(new Set(d.session_ids)); })
      .catch(() => {});

    fetch(`/api/user/sessions?email=${encodeURIComponent(u.email)}`)
      .then((r) => r.json())
      .then((d) => { setSessions(d.sessions ?? []); })
      .catch(() => {})
      .finally(() => setSessLoading(false));

    if (typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window) {
      setPushSupported(true);
      navigator.serviceWorker.getRegistration("/sw.js").then((reg) => {
        reg?.pushManager.getSubscription().then((sub) => {
          if (sub) setPushEnabled(true);
        });
      });
    }
  }, [router]);

  useEffect(() => {
    if (searchParams.get("share") === "story") {
      setStoryOpen(true);
      setTimeout(() => {
        document.getElementById("share-story")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
    }
  }, [searchParams]);

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

  // ── Fetch RSVP counts once upcoming sessions are known ───────────────────
  useEffect(() => {
    if (!upcomingSessions.length) return;
    const ids = upcomingSessions.map(s => s.id).join(",");
    fetch(`/api/sessions/rsvp-counts?ids=${ids}`)
      .then(r => r.json())
      .then(d => { if (d.counts) setRsvpCounts(d.counts); })
      .catch(() => {});
  }, [upcomingSessions]);

  // ── Supabase realtime: session_attendance changes ─────────────────────────
  useEffect(() => {
    if (!user) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel("dashboard-session-attendance")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "session_attendance" },
        (payload) => {
          const newRow = payload.new as Record<string, string> | null;
          const oldRow = payload.old as Record<string, string> | null;
          const sessionId = newRow?.session_id ?? oldRow?.session_id;
          const email     = newRow?.user_email  ?? oldRow?.user_email;
          if (!sessionId) return;

          // Keep current user's join state in sync across tabs / devices
          if (email === user.email) {
            if (payload.eventType === "INSERT") {
              setJoinedSessionIds(prev => new Set([...prev, sessionId]));
            } else if (payload.eventType === "DELETE") {
              setJoinedSessionIds(prev => { const n = new Set(prev); n.delete(sessionId); return n; });
            }
          }

          // Update RSVP count for the session
          setRsvpCounts(prev => {
            const cur = prev[sessionId] ?? 0;
            if (payload.eventType === "INSERT") return { ...prev, [sessionId]: cur + 1 };
            if (payload.eventType === "DELETE") return { ...prev, [sessionId]: Math.max(0, cur - 1) };
            return prev;
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // ── Supabase realtime: live points update when leaderboard row changes ────
  useEffect(() => {
    if (!user) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel("dashboard-user-points")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "leaderboard", filter: `user_email=eq.${user.email}` },
        (payload) => {
          const row = payload.new as { month_points?: number; total_points?: number } | null;
          if (row) setPoints({ month_points: row.month_points ?? 0, total_points: row.total_points ?? 0 });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  async function handleLeaveSession(sessionId: string, userEmail: string) {
    setLeavingId(sessionId); setLeaveError("");
    try {
      const res  = await fetch(`/api/sessions/${sessionId}/join`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail }),
      });
      const data = await res.json();
      if (!res.ok) { setLeaveError(data.error ?? "Something went wrong."); return; }
      setJoinedSessionIds((prev) => { const next = new Set(prev); next.delete(sessionId); return next; });
      setLeaveConfirmId(null);
    } catch {
      setLeaveError("Network error. Please try again.");
    } finally {
      setLeavingId(null);
    }
  }

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
        if (stored && data.length > 0) await syncToLeaderboard(JSON.parse(stored), data);
      } catch (e) { console.error("Leaderboard sync failed:", e); }
    } catch (e: unknown) {
      setStravaMsg("Could not load Strava activities: " + (e instanceof Error ? e.message : String(e)));
    } finally { setLoading(false); }
  }, [syncToLeaderboard]);

  useEffect(() => {
    if (strava) fetchActivities(strava);
  }, [strava, fetchActivities]);

  function urlBase64ToUint8Array(base64String: string) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64  = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
  }

  async function handlePushToggle() {
    if (!user) return;
    if (pushEnabled) {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      await sub?.unsubscribe();
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });
      setPushEnabled(false);
    } else {
      try {
        const reg        = await navigator.serviceWorker.register("/sw.js");
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly:      true,
          applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
        });
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: user.email, subscription: sub }),
        });
        setPushEnabled(true);
      } catch (e) { console.error("Push subscribe failed:", e); }
    }
  }

  if (!user) return null;

  const fullName = `${user.firstName} ${user.lastName}`;



  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--foreground)" }}>

      <AppNav
        user={user as MenuUser}
        onUserUpdate={(u) => { setUser(u as User); localStorage.setItem("cs_user", JSON.stringify(u)); }}
        activeLabel="Dashboard"
      />

      {/* ── Body ── */}
      <div className="cs-dashboard-body">

        {/* ── Left sidebar ── */}
        <aside className="cs-db-left">
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "1.75rem", textAlign: "center", boxShadow: "var(--shadow-md)" }}>
            {user.photo ? (
              <img src={user.photo} alt={fullName} style={{ width: "80px", height: "80px", borderRadius: "50%", objectFit: "cover", border: "3px solid var(--cs-orange)", margin: "0 auto 1rem" }} />
            ) : (
              <div style={{ width: "80px", height: "80px", borderRadius: "50%", background: "var(--cs-orange)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", fontWeight: 700, color: "var(--cs-white)", margin: "0 auto 1rem" }}>
                {user.firstName[0]}{user.lastName[0]}
              </div>
            )}
            <div className="font-display" style={{ fontSize: "1.2rem", fontWeight: 600, color: "var(--cs-white)", marginBottom: "0.25rem" }}>{fullName}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--cs-orange)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "1.25rem" }}>{goalLabel[user.goal] ?? user.goal}</div>

            <div style={{ display: "flex", justifyContent: "center", gap: "1.25rem", marginBottom: "1.25rem" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--cs-white)" }}>{activities.length}</div>
                <div style={{ fontSize: "10px", color: "var(--cs-muted)", marginTop: "2px" }}>Activities</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--cs-orange)" }}>{points?.month_points ?? 0}</div>
                <div style={{ fontSize: "10px", color: "var(--cs-muted)", marginTop: "2px" }}>This Month</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--cs-white)" }}>{points?.total_points ?? 0}</div>
                <div style={{ fontSize: "10px", color: "var(--cs-muted)", marginTop: "2px" }}>Total Pts</div>
              </div>
            </div>

            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "1rem", textAlign: "left" }}>
              <div style={{ fontSize: "11px", color: "var(--cs-muted)", marginBottom: "6px" }}>Training location</div>
              <div style={{ fontSize: "0.875rem", color: "var(--cs-white)" }}>📍 {user.location || "—"}</div>
            </div>
          </div>

        </aside>

        {/* ── Main feed ── */}
        <main className="cs-db-main">

          {/* Personalised hero — greeting, today's workout, streak, progress, coach tip */}
          <DashboardHero
            user={{ firstName: user.firstName, goal: user.goal, location: user.location }}
            sessions={sessions}
            upcomingSessions={upcomingSessions}
            joinedSessionIds={joinedSessionIds}
          />

          {/* Mobile-only compact profile card */}
          <div className="cs-mobile-profile-card">
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              {user.photo ? (
                <img src={user.photo} alt={fullName} style={{ width: "48px", height: "48px", borderRadius: "50%", objectFit: "cover", border: "2px solid var(--cs-orange)", flexShrink: 0 }} />
              ) : (
                <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "var(--cs-orange)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                  {user.firstName[0]}{user.lastName[0]}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--cs-white)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fullName}</div>
                <div style={{ fontSize: "0.72rem", color: "var(--cs-orange)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{goalLabel[user.goal] ?? user.goal}</div>
              </div>
              <div style={{ display: "flex", gap: "1rem", flexShrink: 0 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--cs-orange)" }}>{points?.month_points ?? 0}</div>
                  <div style={{ fontSize: "9px", color: "var(--cs-muted)" }}>This Month</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--cs-white)" }}>{points?.total_points ?? 0}</div>
                  <div style={{ fontSize: "9px", color: "var(--cs-muted)" }}>Total Pts</div>
                </div>
              </div>
            </div>
          </div>

          {/* Upcoming Sessions */}
          {upcomingSessions.length > 0 && (
            <div style={{ background: "var(--surface)", border: "1px solid oklch(0.74 0.18 150 / 20%)", borderRadius: 16, padding: "1.25rem", marginBottom: "1.25rem", boxShadow: "var(--shadow-md)" }}>
              <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.75rem" }}>Upcoming Sessions</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {upcomingSessions.map((s) => {
                  const today = new Date(); today.setHours(0,0,0,0);
                  const sessionDate = new Date(s.date + "T00:00:00");
                  const diff = Math.round((sessionDate.getTime() - today.getTime()) / 86400000);
                  const badge = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : `In ${diff}d`;
                  const isUrgent = diff <= 1;
                  const dateStr = sessionDate.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
                  const joined = joinedSessionIds.has(s.id);
                  const rsvpCount = rsvpCounts[s.id] ?? 0;
                  const confirmingLeave = leaveConfirmId === s.id;
                  const isLeaving = leavingId === s.id;
                  return (
                    <div key={s.id} style={{ borderRadius: "6px", background: "rgba(255,255,255,0.03)", border: `1px solid ${joined ? "rgba(74,222,128,0.2)" : "rgba(255,255,255,0.06)"}`, overflow: "hidden" }}>
                      <div onClick={() => !joined && router.push(`/join/${s.id}`)}
                        style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.6rem 0.75rem", cursor: joined ? "default" : "pointer" }}
                        onMouseEnter={(e) => { if (!joined) e.currentTarget.style.opacity = "0.85"; }}
                        onMouseLeave={(e) => { if (!joined) e.currentTarget.style.opacity = "1"; }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--cs-white)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</div>
                          <div style={{ fontSize: "0.72rem", color: "var(--cs-muted)", marginTop: "1px" }}>{dateStr}{s.time ? ` · ${s.time}` : ""}</div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px", flexShrink: 0 }}>
                          <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "20px", background: isUrgent ? "var(--cs-orange)" : "rgba(255,255,255,0.07)", color: isUrgent ? "#fff" : "var(--cs-muted)" }}>{badge}</span>
                          {joined ? <span style={{ fontSize: "0.7rem", color: "#4ade80", fontWeight: 600 }}>✓ Joined</span>
                                  : <span style={{ fontSize: "0.7rem", color: "var(--cs-orange)", fontWeight: 600 }}>Join →</span>}
                          {rsvpCount > 0 && <span style={{ fontSize: "0.65rem", color: "var(--cs-muted)" }}>{rsvpCount} joined</span>}
                        </div>
                      </div>
                      {joined && (
                        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "0.4rem 0.75rem", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                          {!confirmingLeave ? (
                            <button onClick={() => { setLeaveConfirmId(s.id); setLeaveError(""); }}
                              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.7rem", color: "var(--cs-muted)", fontFamily: "inherit", padding: 0 }}>
                              Can't attend? Leave
                            </button>
                          ) : (
                            <>
                              <span style={{ fontSize: "0.7rem", color: "var(--cs-muted)" }}>Sure?</span>
                              <button onClick={() => handleLeaveSession(s.id, user!.email)} disabled={isLeaving}
                                style={{ background: "rgba(226,75,74,0.15)", border: "1px solid rgba(226,75,74,0.3)", borderRadius: "4px", cursor: isLeaving ? "not-allowed" : "pointer", fontSize: "0.7rem", color: "#f09595", fontWeight: 600, fontFamily: "inherit", padding: "2px 10px", opacity: isLeaving ? 0.6 : 1 }}>
                                {isLeaving ? "Leaving…" : "Yes, leave"}
                              </button>
                              <button onClick={() => { setLeaveConfirmId(null); setLeaveError(""); }}
                                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.7rem", color: "var(--cs-muted)", fontFamily: "inherit", padding: 0 }}>
                                Cancel
                              </button>
                            </>
                          )}
                          {leaveError && leaveConfirmId === s.id && <span style={{ fontSize: "0.7rem", color: "#f09595" }}>{leaveError}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {sessionsLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {[1,2,3].map((i) => (
                <div key={i} style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "1rem 1.25rem", display: "flex", gap: "1rem", alignItems: "center" }}>
                  <div style={{ width: "44px", height: "44px", borderRadius: "8px", background: "rgba(255,255,255,0.05)", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ width: "55%", height: "13px", background: "rgba(255,255,255,0.05)", borderRadius: "4px", marginBottom: "8px" }} />
                    <div style={{ width: "35%", height: "10px", background: "rgba(255,255,255,0.04)", borderRadius: "4px" }} />
                  </div>
                </div>
              ))}
            </div>
          ) : sessions.length === 0 ? (
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
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {sessions.map((rec, i) => (
                <SessionCard key={i} rec={rec} userEmail={user.email} />
              ))}
            </div>
          )}
        </main>

        {/* ── Right sidebar ── */}
        <aside className="cs-db-right">
          <div id="training-plan">
            <TrainingPlan goal={user.goal} email={user.email} />
          </div>

          {/* Leaderboard link */}
          <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "1rem 1.25rem", marginBottom: "1rem", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
            onClick={() => router.push("/leaderboard")}>
            <div>
              <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "2px" }}>Leaderboard</div>
              <div style={{ fontSize: "0.85rem", color: "var(--cs-white)", fontWeight: 500 }}>View community rankings</div>
            </div>
            <span style={{ fontSize: "1.2rem" }}>🏆</span>
          </div>

          {/* My Coach Questions link */}
          <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "1rem 1.25rem", marginBottom: "1rem", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
            onClick={() => router.push("/my-questions")}>
            <div>
              <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "2px" }}>Coach Q&A</div>
              <div style={{ fontSize: "0.85rem", color: "var(--cs-white)", fontWeight: 500 }}>My questions & replies</div>
            </div>
            <span style={{ fontSize: "1.2rem" }}>💬</span>
          </div>

          {/* Push Notifications */}
          {pushSupported && (
            <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "1rem 1.25rem", marginBottom: "1rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
              <div>
                <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "2px" }}>Notifications</div>
                <div style={{ fontSize: "0.82rem", color: "var(--cs-white)" }}>{pushEnabled ? "Push alerts on" : "Get session alerts"}</div>
              </div>
              <button
                onClick={handlePushToggle}
                style={{ flexShrink: 0, padding: "6px 14px", borderRadius: "6px", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", border: pushEnabled ? "1px solid rgba(74,222,128,0.3)" : "1px solid rgba(232,98,10,0.3)", background: pushEnabled ? "rgba(74,222,128,0.1)" : "rgba(232,98,10,0.1)", color: pushEnabled ? "#4ade80" : "var(--cs-orange)" }}
              >
                {pushEnabled ? "Disable" : "Enable"}
              </button>
            </div>
          )}

          {/* Share Your Story */}
          <div id="share-story" style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "1.25rem" }}>
            <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.75rem" }}>Share Your Story</div>
            {storyMsg ? (
              <div style={{ fontSize: "0.82rem", color: "#4ade80", lineHeight: 1.5 }}>{storyMsg}</div>
            ) : !storyOpen ? (
              <>
                <div style={{ fontSize: "0.82rem", color: "var(--cs-muted)", lineHeight: 1.5, marginBottom: "0.75rem" }}>
                  Inspire fellow runners — share your journey and it may appear on the homepage.
                </div>
                <button
                  onClick={() => setStoryOpen(true)}
                  style={{ width: "100%", padding: "10px", background: "var(--cs-orange)", color: "var(--cs-white)", border: "none", borderRadius: "4px", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}
                >
                  Write a story
                </button>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {/* Star rating picker */}
                <div>
                  <div style={{ fontSize: "11px", color: "var(--cs-muted)", marginBottom: "6px" }}>Your rating</div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setStoryForm((p) => ({ ...p, rating: star }))}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1 }}
                      >
                        <svg width="22" height="22" viewBox="0 0 14 14"
                          fill={star <= storyForm.rating ? "var(--cs-orange)" : "rgba(255,255,255,0.15)"}
                          style={{ transition: "fill 0.1s" }}>
                          <path d="M7 1l1.55 3.14L12 4.85l-2.5 2.43.59 3.44L7 9.1 4.91 10.72l.59-3.44L3 4.85l3.45-.71L7 1z" />
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  placeholder="Share your running journey… (max 1000 characters)"
                  maxLength={1000}
                  value={storyForm.quote}
                  onChange={(e) => setStoryForm((p) => ({ ...p, quote: e.target.value }))}
                  rows={4}
                  style={{ width: "100%", padding: "10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "var(--cs-white)", fontSize: "0.82rem", fontFamily: "var(--font-body)", outline: "none", resize: "vertical", boxSizing: "border-box" }}
                />
                <input
                  placeholder="Your achievement (e.g. Hyderabad — First 10K)"
                  value={storyForm.achievement}
                  onChange={(e) => setStoryForm((p) => ({ ...p, achievement: e.target.value }))}
                  style={{ width: "100%", padding: "9px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "var(--cs-white)", fontSize: "0.82rem", fontFamily: "var(--font-body)", outline: "none", boxSizing: "border-box" }}
                />
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    disabled={storySaving || !storyForm.quote.trim() || !storyForm.achievement.trim()}
                    onClick={async () => {
                      setStorySaving(true);
                      try {
                        const res = await fetch("/api/stories", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            user_email: user.email,
                            user_name: `${user.firstName} ${user.lastName}`.trim(),
                            quote: storyForm.quote,
                            achievement: storyForm.achievement,
                            rating: storyForm.rating,
                          }),
                        });
                        const data = await res.json();
                        if (!res.ok) { setStoryMsg(data.error || "Failed to submit."); }
                        else { setStoryMsg("Story submitted! It will appear on the homepage once approved."); }
                        setStoryOpen(false);
                      } catch { setStoryMsg("Something went wrong."); }
                      finally { setStorySaving(false); }
                    }}
                    style={{ flex: 1, padding: "9px", background: storySaving ? "rgba(232,98,10,0.5)" : "var(--cs-orange)", color: "var(--cs-white)", border: "none", borderRadius: "4px", fontSize: "0.8rem", fontWeight: 600, cursor: storySaving ? "not-allowed" : "pointer", fontFamily: "var(--font-body)" }}
                  >
                    {storySaving ? "Submitting…" : "Submit"}
                  </button>
                  <button
                    onClick={() => setStoryOpen(false)}
                    style={{ padding: "9px 14px", background: "transparent", color: "var(--cs-muted)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", fontSize: "0.8rem", cursor: "pointer", fontFamily: "var(--font-body)" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Ask the Community */}
          <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "1.25rem", marginBottom: "1rem" }}>
            <div style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.75rem" }}>Ask the Community</div>
            {qaMsg ? (
              <div style={{ fontSize: "0.82rem", color: "#4ade80", lineHeight: 1.5 }}>{qaMsg}</div>
            ) : !qaOpen ? (
              <>
                <div style={{ fontSize: "0.82rem", color: "var(--cs-muted)", lineHeight: 1.5, marginBottom: "0.75rem" }}>
                  Recovery tips, shoe advice, race info — ask the community.
                </div>
                <button
                  onClick={() => setQaOpen(true)}
                  style={{ width: "100%", padding: "10px", background: "rgba(255,255,255,0.07)", color: "var(--cs-white)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "4px", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}
                >
                  Ask a question
                </button>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                <select
                  value={qaForm.category}
                  onChange={(e) => setQaForm((p) => ({ ...p, category: e.target.value }))}
                  style={{ width: "100%", padding: "9px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "var(--cs-white)", fontSize: "0.82rem", fontFamily: "var(--font-body)", outline: "none", colorScheme: "dark" }}
                >
                  {["General", "Recovery", "Shoes & Gear", "Races & Marathons", "Running Tips"].map((c) => (
                    <option key={c} value={c} style={{ background: "#1a1a1a" }}>{c}</option>
                  ))}
                </select>
                <input
                  placeholder="Your question or topic (max 120 chars)"
                  maxLength={120}
                  value={qaForm.title}
                  onChange={(e) => setQaForm((p) => ({ ...p, title: e.target.value }))}
                  style={{ width: "100%", padding: "9px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "var(--cs-white)", fontSize: "0.82rem", fontFamily: "var(--font-body)", outline: "none", boxSizing: "border-box" }}
                />
                <textarea
                  placeholder="Add more details… (max 600 characters)"
                  maxLength={600}
                  value={qaForm.body}
                  onChange={(e) => setQaForm((p) => ({ ...p, body: e.target.value }))}
                  rows={3}
                  style={{ width: "100%", padding: "10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "var(--cs-white)", fontSize: "0.82rem", fontFamily: "var(--font-body)", outline: "none", resize: "vertical", boxSizing: "border-box" }}
                />
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    disabled={qaSaving || !qaForm.title.trim() || !qaForm.body.trim()}
                    onClick={async () => {
                      setQaSaving(true);
                      try {
                        const res = await fetch("/api/community/posts", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            user_email: user.email,
                            user_name: `${user.firstName} ${user.lastName}`.trim(),
                            category: qaForm.category,
                            title: qaForm.title,
                            body: qaForm.body,
                          }),
                        });
                        const data = await res.json();
                        if (!res.ok) setQaMsg(data.error || "Failed to submit.");
                        else setQaMsg("Post submitted! It will appear on the homepage once approved.");
                        setQaOpen(false);
                      } catch { setQaMsg("Something went wrong."); }
                      finally { setQaSaving(false); }
                    }}
                    style={{ flex: 1, padding: "9px", background: qaSaving ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.1)", color: "var(--cs-white)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "4px", fontSize: "0.8rem", fontWeight: 600, cursor: qaSaving ? "not-allowed" : "pointer", fontFamily: "var(--font-body)" }}
                  >
                    {qaSaving ? "Submitting…" : "Submit"}
                  </button>
                  <button
                    onClick={() => setQaOpen(false)}
                    style={{ padding: "9px 14px", background: "transparent", color: "var(--cs-muted)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", fontSize: "0.8rem", cursor: "pointer", fontFamily: "var(--font-body)" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Rate Your Coach */}
          <RateCoachWidget
            userEmail={user.email}
            hasAttended={sessionsLoading ? null : sessions.some((r) => r.attended)}
          />

          {/* Membership */}
          <MembershipCard email={user.email} name={`${user.firstName} ${user.lastName}`.trim()} />

        </aside>
      </div>

      <AskCoachFab />
    </div>
  );
}
