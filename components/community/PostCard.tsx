"use client";

import { useState, useRef } from "react";
import type { UserPost } from "@/app/api/posts/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)   return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function initials(name: string) {
  return name.split(" ").map(n => n[0] ?? "").join("").slice(0, 2).toUpperCase() || "?";
}

const TYPE_LABEL: Record<string, string> = {
  run:         "🏃 Run Update",
  achievement: "🏅 Achievement",
  race:        "🏁 Race Update",
  question:    "❓ Question",
  general:     "",
};

const TYPE_COLOR: Record<string, string> = {
  run:         "#e8620a",
  achievement: "#fbbf24",
  race:        "#4ade80",
  question:    "#60a5fa",
  general:     "",
};

// ── Comment ───────────────────────────────────────────────────────────────────

interface Comment {
  id:           string;
  author_name:  string;
  author_email: string;
  body:         string;
  created_at:   string;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  post:             UserPost;
  currentUserEmail: string;
  onDeleted?:       (id: string) => void;
}

export default function PostCard({ post, currentUserEmail, onDeleted }: Props) {
  const [reactions,     setReactions]     = useState({ like: post.likes, celebrate: post.celebrates, my: post.my_reaction });
  const [commentCount,  setCommentCount]  = useState(post.comments);
  const [showComments,  setShowComments]  = useState(false);
  const [comments,      setComments]      = useState<Comment[]>([]);
  const [commentText,   setCommentText]   = useState("");
  const [loadingCom,    setLoadingCom]    = useState(false);
  const [sendingCom,    setSendingCom]    = useState(false);
  const [showMenu,      setShowMenu]      = useState(false);
  const [reported,      setReported]      = useState(false);
  const [reactBusy,     setReactBusy]     = useState(false);
  const [photoOpen,     setPhotoOpen]     = useState(false);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  const isOwner = post.author_email.toLowerCase() === currentUserEmail.toLowerCase();

  async function react(type: "like" | "celebrate") {
    if (reactBusy) return;
    const prev = { ...reactions };
    setReactions(r => {
      const next = { ...r };
      if (r.my === type)         { next[type] = Math.max(0, next[type] - 1); next.my = null; }
      else if (r.my)             { next[r.my] = Math.max(0, next[r.my] - 1); next[type]++; next.my = type; }
      else                       { next[type]++; next.my = type; }
      return next;
    });
    setReactBusy(true);
    try {
      const res = await fetch(`/api/posts/${post.id}/react`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_email: currentUserEmail, reaction_type: type }),
      });
      if (!res.ok) setReactions(prev);
    } catch { setReactions(prev); }
    finally   { setReactBusy(false); }
  }

  async function loadComments() {
    if (loadingCom || comments.length > 0) { setShowComments(s => !s); return; }
    setShowComments(true);
    setLoadingCom(true);
    const res  = await fetch(`/api/posts/${post.id}/comments`);
    const data = await res.json();
    setComments(data.comments ?? []);
    setLoadingCom(false);
  }

  async function submitComment() {
    if (!commentText.trim() || sendingCom) return;
    const body = commentText.trim();
    setCommentText("");
    setSendingCom(true);
    try {
      const res  = await fetch(`/api/posts/${post.id}/comments`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author_email: currentUserEmail, author_name: "You", body }),
      });
      const data = await res.json();
      if (res.ok) { setComments(prev => [...prev, data.comment]); setCommentCount(c => c + 1); }
    } finally { setSendingCom(false); }
  }

  function userAuthHeaders(): Record<string, string> {
    const token = typeof window !== "undefined" ? localStorage.getItem("cs_user_token") : null;
    return token ? { "Content-Type": "application/json", "x-user-token": token } : { "Content-Type": "application/json" };
  }

  function alertRelogin() {
    alert("Your session has expired. Please log out and log back in, then try again.");
  }

  async function deleteComment(commentId: string) {
    const res = await fetch(`/api/posts/${post.id}/comments/${commentId}`, {
      method: "DELETE", headers: userAuthHeaders(),
    });
    if (res.status === 401) { alertRelogin(); return; }
    setComments(prev => prev.filter(c => c.id !== commentId));
    setCommentCount(c => Math.max(0, c - 1));
  }

  async function deletePost() {
    const res = await fetch(`/api/posts/${post.id}`, {
      method: "DELETE", headers: userAuthHeaders(),
    });
    if (res.status === 401) { alertRelogin(); return; }
    if (res.ok) onDeleted?.(post.id);
  }

  async function reportPost() {
    await fetch(`/api/posts/${post.id}/report`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reporter_email: currentUserEmail }),
    });
    setReported(true);
    setShowMenu(false);
  }

  const typeLabel = TYPE_LABEL[post.post_type];
  const typeColor = TYPE_COLOR[post.post_type];

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.65rem", padding: "0.875rem 0.875rem 0" }}>
        <div style={{ width: 38, height: 38, borderRadius: "50%", background: "oklch(0.72 0.19 49 / 15%)", border: "1px solid oklch(0.72 0.19 49 / 25%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 700, color: "var(--cs-orange)", flexShrink: 0 }}>
          {initials(post.author_name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "0.83rem", fontWeight: 700 }}>{post.author_name.split(" ")[0]}</div>
          <div style={{ fontSize: "10px", color: "var(--muted-foreground)", marginTop: 1 }}>
            {timeAgo(post.created_at)}
            {typeLabel && <span style={{ marginLeft: 6, color: typeColor, fontWeight: 600 }}>{typeLabel}</span>}
          </div>
        </div>
        {/* 3-dot menu */}
        <div style={{ position: "relative" }}>
          <button onClick={() => setShowMenu(m => !m)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 6px", borderRadius: 6, color: "var(--muted-foreground)", fontSize: "1rem", lineHeight: 1 }}>
            ⋯
          </button>
          {showMenu && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setShowMenu(false)} />
              <div style={{ position: "absolute", right: 0, top: "100%", zIndex: 50, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, minWidth: 140, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", overflow: "hidden" }}>
                {isOwner && (
                  <button onClick={deletePost}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem", color: "#f09595", fontFamily: "inherit", borderBottom: "1px solid var(--border)" }}>
                    🗑 Delete post
                  </button>
                )}
                {!isOwner && !reported && (
                  <button onClick={reportPost}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem", color: "var(--muted-foreground)", fontFamily: "inherit" }}>
                    🚩 Report
                  </button>
                )}
                {reported && <div style={{ padding: "9px 14px", fontSize: "0.78rem", color: "#4ade80" }}>Reported ✓</div>}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ padding: "0.6rem 0.875rem 0", fontSize: "0.85rem", lineHeight: 1.6, color: "var(--foreground)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {post.body}
      </div>

      {/* ── Photo ── */}
      {post.photo_url && (
        <button onClick={() => setPhotoOpen(p => !p)}
          style={{ display: "block", width: "100%", padding: 0, border: "none", background: "none", cursor: "pointer", marginTop: "0.6rem" }}>
          <img
            src={post.photo_url}
            alt="Post photo"
            style={{ width: "100%", maxHeight: photoOpen ? 500 : 220, objectFit: "cover", display: "block" }}
          />
        </button>
      )}

      {/* ── Reactions bar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.875rem 0.6rem", borderTop: "1px solid var(--border)", marginTop: "0.6rem" }}>
        <ReactionBtn emoji={reactions.my === "like" ? "❤️" : "🤍"} count={reactions.like} active={reactions.my === "like"} label="Like" onClick={() => react("like")} disabled={reactBusy} />
        <ReactionBtn emoji="🎉" count={reactions.celebrate} active={reactions.my === "celebrate"} label="Celebrate" onClick={() => react("celebrate")} disabled={reactBusy} />
        <button onClick={loadComments}
          style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "5px 12px", borderRadius: 20, border: `1px solid ${showComments ? "oklch(0.72 0.19 49 / 40%)" : "var(--border)"}`, background: showComments ? "oklch(0.72 0.19 49 / 10%)" : "transparent", cursor: "pointer", fontSize: "0.78rem", color: showComments ? "var(--cs-orange)" : "var(--muted-foreground)", fontFamily: "inherit", transition: "all 0.15s" }}>
          <span style={{ fontSize: "1rem" }}>💬</span>
          {commentCount > 0 && <span>{commentCount}</span>}
        </button>
      </div>

      {/* ── Comments section ── */}
      {showComments && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "0.75rem 0.875rem" }}>
          {loadingCom ? (
            <div style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", padding: "0.5rem 0" }}>Loading comments…</div>
          ) : (
            <>
              {comments.map(c => (
                <div key={c.id} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.6rem", alignItems: "flex-start" }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 700, color: "var(--muted-foreground)", flexShrink: 0 }}>
                    {initials(c.author_name)}
                  </div>
                  <div style={{ flex: 1, background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 4 }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700 }}>{c.author_name.split(" ")[0]}</span>
                      <span style={{ fontSize: "9px", color: "var(--muted-foreground)" }}>{timeAgo(c.created_at)}</span>
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", marginTop: 2, lineHeight: 1.5 }}>{c.body}</div>
                  </div>
                  {c.author_email.toLowerCase() === currentUserEmail.toLowerCase() && (
                    <button onClick={() => deleteComment(c.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", fontSize: "0.7rem", padding: "4px", flexShrink: 0, marginTop: 4 }}>
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {comments.length === 0 && <div style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", marginBottom: "0.6rem" }}>No comments yet. Be the first!</div>}
            </>
          )}

          {/* Comment input */}
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
            <textarea
              ref={commentRef}
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
              placeholder="Add a comment…"
              rows={1}
              maxLength={400}
              style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", color: "var(--foreground)", fontSize: "0.8rem", fontFamily: "inherit", resize: "none", outline: "none" }}
            />
            <button onClick={submitComment} disabled={!commentText.trim() || sendingCom}
              style={{ flexShrink: 0, padding: "7px 14px", background: commentText.trim() ? "var(--gradient-accent)" : "transparent", border: `1px solid ${commentText.trim() ? "transparent" : "var(--border)"}`, borderRadius: 8, color: commentText.trim() ? "#fff" : "var(--muted-foreground)", fontSize: "0.78rem", fontWeight: 700, cursor: commentText.trim() ? "pointer" : "not-allowed", fontFamily: "inherit", transition: "all 0.15s" }}>
              {sendingCom ? "…" : "Post"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReactionBtn({ emoji, count, active, label, onClick, disabled }: {
  emoji: string; count: number; active: boolean; label: string; onClick: () => void; disabled: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label}
      style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "5px 12px", borderRadius: 20, border: `1px solid ${active ? "oklch(0.72 0.19 49 / 40%)" : "var(--border)"}`, background: active ? "oklch(0.72 0.19 49 / 10%)" : "transparent", cursor: disabled ? "default" : "pointer", fontFamily: "inherit", fontSize: "0.78rem", fontWeight: active ? 700 : 400, color: active ? "var(--cs-orange)" : "var(--muted-foreground)", transition: "all 0.15s", opacity: disabled ? 0.7 : 1 }}>
      <span style={{ fontSize: "1rem" }}>{emoji}</span>
      {count > 0 && <span>{count}</span>}
    </button>
  );
}
