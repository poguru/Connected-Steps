"use client";

import { useState } from "react";
import type { FeedEvent } from "@/app/api/feed/route";
import PostCard from "@/components/community/PostCard";
import type { UserPost } from "@/app/api/posts/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins <  1)  return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days <  7)  return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function initials(name: string | null | undefined) {
  return (name ?? "").split(" ").map(n => n[0] ?? "").join("").slice(0, 2).toUpperCase() || "?";
}

function eventMeta(event: FeedEvent): { verb: string; icon: string; accent: string } {
  switch (event.event_type) {
    case "session_attended": return { verb: `ran ${event.payload.session_title as string}`,       icon: "🏃", accent: "oklch(0.72 0.19 49 / 18%)" };
    case "photo_uploaded":   return { verb: `shared a photo${event.payload.session_title ? ` from ${event.payload.session_title as string}` : ""}`, icon: "📸", accent: "oklch(0.65 0.15 200 / 18%)" };
    case "badge_earned":     return { verb: `earned the ${event.payload.badge as string} badge`,  icon: event.payload.icon as string || "🏅", accent: "oklch(0.78 0.18 90 / 18%)" };
    case "member_joined":    return { verb: "joined Connected Steps 👋",                           icon: "✨", accent: "oklch(0.65 0.20 280 / 18%)" };
    default:                 return { verb: "was active",                                          icon: "⚡", accent: "transparent" };
  }
}

// ── FeedItem ──────────────────────────────────────────────────────────────────

interface Props {
  event:            FeedEvent;
  currentUserEmail: string;
  compact?:         boolean;   // dashboard widget = tighter layout
}

