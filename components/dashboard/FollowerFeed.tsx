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
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)   return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "oklch(0.72 0.19 49 / 20%)",
      border: "2px solid oklch(0.72 0.19 49 / 40%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.38, fontWeight: 700, color: "var(--cs-orange)",
    }}>
      {name[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

function SessionCard({ event, userEmail }: { event: FeedEvent; userEmail: string }) {
  const [liked,     setLiked]     = useState(false);
  const [kudos,     setKudos]     = useState(0);
  const [showCommentHint, setShowCommentHint] = useState(false);
  const router = useRouter();

  const venue    = event.payload.venue as string;
  const title    = event.payload.session_title as string;
  const photoUrl = event.payload.photo_url as string;
  const dateStr  = new Date(event.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", boxShadow: "var(--shadow-md)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", padding: "0.875rem 1rem" }}>
        <Avatar name={event.actor_name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--cs-white)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.actor_name}</div>
          <div style={{ fontSize: "0.72rem", color: "var(--cs-muted)", marginTop: 1 }}>
            {dateStr}{venue ? ` · 📍 ${venue}` : ""}
          </div>
        </div>
        <span style={{ fontSize: "1rem" }}>🏃</span>
      </div>

      {/* Session title */}
      <div style={{ padding: "0 1rem 0.75rem", fontSize: "1rem", fontWeight: 700, color: "var(--cs-white)" }}>
        {title}
      </div>

      {/* Group photo */}
      {photoUrl && (
        <img src={photoUrl} alt={title} style={{ width: "100%", maxHeight: 260, objectFit: "cover", display: "block" }} />
      )}

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", padding: "0.6rem 1rem", borderTop: "1px solid rgba(255,255,255,0.05)", gap: "0.5rem" }}>
        <span style={{ flex: 1, fontSize: "0.78rem", color: "var(--cs-muted)" }}>
          {kudos > 0 ? `${kudos} ${kudos === 1 ? "kudo" : "kudos"}` : ""}
        </span>
        <button onClick={() => { setLiked(p => !p); setKudos(p => liked ? p - 1 : p + 1); }}
          style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", padding: "6px 12px", borderRadius: 8, color: liked ? "var(--cs-orange)" : "var(--cs-muted)", fontFamily: "inherit", fontSize: "0.8rem", fontWeight: liked ? 700 : 400, transition: "all 0.15s" }}>
          <span style={{ fontSize: "1rem" }}>{liked ? "👍" : "👍"}</span>
          {liked ? "Kudos!" : "Kudos"}
        </button>
        <button onClick={() => router.push("/dashboard")}
          style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", padding: "6px 12px", borderRadius: 8, color: "var(--cs-muted)", fontFamily: "inherit", fontSize: "0.8rem" }}>
          <span style={{ fontSize: "1rem" }}>💬</span>
          Comment
        </button>
      </div>
    </div>
  );
}

function PhotoCard({ event, userEmail }: { event: FeedEvent; userEmail: string }) {
  const [liked,      setLiked]      = useState(false);
  const [likeCount,  setLikeCount]  = useState(0);
  const [showInput,  setShowInput]  = useState(false);
  const [comment,    setComment]    = useState("");
  const [comments,   setComments]   = useState<{ name: string; text: string }[]>([]);

  const photoUrl  = event.payload.photo_url as string;
  const caption   = event.payload.caption as string;
  const sessionId = event.payload.session_id as string;
  const photoId   = event.payload.photo_id as string;

  async function toggleLike() {
    const res  = await fetch(`/api/sessions/${sessionId}/photos/${photoId}?action=like`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_email: userEmail }),
    });
    const data = await res.json();
    const nowLiked = data.action === "liked";
    setLiked(nowLiked);
    setLikeCount(p => nowLiked ? p + 1 : p - 1);
  }

  async function postComment() {
    if (!comment.trim()) return;
    setComments(prev => [...prev, { name: "You", text: comment.trim() }]);
    setComment("");
    setShowInput(false);
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", boxShadow: "var(--shadow-md)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", padding: "0.875rem 1rem" }}>
        <Avatar name={event.actor_name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--cs-white)" }}>{event.actor_name}</div>
          <div style={{ fontSize: "0.72rem", color: "var(--cs-muted)", marginTop: 1 }}>
            {timeAgo(event.created_at)} · 📸 Photo
          </div>
        </div>
      </div>

      {/* Photo */}
      {photoUrl && (
        <img src={photoUrl} alt={caption || "Session photo"} style={{ width: "100%", maxHeight: 340, objectFit: "cover", display: "block" }} />
      )}

      {/* Caption */}
      {caption && (
        <div style={{ padding: "0.6rem 1rem 0.25rem", fontSize: "0.82rem", color: "var(--cs-muted)", lineHeight: 1.5 }}>{caption}</div>
      )}

      {/* Comments */}
      {comments.length > 0 && (
        <div style={{ padding: "0.25rem 1rem 0", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          {comments.map((c, i) => (
            <div key={i} style={{ fontSize: "0.8rem", color: "var(--cs-white)", lineHeight: 1.5 }}>
              <span style={{ fontWeight: 700 }}>{c.name} </span>
              <span style={{ color: "rgba(255,255,255,0.75)" }}>{c.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Comment input */}
      {showInput && (
        <div style={{ display: "flex", gap: "0.4rem", padding: "0.5rem 1rem 0" }}>
          <input
            autoFocus
            type="text" placeholder="Add a comment…" value={comment}
            onChange={e => setComment(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") postComment(); if (e.key === "Escape") setShowInput(false); }}
            style={{ flex: 1, padding: "6px 10px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "var(--cs-white)", fontSize: "0.8rem", fontFamily: "inherit", outline: "none" }}
          />
          <button onClick={postComment} style={{ padding: "6px 12px", background: "var(--cs-orange)", border: "none", borderRadius: 8, color: "#fff", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Post
          </button>
        </div>
      )}

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", padding: "0.6rem 1rem", borderTop: "1px solid rgba(255,255,255,0.05)", gap: "0.5rem", marginTop: "0.4rem" }}>
        <span style={{ flex: 1, fontSize: "0.78rem", color: "var(--cs-muted)" }}>
          {likeCount > 0 ? `${likeCount} ${likeCount === 1 ? "like" : "likes"}` : ""}
        </span>
        <button onClick={toggleLike}
          style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", padding: "6px 12px", borderRadius: 8, color: liked ? "var(--cs-orange)" : "var(--cs-muted)", fontFamily: "inherit", fontSize: "0.8rem", fontWeight: liked ? 700 : 400, transition: "all 0.15s" }}>
          <span style={{ fontSize: "1rem" }}>👍</span>
          {liked ? "Liked" : "Like"}
        </button>
        <button onClick={() => setShowInput(p => !p)}
          style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", padding: "6px 12px", borderRadius: 8, color: "var(--cs-muted)", fontFamily: "inherit", fontSize: "0.8rem" }}>
          <span style={{ fontSize: "1rem" }}>💬</span>
          Comment
        </button>
      </div>
    </div>
  );
}

export default function FollowerFeed({ userEmail }: { userEmail: string }) {
  const [events,  setEvents]  = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/feed?email=${encodeURIComponent(userEmail)}`)
      .then(r => r.json())
      .then(d => setEvents(d.events ?? []))
      .finally(() => setLoading(false));
  }, [userEmail]);

  if (loading || events.length === 0) return null;

  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <div style={{ fontSize: "10px", color: "var(--cs-muted)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: "0.65rem" }}>
        Following Activity
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {events.map(event =>
          event.event_type === "photo_uploaded"
            ? <PhotoCard key={event.id} event={event} userEmail={userEmail} />
            : <SessionCard key={event.id} event={event} userEmail={userEmail} />
        )}
      </div>
    </div>
  );
}
