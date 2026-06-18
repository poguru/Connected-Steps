"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import UserMenu, { MenuUser } from "@/components/ui/UserMenu";
import AppNav from "@/components/layout/AppNav";
import { getSupabaseSafe } from "@/lib/supabase";
import MembershipCard from "@/components/ui/MembershipCard";
import UpgradeBanner from "@/components/ui/UpgradeBanner";
import PostSessionUpgradePrompt from "@/components/dashboard/PostSessionUpgradePrompt";
import ReferralCard from "@/components/dashboard/ReferralCard";
import TrainingPlan from "@/components/dashboard/TrainingPlan";
import DashboardHero from "@/components/dashboard/DashboardHero";
import SessionPhotos from "@/components/dashboard/SessionPhotos";
import FollowerFeed from "@/components/dashboard/FollowerFeed";
import CoachChatCard from "@/components/dashboard/CoachChatCard";
import ProgressCard from "@/components/dashboard/ProgressCard";
import SessionPopup from "@/components/dashboard/SessionPopup";

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

// ── Compact expandable session row ───────────────────────────────────────────
function SessionCard({ rec, userEmail, userName }: { rec: SessionRecord; userEmail: string; userName: string }) {
  const s = rec.sessions;
  const [expanded,    setExpanded]    = useState(false);
  const [feedback,    setFeedback]    = useState<FeedbackItem[]>([]);
  const [fbLoaded,    setFbLoaded]    = useState(false);
  const [myRating,    setMyRating]    = useState(0);
  const [myComment,   setMyComment]   = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const [submitted,   setSubmitted]   = useState(false);
  const [fbMsg,       setFbMsg]       = useState("");

  function toggle() {
    if (!expanded && !fbLoaded && s) {
      fetch(`/api/sessions/${s.id}/feedback?email=${encodeURIComponent(userEmail)}`)
        .then(r => r.json())
        .then(d => {
          setFeedback(d.feedback ?? []);
          if (d.myFeedback) { setSubmitted(true); setMyRating(d.myFeedback.rating); setMyComment(d.myFeedback.comment ?? ""); }
          setFbLoaded(true);
        })
        .catch(() => setFbLoaded(true));
    }
    setExpanded(e => !e);
  }

  if (!s) return null;
  const dateStr = new Date(s.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const totalPts = rec.bonus_points ?? 0;

  async function submitFeedback() {
    if (!myRating || !myComment.trim()) { setFbMsg("Please add a star rating and comment."); return; }
    setSubmitting(true); setFbMsg("");
    const res  = await fetch(`/api/sessions/${s!.id}/feedback`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: userEmail, rating: myRating, comment: myComment }),
    });
    const data = await res.json();
    if (res.ok) { setSubmitted(true); setFbMsg("Thanks!"); }
    else { setFbMsg(data.error ?? "Something went wrong."); }
    setSubmitting(false);
  }

  const Stars = ({ value, interactive }: { value: number; interactive?: boolean }) => (
    <div style={{ display:"flex", gap:3 }}>
      {[1,2,3,4,5].map(star => (
        <svg key={star} width={interactive ? 18 : 14} height={interactive ? 18 : 14} viewBox="0 0 24 24"
          onClick={interactive ? () => setMyRating(star) : undefined}
          style={{ cursor: interactive ? "pointer" : "default" }}>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
            fill={star <= value ? "var(--cs-orange)" : "rgba(255,255,255,0.12)"}
            stroke={star <= value ? "var(--cs-orange)" : "rgba(255,255,255,0.15)"} strokeWidth="1" />
        </svg>
      ))}
    </div>
  );

  return (
    <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden" }}>
      {/* ── Compact row — always visible ── */}
      <button
        onClick={toggle}
        style={{ width:"100%", display:"flex", alignItems:"center", gap:"0.75rem", padding:"0.7rem 1rem", background:"none", border:"none", cursor:"pointer", textAlign:"left" }}>
        {/* Status dot */}
        <div style={{ width:8, height:8, borderRadius:"50%", flexShrink:0, background: rec.attended ? "#4ade80" : "rgba(255,255,255,0.2)" }} />
        {/* Date */}
        <span style={{ fontSize:"0.72rem", color:"var(--muted-foreground)", fontFamily:"var(--font-body)", flexShrink:0, width:52 }}>{dateStr}</span>
        {/* Title */}
        <span style={{ fontSize:"0.85rem", fontWeight:600, color:"var(--foreground)", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontFamily:"var(--font-body)" }}>{s.title}</span>
        {/* Points / status */}
        <span style={{ fontSize:"0.75rem", fontWeight:700, color: rec.attended ? (totalPts > 0 ? "var(--cs-orange)" : "#4ade80") : "var(--muted-foreground)", flexShrink:0, fontFamily:"var(--font-body)" }}>
          {rec.attended ? (totalPts > 0 ? `+${totalPts} pts` : "✓") : "—"}
        </span>
        {/* Expand chevron */}
        <span style={{ fontSize:"0.75rem", color:"var(--muted-foreground)", flexShrink:0, fontFamily:"var(--font-body)", transition:"transform 0.2s", display:"inline-block", transform: expanded ? "rotate(180deg)" : "none" }}>▾</span>
      </button>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div style={{ borderTop:"1px solid var(--border)", padding:"0.875rem 1rem", display:"flex", flexDirection:"column", gap:"0.75rem" }}>
          {/* Venue */}
          {(s.venue || s.location) && (
            <div style={{ fontSize:"0.78rem", color:"var(--muted-foreground)" }}>📍 {s.venue || s.location}</div>
          )}
          {rec.bonus_reason && (
            <div style={{ fontSize:"0.75rem", color:"var(--cs-orange)" }}>{rec.bonus_reason}</div>
          )}

          {/* Photos */}
          {rec.attended && <SessionPhotos sessionId={s.id} userEmail={userEmail} userName={userName} />}

          {/* Feedback */}
          {rec.attended && !submitted && (
            <div>
              <div style={{ fontSize:"10px", color:"var(--muted-foreground)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>Rate this session</div>
              <Stars value={myRating} interactive />
              {myRating > 0 && (
                <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:8 }}>
                  <textarea placeholder="Share your experience (required)" value={myComment} onChange={e => setMyComment(e.target.value)}
                    rows={2} maxLength={300}
                    style={{ width:"100%", padding:"8px 10px", background:"rgba(255,255,255,0.04)", border:"1px solid var(--border)", borderRadius:8, color:"var(--foreground)", fontSize:"0.8rem", fontFamily:"var(--font-body)", outline:"none", resize:"none", boxSizing:"border-box" }} />
                  <button onClick={submitFeedback} disabled={submitting}
                    style={{ alignSelf:"flex-start", padding:"6px 14px", background:"var(--gradient-accent)", color:"#fff", border:"none", borderRadius:8, fontSize:"0.78rem", fontWeight:600, cursor: submitting ? "not-allowed" : "pointer", fontFamily:"var(--font-body)", opacity: submitting ? 0.7 : 1 }}>
                    {submitting ? "Submitting…" : "Submit rating"}
                  </button>
                  {fbMsg && <span style={{ fontSize:"0.72rem", color:"#f09595" }}>{fbMsg}</span>}
                </div>
              )}
            </div>
          )}
          {rec.attended && submitted && (
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <Stars value={myRating} />
              <span style={{ fontSize:"0.75rem", color:"var(--muted-foreground)" }}>{fbMsg || "Your rating"}</span>
            </div>
          )}

          {/* Others' reviews */}
          {fbLoaded && feedback.length > 0 && (
            <div style={{ display:"flex", flexDirection:"column", gap:"0.5rem" }}>
              <div style={{ fontSize:"10px", color:"var(--muted-foreground)", textTransform:"uppercase", letterSpacing:"0.08em" }}>{feedback.length} review{feedback.length !== 1 ? "s" : ""}</div>
              {feedback.map(f => (
                <div key={f.id} style={{ background:"rgba(255,255,255,0.03)", borderRadius:8, padding:"0.5rem 0.75rem" }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:3 }}>
                    <span style={{ fontSize:"0.78rem", fontWeight:600, color:"var(--foreground)" }}>{f.user_name}</span>
                    <Stars value={f.rating} />
                  </div>
                  {f.comment && <div style={{ fontSize:"0.75rem", color:"var(--muted-foreground)", lineHeight:1.5 }}>{f.comment}</div>}
                </div>
              ))}
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
  const [followCounts,   setFollowCounts]   = useState<{ followers: number; following: number } | null>(null);
  const [followModal,    setFollowModal]    = useState<"followers" | "following" | null>(null);
  const [followModalUsers, setFollowModalUsers] = useState<{ email: string; name: string }[]>([]);
  const [followModalLoading, setFollowModalLoading] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("cs_user");
    if (!stored) { router.push("/auth"); return; }
    let u: User;
    try {
      u = JSON.parse(stored);
    } catch {
      localStorage.removeItem("cs_user");
      router.push("/auth");
      return;
    }
    setUser(u);

    const storedStrava = localStorage.getItem("cs_strava") || localStorage.getItem(`cs_strava_${u.email}`);
    if (storedStrava) {
      localStorage.setItem("cs_strava", storedStrava);
      localStorage.setItem(`cs_strava_${u.email}`, storedStrava);
      try { setStrava(JSON.parse(storedStrava)); } catch { localStorage.removeItem("cs_strava"); }
    }

    const userToken = localStorage.getItem("cs_user_token") ?? "";
    fetch("/api/leaderboard/user", { headers: { "x-user-token": userToken } })
      .then((r) => r.json())
      .then((d) => { if (d.month_points !== undefined) setPoints(d); })
      .catch(() => {});

    fetch("/api/sessions")
      .then((r) => r.json())
      .then((d) => setUpcomingSessions(d.data ?? []))
      .catch(() => {});

    fetch("/api/user/joined-sessions", { headers: { "x-user-token": userToken } })
      .then((r) => r.json())
      .then((d) => { if (d.session_ids) setJoinedSessionIds(new Set(d.session_ids)); })
      .catch(() => {});

    fetch("/api/user/sessions", { headers: { "x-user-token": userToken } })
      .then((r) => r.json())
      .then((d) => { setSessions(d.sessions ?? []); })
      .catch(() => {})
      .finally(() => setSessLoading(false));

    Promise.all([
      fetch(`/api/follow?email=${encodeURIComponent(u.email)}&type=followers`).then(r => r.json()),
      fetch(`/api/follow?email=${encodeURIComponent(u.email)}&type=following`).then(r => r.json()),
    ]).then(([f1, f2]) => setFollowCounts({ followers: (f1.users ?? []).length, following: (f2.users ?? []).length }))
      .catch(() => {});

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
      router.replace("/community");
    }
  }, [searchParams, router]);

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
        try {
          const email = JSON.parse(currentUser).email;
          localStorage.setItem(`cs_strava_${email}`, JSON.stringify(tokens));
        } catch { /* ignore corrupted user data */ }
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

  // ── Supabase realtime: current user's join/leave events ──────────────────────
  //
  // BEFORE (unfiltered): every INSERT/DELETE on session_attendance is broadcast
  //   to all N connected subscribers. At N concurrent users:
  //     N users × event = N messages per registration
  //   At 1,000 users and 20 registrations/day → 20,000 messages.
  //
  // AFTER (server-side filter): Supabase only delivers events whose
  //   user_email matches this user. One message per event, regardless of N:
  //   1 × 20 = 20 messages/day — 99.9% reduction at 1,000 users.
  //
  // RSVP counts for other users' registrations are no longer real-time;
  // they are correct on page load and updated for this user's own actions.
  useEffect(() => {
    if (!user) return;
    const supabase = getSupabaseSafe();
    if (!supabase) return;
    const channel = supabase
      .channel("dashboard-join-state")
      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "session_attendance",
          filter: `user_email=eq.${user.email}`,
        },
        (payload) => {
          const row = payload.new as Record<string, string> | null;
          const sessionId = row?.session_id;
          if (!sessionId) return;
          setJoinedSessionIds(prev => new Set([...prev, sessionId]));
          setRsvpCounts(prev => ({ ...prev, [sessionId]: (prev[sessionId] ?? 0) + 1 }));
        }
      )
      .on(
        "postgres_changes",
        {
          event:  "DELETE",
          schema: "public",
          table:  "session_attendance",
          filter: `user_email=eq.${user.email}`,
        },
        (payload) => {
          const row = payload.old as Record<string, string> | null;
          const sessionId = row?.session_id;
          if (!sessionId) return;
          setJoinedSessionIds(prev => { const n = new Set(prev); n.delete(sessionId); return n; });
          setRsvpCounts(prev => ({ ...prev, [sessionId]: Math.max(0, (prev[sessionId] ?? 0) - 1) }));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // ── Supabase realtime: coach marks attendance for the current user ──────────
  // Filtered to user_email at the DB level — fires only on UPDATE (attendance
  // marked by coach). INSERT/DELETE are handled by dashboard-join-state above.
  // One API call refreshes history + attendance state + streak in one shot.
  useEffect(() => {
    if (!user) return;
    const supabase = getSupabaseSafe();
    if (!supabase) return;
    const channel = supabase
      .channel("dashboard-attendance-history")
      .on(
        "postgres_changes",
        {
          event:  "UPDATE",
          schema: "public",
          table:  "session_attendance",
          filter: `user_email=eq.${user.email}`,
        },
        () => {
          const tok = localStorage.getItem("cs_user_token") ?? "";
          fetch("/api/user/sessions", { headers: { "x-user-token": tok } })
            .then(r => r.json())
            .then(d => { if (d.sessions) setSessions(d.sessions); })
            .catch(() => {});
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // ── Supabase realtime: live points update when leaderboard row changes ────
  useEffect(() => {
    if (!user) return;
    const supabase = getSupabaseSafe();
    if (!supabase) return;
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

  async function openFollowModal(type: "followers" | "following") {
    if (!user) return;
    setFollowModal(type);
    setFollowModalLoading(true);
    setFollowModalUsers([]);
    try {
      const res  = await fetch(`/api/follow?email=${encodeURIComponent(user.email)}&type=${type}`);
      const data = await res.json();
      setFollowModalUsers(data.users ?? []);
    } finally { setFollowModalLoading(false); }
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

  const _ufirst      = user.firstName ?? "";
  const _ulast       = user.lastName  ?? "";
  const userInitials = `${_ufirst[0] ?? ""}${_ulast[0] ?? ""}`.toUpperCase() || "?";
  const fullName     = `${_ufirst} ${_ulast}`.trim() || user.email;
  const totalAttended = sessions.filter(r => r.attended).length;
  const monthStart    = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const monthAttended = sessions.filter(r => r.attended && r.sessions && new Date(r.sessions.date + "T00:00") >= monthStart).length;

  const ACHIEVEMENTS = [
    { icon: "🏅", label: "First Session", earned: totalAttended >= 1  },
    { icon: "🏃", label: "5 Sessions",    earned: totalAttended >= 5  },
    { icon: "⭐", label: "10 Sessions",   earned: totalAttended >= 10 },
    { icon: "🔥", label: "25 Sessions",   earned: totalAttended >= 25 },
    { icon: "🏆", label: "50 Sessions",   earned: totalAttended >= 50 },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--foreground)" }}>

      {/* Upcoming session popup — shows once per day if session within 24h */}
      <SessionPopup sessions={upcomingSessions} joinedSessionIds={joinedSessionIds} />

      <AppNav
        user={user as MenuUser}
        onUserUpdate={(u) => { setUser(u as User); localStorage.setItem("cs_user", JSON.stringify(u)); }}
        activeLabel="Dashboard"
      />

      {/* ── Body ── */}
      <div className="cs-dashboard-body">

        {/* ── Left sidebar ── */}
        <aside className="cs-db-left">
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "1.75rem", textAlign: "center", boxShadow: "var(--shadow-md)" }}>
            {user.photo ? (
              <img src={user.photo} alt={fullName} style={{ width: "76px", height: "76px", borderRadius: "50%", objectFit: "cover", border: "3px solid var(--cs-orange)", margin: "0 auto 1rem", display: "block" }} />
            ) : (
              <div style={{ width: "76px", height: "76px", borderRadius: "50%", background: "oklch(0.72 0.19 49 / 12%)", border: "3px solid var(--cs-orange)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.6rem", fontWeight: 800, color: "var(--cs-orange)", margin: "0 auto 1rem" }}>
                {userInitials}
              </div>
            )}
            <div className="font-display" style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--cs-white)", marginBottom: "0.2rem" }}>{fullName}</div>
            <div style={{ fontSize: "0.72rem", color: "var(--cs-orange)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "1.5rem", fontWeight: 600 }}>{goalLabel[user.goal] ?? user.goal}</div>

            <div style={{ display: "flex", justifyContent: "center", gap: "1rem", marginBottom: "1.25rem" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--cs-orange)", letterSpacing: "-0.5px" }}>{points?.month_points ?? 0}</div>
                <div style={{ fontSize: "9px", color: "var(--cs-muted)", marginTop: "3px", textTransform: "uppercase", letterSpacing: "0.04em" }}>This Month</div>
              </div>
              <div style={{ width: "1px", background: "rgba(255,255,255,0.06)", margin: "2px 0" }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--cs-white)", letterSpacing: "-0.5px" }}>{points?.total_points ?? 0}</div>
                <div style={{ fontSize: "9px", color: "var(--cs-muted)", marginTop: "3px", textTransform: "uppercase", letterSpacing: "0.04em" }}>All-Time</div>
              </div>
            </div>

            {followCounts !== null && (
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "1rem", display: "flex", justifyContent: "center", gap: "2rem", marginBottom: user.location ? "1rem" : 0 }}>
                {(["followers", "following"] as const).map((type, i) => (
                  <button key={type} onClick={() => openFollowModal(type)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "center" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.7"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}>
                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--cs-white)" }}>{type === "followers" ? followCounts.followers : followCounts.following}</div>
                    <div style={{ fontSize: "9px", color: "var(--cs-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{type}</div>
                  </button>
                )).reduce<React.ReactNode[]>((acc, el, i) => i === 0 ? [el] : [...acc, <div key="div" style={{ width: "1px", background: "rgba(255,255,255,0.06)" }} />, el], [])}
              </div>
            )}

            {user.location && (
              <div style={{ borderTop: followCounts !== null ? "none" : "1px solid rgba(255,255,255,0.06)", paddingTop: followCounts !== null ? 0 : "1rem", textAlign: "left" }}>
                <div style={{ fontSize: "9px", color: "var(--cs-muted)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Location</div>
                <div style={{ fontSize: "0.82rem", color: "var(--cs-white)" }}>📍 {user.location}</div>
              </div>
            )}
          </div>
        </aside>

        {/* ── Main feed ── */}
        <main className="cs-db-main">

          {/* ── 1. Hero (with avatar built in) ── */}
          <DashboardHero
            user={{ firstName: user.firstName, goal: user.goal, location: user.location, photo: user.photo, initials: userInitials }}
            sessions={sessions}
            upcomingSessions={upcomingSessions}
            joinedSessionIds={joinedSessionIds}
          />

          {/* ── Coach Chat ── */}
          <CoachChatCard userEmail={user.email} />

          {/* ── Training Plan — mobile feed (hidden on desktop where sidebar shows it) ── */}
          <div className="cs-mobile-only">
            <TrainingPlan goal={user.goal} email={user.email} />
          </div>

          {/* ── Progress (stats + badges merged) ── */}
          <ProgressCard
            totalPoints={points?.total_points ?? 0}
            monthPoints={points?.month_points ?? 0}
            monthSessions={monthAttended}
            totalSessions={totalAttended}
            achievements={ACHIEVEMENTS}
            loading={sessionsLoading}
          />

          {/* ── Upgrade prompt ── */}
          <PostSessionUpgradePrompt
            totalAttended={totalAttended}
            userEmail={user.email}
            fallback={<UpgradeBanner userEmail={user.email} />}
          />

          {/* ── Community activity ── */}
          <FollowerFeed userEmail={user.email} />
        </main>

        {/* ── Right sidebar ── */}
        <aside className="cs-db-right">

          {/* Referral card */}
          <ReferralCard userEmail={user.email} />

          {/* Training Plan (desktop sidebar only — mobile sees it in main feed) */}
          <div id="training-plan" className="cs-desktop-only">
            <TrainingPlan goal={user.goal} email={user.email} />
          </div>

          {/* Leaderboard + Community links (desktop sidebar only) */}
          <div className="cs-desktop-only">
            <div
              onClick={() => router.push("/leaderboard")}
              style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "0.9rem 1.1rem", marginBottom: "0.75rem", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", boxShadow: "var(--shadow-md)", transition: "opacity 0.15s" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.82"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
            >
              <div>
                <div style={{ fontSize: "10px", color: "var(--cs-muted)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: "2px" }}>Leaderboard</div>
                <div style={{ fontSize: "0.85rem", color: "var(--cs-white)", fontWeight: 600 }}>View rankings</div>
              </div>
              <span style={{ fontSize: "1.25rem" }}>🏆</span>
            </div>

          {/* Community — one card replaces Ask/Story/QA forms */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, marginBottom: "0.75rem", overflow: "hidden", boxShadow: "var(--shadow-md)" }}>
            <div style={{ padding: "0.9rem 1.1rem 0.5rem", fontSize: "10px", color: "var(--cs-muted)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>Community</div>
            {[
              { icon: "📝", label: "Share Your Story",    href: "/community"    },
              { icon: "❓", label: "Ask a Question",      href: "/community"    },
              { icon: "💬", label: "My Coach Q&A",        href: "/my-questions" },
            ].map((item, i, arr) => (
              <div
                key={item.label}
                onClick={() => router.push(item.href)}
                style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1.1rem", borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none", cursor: "pointer", transition: "background 0.12s" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <span style={{ fontSize: "1rem" }}>{item.icon}</span>
                <span style={{ fontSize: "0.82rem", color: "var(--cs-white)", fontWeight: 500, flex: 1 }}>{item.label}</span>
                <span style={{ fontSize: "0.75rem", color: "var(--cs-orange)", fontWeight: 600 }}>→</span>
              </div>
            ))}
          </div>

          </div>{/* end cs-desktop-only: leaderboard + community */}

          {/* Push Notifications (compact) */}
          {pushSupported && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "0.9rem 1.1rem", marginBottom: "0.75rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", boxShadow: "var(--shadow-md)" }}>
              <div>
                <div style={{ fontSize: "10px", color: "var(--cs-muted)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: "2px" }}>Notifications</div>
                <div style={{ fontSize: "0.8rem", color: "var(--cs-white)" }}>{pushEnabled ? "Alerts on" : "Session alerts"}</div>
              </div>
              <button
                onClick={handlePushToggle}
                style={{ flexShrink: 0, padding: "5px 12px", borderRadius: 8, fontSize: "0.75rem", fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)", border: pushEnabled ? "1px solid rgba(74,222,128,0.3)" : "1px solid rgba(232,98,10,0.3)", background: pushEnabled ? "rgba(74,222,128,0.1)" : "rgba(232,98,10,0.1)", color: pushEnabled ? "#4ade80" : "var(--cs-orange)", whiteSpace: "nowrap" }}
              >
                {pushEnabled ? "On ✓" : "Enable"}
              </button>
            </div>
          )}

          {/* Rate Your Coach — desktop only to reduce mobile scroll */}
          <div className="cs-desktop-only">
            <RateCoachWidget
              userEmail={user.email}
              hasAttended={sessionsLoading ? null : sessions.some((r) => r.attended)}
            />
          </div>

          {/* Membership — desktop only to reduce mobile scroll */}
          <div className="cs-desktop-only">
            <MembershipCard email={user.email} name={`${user.firstName} ${user.lastName}`.trim()} />
          </div>

        </aside>
      </div>

      {/* Followers / Following modal */}
      {followModal && (
        <div onClick={() => setFollowModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 380, background: "var(--surface)", borderRadius: 16, overflow: "hidden", boxShadow: "var(--shadow-md)" }}>
            <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--cs-white)", textTransform: "capitalize" }}>{followModal}</span>
              <button onClick={() => setFollowModal(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.1rem", color: "var(--cs-muted)", padding: 0 }}>✕</button>
            </div>
            <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
              {followModalLoading ? (
                <div style={{ padding: "2rem", textAlign: "center", fontSize: "0.82rem", color: "var(--cs-muted)" }}>Loading…</div>
              ) : followModalUsers.length === 0 ? (
                <div style={{ padding: "2rem", textAlign: "center", fontSize: "0.82rem", color: "var(--cs-muted)" }}>
                  {followModal === "followers" ? "No followers yet. Share your profile to get followers!" : "You're not following anyone yet. Check the leaderboard to find runners!"}
                </div>
              ) : (
                followModalUsers.map((u, i) => (
                  <div key={u.email} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1.25rem", borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "oklch(0.72 0.19 49 / 15%)", border: "1px solid oklch(0.72 0.19 49 / 25%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 700, color: "var(--cs-orange)", flexShrink: 0 }}>
                      {u.name?.[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--cs-white)" }}>{u.name}</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--cs-muted)" }}>{u.email}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