export default function FeedItem({ event, currentUserEmail, compact = false }: Props) {
  const [reactions, setReactions] = useState(event.reactions);
  const [imgExpanded, setImgExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  // user_post events render as a full PostCard
  if (event.event_type === "user_post") {
    const post: UserPost = {
      id:           event.payload.post_id as string,
      author_email: event.actor_email,
      author_name:  event.actor_name,
      post_type:    event.payload.post_type as UserPost["post_type"],
      body:         event.payload.body as string,
      photo_url:    (event.payload.photo_url as string) || null,
      approved:     true,
      created_at:   event.created_at,
      likes:        event.reactions.like,
      celebrates:   event.reactions.celebrate,
      comments:     0,
      my_reaction:  event.reactions.my_reaction,
    };
    return <PostCard post={post} currentUserEmail={currentUserEmail} />;
  }

  const { verb, icon, accent } = eventMeta(event);
  const photoUrl  = event.payload.photo_url  as string | undefined;
  const hasPhoto  = !!photoUrl;
  const firstName = (event.actor_name ?? "Member").split(" ")[0] || "Member";

  async function react(type: "like" | "celebrate") {
    if (busy) return;
    // Optimistic update
    const prev = { ...reactions };
    const isSame = reactions.my_reaction === type;
    setReactions(r => {
      const next = { ...r };
      if (isSame) {
        next[type] = Math.max(0, next[type] - 1);
        next.my_reaction = null;
      } else {
        if (r.my_reaction) next[r.my_reaction] = Math.max(0, next[r.my_reaction] - 1);
        next[type]++;
        next.my_reaction = type;
      }
      return next;
    });

    setBusy(true);
    try {
      const token = typeof window !== "undefined" ? (localStorage.getItem("cs_user_token") ?? "") : "";
      const res = await fetch("/api/feed/react", {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-user-token": token },
        body: JSON.stringify({ feed_event_id: event.id, reaction_type: type }),
      });
      if (!res.ok) setReactions(prev);
    } catch {
      setReactions(prev);
    } finally {
      setBusy(false);
    }
  }

  const pad  = compact ? "0.6rem 0.875rem" : "0.875rem 1rem";
  const ava  = compact ? 32 : 40;
  const fs   = compact ? "0.78rem" : "0.85rem";
  const fsTs = compact ? "10px" : "11px";

  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 14,
      overflow: "hidden",
      transition: "border-color 0.15s",
    }}>
      {/* ── Main row ── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.65rem", padding: pad }}>

        {/* Avatar */}
        <div style={{
          width: ava, height: ava, borderRadius: "50%", flexShrink: 0,
          background: accent,
          border: "1.5px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: compact ? "0.72rem" : "0.8rem", fontWeight: 700, color: "var(--cs-orange)",
        }}>
          {initials(event.actor_name)}
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: fs, lineHeight: 1.4, color: "var(--foreground)" }}>
            <span style={{ fontWeight: 700 }}>{firstName}</span>
            {"  "}
            <span style={{ color: "var(--muted-foreground)" }}>{verb}</span>
          </div>

          {/* Session venue sub-line */}
          {event.event_type === "session_attended" && event.payload.venue && (
            <div style={{ fontSize: fsTs, color: "var(--muted-foreground)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              📍 {event.payload.venue as string}
            </div>
          )}
          {/* Photo caption */}
          {event.event_type === "photo_uploaded" && event.payload.caption && (
            <div style={{ fontSize: fsTs, color: "var(--muted-foreground)", marginTop: 2, fontStyle: "italic" }}>
              "{event.payload.caption as string}"
            </div>
          )}

          <div style={{ fontSize: fsTs, color: "var(--muted-foreground)", marginTop: 3 }}>
            {timeAgo(event.created_at)}
          </div>
        </div>

        {/* Right: event icon + photo toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
          <span style={{ fontSize: compact ? "1rem" : "1.15rem" }}>{icon}</span>
          {hasPhoto && (
            <button
              onClick={() => setImgExpanded(e => !e)}
              aria-label={imgExpanded ? "Collapse photo" : "Expand photo"}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 6px", borderRadius: 6, fontSize: "0.68rem", color: "var(--muted-foreground)", fontFamily: "inherit", lineHeight: 1 }}>
              {imgExpanded ? "▲" : "▼"}
            </button>
          )}
        </div>
      </div>

      {/* ── Inline photo preview (collapsed by default for compact, open for full) ── */}
      {hasPhoto && !compact && !imgExpanded && (
        <button
          onClick={() => setImgExpanded(true)}
          style={{ display: "block", width: "100%", padding: 0, border: "none", background: "none", cursor: "pointer" }}>
          <div style={{
            height: 160, overflow: "hidden",
            background: `url(${photoUrl}) center/cover no-repeat`,
            opacity: 0.85,
          }} />
        </button>
      )}

      {/* ── Expanded full photo ── */}
      {hasPhoto && imgExpanded && (
        <img
          src={photoUrl}
          alt="Activity photo"
          style={{ width: "100%", maxHeight: compact ? 200 : 340, objectFit: "cover", display: "block" }}
        />
      )}

      {/* ── Reactions bar ── */}
      {!compact && (
        <div style={{
          display: "flex", alignItems: "center", gap: "0.5rem",
          padding: "0.5rem 1rem 0.65rem",
          borderTop: "1px solid var(--border)",
        }}>
          {/* Like */}
          <ReactionBtn
            emoji={reactions.my_reaction === "like" ? "❤️" : "🤍"}
            count={reactions.like}
            active={reactions.my_reaction === "like"}
            label="Like"
            onClick={() => react("like")}
            disabled={busy}
          />
          {/* Celebrate */}
          <ReactionBtn
            emoji="🎉"
            count={reactions.celebrate}
            active={reactions.my_reaction === "celebrate"}
            label="Celebrate"
            onClick={() => react("celebrate")}
            disabled={busy}
          />
        </div>
      )}

      {/* ── Compact like-only ── */}
      {compact && (event.event_type === "session_attended" || event.event_type === "photo_uploaded") && (
        <div style={{ padding: "0 0.875rem 0.6rem", display: "flex", gap: "0.4rem" }}>
          <ReactionBtn
            emoji={reactions.my_reaction === "like" ? "❤️" : "🤍"}
            count={reactions.like}
            active={reactions.my_reaction === "like"}
            label="Like"
            onClick={() => react("like")}
            disabled={busy}
            small
          />
        </div>
      )}
    </div>
  );
}

// ── Reaction button ───────────────────────────────────────────────────────────

function ReactionBtn({
  emoji, count, active, label, onClick, disabled, small = false,
}: {
  emoji: string; count: number; active: boolean; label: string;
  onClick: () => void; disabled: boolean; small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        display: "flex", alignItems: "center", gap: "0.3rem",
        padding: small ? "3px 8px" : "5px 12px",
        borderRadius: 20,
        border: `1px solid ${active ? "oklch(0.72 0.19 49 / 40%)" : "var(--border)"}`,
        background: active ? "oklch(0.72 0.19 49 / 10%)" : "transparent",
        cursor: disabled ? "default" : "pointer",
        fontFamily: "inherit",
        fontSize: small ? "0.7rem" : "0.78rem",
        fontWeight: active ? 700 : 400,
        color: active ? "var(--cs-orange)" : "var(--muted-foreground)",
        transition: "all 0.15s",
        opacity: disabled ? 0.7 : 1,
      }}>
      <span style={{ fontSize: small ? "0.85rem" : "1rem" }}>{emoji}</span>
      {count > 0 && <span>{count}</span>}
    </button>
  );
}
