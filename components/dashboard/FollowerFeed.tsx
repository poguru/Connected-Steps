"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface FeedEvent {
  id:          string;
  actor_email: string;
  actor_name:  string;
  event_type:  "session_attended" | "photo_uploaded" | "badge_earned";
  payload:     Record<string, string | number>;
  created_at:  string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function feedCopy(event: FeedEvent) {
  if (event.event_type === "session_attended") return `attended ${event.payload.session_title as string}`;
  if (event.event_type === "photo_uploaded")   return "uploaded a photo";
  if (event.event_type === "badge_earned")     return `earned ${event.payload.badge as string}`;
  return "was active";
}
function feedIcon(event: FeedEvent) {
  if (event.event_type === "session_attended") return "🏃";
  if (event.event_type === "photo_uploaded")   return "📸";
  if (event.event_type === "badge_earned")     return "🏅";
  return "⚡";
}

// ── Compact activity row — expandable photo ────────────────────────────────
function FeedRow({ event, userEmail }: { event: FeedEvent; userEmail: string }) {
  const [liked,    setLiked]    = useState(false);
  const [expanded, setExpanded] = useState(false);
  const photoUrl  = event.payload.photo_url as string | undefined;
  const sessionId = event.payload.session_id as string | undefined;
  const photoId   = event.payload.photo_id as string | undefined;

  async function handleLike() {
    const wasLiked = liked;
    setLiked(!wasLiked); // optimistic
    if (sessionId && photoId) {
      await fetch(`/api/sessions/${sessionId}/photos/${photoId}?action=like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_email: userEmail }),
      }).catch(() => setLiked(wasLiked)); // revert on error
    }
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
      {/* Compact row */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.65rem 0.875rem" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "oklch(0.72 0.19 49 / 15%)", border: "1px solid oklch(0.72 0.19 49 / 25%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700, color: "var(--cs-orange)", flexShrink: 0 }}>
          {event.actor_name.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "0.8rem", color: "var(--foreground)", lineHeight: 1.35 }}>
            <span style={{ fontWeight: 700 }}>{event.actor_name.split(" ")[0]}</span>
            {"  "}
            <span style={{ color: "var(--muted-foreground)" }}>{feedCopy(event)}</span>
          </div>
          <div style={{ fontSize: "0.68rem", color: "var(--muted-foreground)", marginTop: 2 }}>{timeAgo(event.created_at)}</div>
        </div>
        <span style={{ fontSize: "1rem", flexShrink: 0 }}>{feedIcon(event)}</span>
        {/* Like button — only for session + photo events */}
        {(event.event_type === "session_attended" || event.event_type === "photo_uploaded") && (
          <button onClick={handleLike} style={{
            background: "none", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: 6,
            fontSize: "0.75rem", fontWeight: liked ? 700 : 400, display: "flex", alignItems: "center", gap: 3,
            color: liked ? "var(--cs-orange)" : "var(--muted-foreground)", fontFamily: "inherit",
          }}>
            {liked ? "❤️" : "🤍"}
          </button>
        )}
        {/* Photo expand toggle */}
        {photoUrl && (
          <button onClick={() => setExpanded(e => !e)} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 6px", borderRadius: 6, fontSize: "0.7rem", color: "var(--muted-foreground)", fontFamily: "inherit" }}>
            {expanded ? "▲" : "▼"}
          </button>
        )}
      </div>
      {/* Expanded photo */}
      {photoUrl && expanded && (
        <img src={photoUrl} alt="Activity photo" style={{ width: "100%", maxHeight: 220, objectFit: "cover", display: "block" }} />
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function FollowerFeed({ userEmail }: { userEmail: string }) {
  const router  = useRouter();
  const [events,  setEvents]  = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/feed?email=${encodeURIComponent(userEmail)}`)
      .then(r => r.json())
      .then(d => setEvents(d.events ?? []))
      .finally(() => setLoading(false));
  }, [userEmail]);

  return (
    <div style={{ marginBottom: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
        <span style={{ fontSize: "10px", color: "var(--muted-foreground)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>
          Following Activity
        </span>
        {!loading && events.length > 0 && (
          <span style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>{events.length} events</span>
        )}
      </div>

      {loading ? (
        /* Skeleton — preserves layout space, no jump */
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          {[1,2,3].map((i, idx) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.65rem 0.875rem", borderTop: idx > 0 ? "1px solid var(--border)" : "none" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ width: "55%", height: 10, background: "rgba(255,255,255,0.06)", borderRadius: 4, marginBottom: 5 }} />
                <div style={{ width: "30%", height: 8,  background: "rgba(255,255,255,0.04)", borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "1.25rem" }}>👥</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: 2 }}>No activity yet</div>
            <div style={{ fontSize: "0.72rem", color: "var(--muted-foreground)" }}>Follow runners to see their sessions and photos here.</div>
          </div>
          <button onClick={() => router.push("/community")} style={{ flexShrink: 0, padding: "6px 12px", background: "var(--gradient-accent)", color: "#fff", border: "none", borderRadius: 8, fontSize: "0.72rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "var(--shadow-orange)", whiteSpace: "nowrap" }}>
            Find runners
          </button>
        </div>
      ) : (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          {events.map((event, i) => (
            <div key={event.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : "none" }}>
              <FeedRow event={event} userEmail={userEmail} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
