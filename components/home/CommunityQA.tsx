"use client";

import { useEffect, useState } from "react";

const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  "Recovery":           { bg: "rgba(74,222,128,0.1)",   color: "#4ade80" },
  "Shoes & Gear":       { bg: "rgba(96,165,250,0.1)",   color: "#60a5fa" },
  "Races & Marathons":  { bg: "rgba(232,98,10,0.12)",   color: "#e8620a" },
  "Running Tips":       { bg: "rgba(251,191,36,0.1)",   color: "#fbbf24" },
  "General":            { bg: "rgba(255,255,255,0.06)",  color: "#888"    },
};

const ALL_CATS  = ["All", "Recovery", "Shoes & Gear", "Races & Marathons", "Running Tips", "General"];
const POST_CATS = ["General", "Recovery", "Shoes & Gear", "Races & Marathons", "Running Tips"];

interface Post {
  id: number;
  user_name: string;
  category: string;
  title: string;
  body: string;
  created_at: string;
}

interface Reply {
  id: number;
  user_name: string;
  body: string;
  created_at: string;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// ─── Reply Form ──────────────────────────────────────────────────────────────
function ReplyForm({ postId, onDone }: { postId: number; onDone: () => void }) {
  const [body,   setBody]   = useState("");
  const [saving, setSaving] = useState(false);
  const [msg,    setMsg]    = useState("");

  async function submit() {
    if (!body.trim()) return;
    setSaving(true); setMsg("");
    try {
      const raw  = typeof window !== "undefined" ? localStorage.getItem("cs_user") : null;
      const user = raw ? JSON.parse(raw) : null;
      if (!user?.email) { setMsg("Please log in to reply."); return; }

      const res  = await fetch("/api/community/replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_id:    postId,
          user_email: user.email,
          user_name:  user.name || user.email.split("@")[0],
          body:       body.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error ?? "Error"); return; }
      setMsg("✓ Answer submitted — visible after admin review.");
      setBody("");
      setTimeout(onDone, 2500);
    } catch {
      setMsg("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, 600))}
        placeholder="Write your answer or suggestion… (max 600 characters)"
        rows={3}
        style={{
          width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.12)", borderRadius: "8px",
          color: "#fff", fontSize: "0.82rem", fontFamily: "inherit",
          outline: "none", resize: "vertical", boxSizing: "border-box", lineHeight: 1.6,
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "10px", color: "#555" }}>{body.length}/600</span>
        <button onClick={submit} disabled={saving || !body.trim()}
          style={{
            padding: "7px 18px", background: "#e8620a", color: "#fff", border: "none",
            borderRadius: "6px", fontSize: "0.8rem", fontWeight: 700,
            cursor: saving || !body.trim() ? "not-allowed" : "pointer",
            opacity: saving || !body.trim() ? 0.6 : 1, fontFamily: "inherit",
          }}>
          {saving ? "Posting…" : "Post Answer"}
        </button>
      </div>
      {msg && <div style={{ fontSize: "0.78rem", color: msg.startsWith("✓") ? "#4ade80" : "#f09595" }}>{msg}</div>}
    </div>
  );
}

// ─── Post Card ───────────────────────────────────────────────────────────────
function PostCard({ post, isLoggedIn, onLoginRedirect }: { post: Post; isLoggedIn: boolean; onLoginRedirect: () => void }) {
  const c = CATEGORY_COLORS[post.category] ?? CATEGORY_COLORS["General"];
  const [expanded,      setExpanded]      = useState(false);
  const [replies,       setReplies]       = useState<Reply[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [showReplyForm,  setShowReplyForm]  = useState(false);

  function toggle() {
    if (!expanded) {
      setLoadingReplies(true);
      fetch(`/api/community/replies?post_id=${post.id}`)
        .then((r) => r.json())
        .then((d) => { if (d.replies) setReplies(d.replies); })
        .catch(() => {})
        .finally(() => setLoadingReplies(false));
    }
    setExpanded((v) => !v);
    setShowReplyForm(false);
  }

  function handleReply() {
    if (!isLoggedIn) { onLoginRedirect(); return; }
    if (!expanded) toggle();
    setShowReplyForm(true);
  }

  return (
    <div style={{
      background: "var(--cs-charcoal)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: "10px", padding: "1.25rem",
      display: "flex", flexDirection: "column", gap: "0.75rem",
      transition: "border-color 0.15s",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
        <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", padding: "3px 10px", borderRadius: "20px", background: c.bg, color: c.color }}>
          {post.category}
        </span>
        <span style={{ fontSize: "11px", color: "var(--cs-muted)" }}>{fmtDate(post.created_at)}</span>
      </div>

      {/* Title */}
      <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--cs-white)", lineHeight: 1.4 }}>
        {post.title}
      </div>

      {/* Body */}
      <div style={{ fontSize: "0.82rem", color: "var(--cs-muted)", lineHeight: 1.6 }}>
        {post.body.length > 200 ? post.body.slice(0, 200) + "…" : post.body}
      </div>

      {/* Footer: author + actions */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "0.6rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
        <span style={{ fontSize: "11px", color: "var(--cs-muted)" }}>— {post.user_name}</span>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button onClick={toggle}
            style={{
              fontSize: "11px", color: expanded ? "var(--cs-orange)" : "var(--cs-muted)",
              background: "none", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "20px", padding: "3px 12px", cursor: "pointer", fontFamily: "inherit",
            }}>
            {expanded ? "Hide answers" : `View answers`}
          </button>
          <button onClick={handleReply}
            style={{
              fontSize: "11px", color: "#fff", background: "var(--cs-orange)",
              border: "none", borderRadius: "20px", padding: "3px 12px",
              cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
            }}>
            Answer
          </button>
        </div>
      </div>

      {/* Expanded: replies + reply form */}
      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "0.75rem" }}>
            {loadingReplies ? (
              <div style={{ fontSize: "0.8rem", color: "var(--cs-muted)", textAlign: "center", padding: "0.75rem" }}>Loading answers…</div>
            ) : replies.length === 0 ? (
              <div style={{ fontSize: "0.82rem", color: "var(--cs-muted)", textAlign: "center", padding: "0.75rem" }}>
                No answers yet — be the first to reply!
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {replies.map((r) => {
                  const parts    = r.user_name.trim().split(/\s+/);
                  const initials = parts.length >= 2
                    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
                    : r.user_name[0].toUpperCase();
                  const displayName = parts.length >= 2
                    ? parts[0] + " " + parts[parts.length - 1]
                    : r.user_name;
                  return (
                  <div key={r.id} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                    <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(232,98,10,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", color: "var(--cs-orange)", fontWeight: 700, flexShrink: 0, letterSpacing: "0.02em" }}>
                      {initials}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "11px", color: "var(--cs-muted)", marginBottom: "3px" }}>
                        <span style={{ color: "var(--cs-white)", fontWeight: 600 }}>{displayName}</span> · {fmtDate(r.created_at)}
                      </div>
                      <div style={{ fontSize: "0.85rem", color: "#ccc", lineHeight: 1.6 }}>{r.body}</div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          {showReplyForm && (
            <ReplyForm postId={post.id} onDone={() => setShowReplyForm(false)} />
          )}

          {!showReplyForm && (
            <button onClick={handleReply}
              style={{
                fontSize: "0.8rem", color: "var(--cs-orange)", background: "rgba(232,98,10,0.08)",
                border: "1px solid rgba(232,98,10,0.2)", borderRadius: "6px", padding: "8px",
                cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
              }}>
              + Write an answer
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Ask Modal ───────────────────────────────────────────────────────────────
function AskModal({ onClose, onPosted }: { onClose: () => void; onPosted: () => void }) {
  const [form,   setForm]   = useState({ category: "General", title: "", body: "" });
  const [saving, setSaving] = useState(false);
  const [msg,    setMsg]    = useState("");

  async function submit() {
    if (!form.title.trim() || !form.body.trim()) { setMsg("Please fill in both the title and description."); return; }
    setSaving(true); setMsg("");
    try {
      const raw  = typeof window !== "undefined" ? localStorage.getItem("cs_user") : null;
      const user = raw ? JSON.parse(raw) : null;
      if (!user?.email) { setMsg("Please log in to post."); return; }

      const res  = await fetch("/api/community/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_email: user.email,
          user_name:  user.name || user.email.split("@")[0],
          category:   form.category,
          title:      form.title.trim(),
          body:       form.body.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error ?? "Something went wrong."); return; }
      setMsg("✓ Posted! It will appear after admin review.");
      setTimeout(() => { onPosted(); onClose(); }, 2000);
    } catch { setMsg("Something went wrong. Please try again."); }
    finally { setSaving(false); }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem",
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "#111", border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "14px", padding: "2rem", width: "100%", maxWidth: "500px",
        display: "flex", flexDirection: "column", gap: "1.25rem",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "1rem", fontWeight: 700, color: "#fff" }}>Ask the Community</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#888", fontSize: "1.25rem", cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        <div>
          <div style={{ fontSize: "11px", color: "#888", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>Category</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {POST_CATS.map((cat) => {
              const c = CATEGORY_COLORS[cat];
              const active = form.category === cat;
              return (
                <button key={cat} onClick={() => setForm((f) => ({ ...f, category: cat }))}
                  style={{ padding: "5px 14px", borderRadius: "20px", fontSize: "0.78rem", fontWeight: 500, cursor: "pointer", fontFamily: "inherit", border: "none", background: active ? c.bg : "rgba(255,255,255,0.05)", color: active ? c.color : "#888", outline: active ? `1px solid ${c.color}40` : "none", transition: "all 0.15s" }}>
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div style={{ fontSize: "11px", color: "#888", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>Title / Question</div>
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value.slice(0, 120) }))}
            placeholder="e.g. Best recovery drink after a long run?" maxLength={120}
            style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff", fontSize: "0.875rem", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
          <div style={{ fontSize: "10px", color: "#555", textAlign: "right", marginTop: "3px" }}>{form.title.length}/120</div>
        </div>

        <div>
          <div style={{ fontSize: "11px", color: "#888", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>Details</div>
          <textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value.slice(0, 600) }))}
            placeholder="Share your question, tip, or experience in detail…" maxLength={600} rows={5}
            style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff", fontSize: "0.875rem", outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", lineHeight: 1.6 }} />
          <div style={{ fontSize: "10px", color: "#555", textAlign: "right", marginTop: "3px" }}>{form.body.length}/600</div>
        </div>

        {msg && <div style={{ fontSize: "0.82rem", color: msg.startsWith("✓") ? "#4ade80" : "#f09595", textAlign: "center" }}>{msg}</div>}

        <button onClick={submit} disabled={saving}
          style={{ padding: "12px", background: "#e8620a", color: "#fff", border: "none", borderRadius: "8px", fontSize: "0.9rem", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, fontFamily: "inherit" }}>
          {saving ? "Posting…" : "Post to Community"}
        </button>
      </div>
    </div>
  );
}

// ─── Main Section ────────────────────────────────────────────────────────────
export default function CommunityQA() {
  const [posts,      setPosts]      = useState<Post[]>([]);
  const [activecat,  setActiveCat]  = useState("All");
  const [loading,    setLoading]    = useState(true);
  const [modalOpen,  setModalOpen]  = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem("cs_user") : null;
    setIsLoggedIn(!!raw);
  }, []);

  function loadPosts() {
    setLoading(true);
    fetch("/api/community/posts")
      .then((r) => r.json())
      .then((d) => { if (d.posts) setPosts(d.posts); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadPosts(); }, []);

  function handleAskClick() {
    if (!isLoggedIn) { window.location.href = "/auth"; return; }
    setModalOpen(true);
  }

  const filtered = activecat === "All" ? posts : posts.filter((p) => p.category === activecat);

  return (
    <section className="section" style={{ background: "var(--cs-black)" }}>
      <div className="container">

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem", marginBottom: "2rem" }}>
          <div>
            <span className="gold-line" />
            <div className="section-label" style={{ marginTop: "0.5rem" }}>Community</div>
            <h2 className="font-display mt-2" style={{ fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)", fontWeight: 300, color: "var(--cs-white)" }}>
              Questions &{" "}
              <em className="not-italic" style={{ color: "var(--cs-orange)" }}>Discussions</em>
            </h2>
            <p style={{ fontSize: "0.875rem", color: "var(--cs-muted)", marginTop: "0.5rem" }}>
              Recovery tips, shoe advice, race info — answered by our community.
            </p>
          </div>
        </div>

        {/* Category filter */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "2rem" }}>
          {ALL_CATS.map((cat) => (
            <button key={cat} onClick={() => setActiveCat(cat)}
              style={{ padding: "5px 14px", borderRadius: "20px", fontSize: "0.78rem", fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-body)", border: "none", background: activecat === cat ? "var(--cs-orange)" : "rgba(255,255,255,0.06)", color: activecat === cat ? "#fff" : "var(--cs-muted)", transition: "all 0.15s" }}>
              {cat}
            </button>
          ))}
        </div>

        {/* Posts grid */}
        {loading ? (
          <div style={{ color: "var(--cs-muted)", fontSize: "0.875rem", textAlign: "center", padding: "3rem" }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ background: "var(--cs-charcoal)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", padding: "3rem", textAlign: "center" }}>
            <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>💬</div>
            <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--cs-white)", marginBottom: "0.5rem" }}>No posts yet</div>
            <div style={{ fontSize: "0.82rem", color: "var(--cs-muted)", marginBottom: "1.25rem" }}>Be the first to ask a question or share a tip.</div>
            <button onClick={handleAskClick}
              style={{ padding: "9px 20px", background: "var(--cs-orange)", color: "#fff", border: "none", borderRadius: "6px", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Ask the community →
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1rem" }}>
            {filtered.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                isLoggedIn={isLoggedIn}
                onLoginRedirect={() => { window.location.href = "/auth"; }}
              />
            ))}
          </div>
        )}

      </div>

      {/* Floating Ask button */}
      <button
        onClick={handleAskClick}
        style={{ position: "fixed", bottom: "2rem", right: "2rem", zIndex: 50, display: "flex", alignItems: "center", gap: "8px", padding: "13px 22px", background: "var(--cs-orange)", color: "#fff", border: "none", borderRadius: "50px", fontSize: "0.875rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 20px rgba(232,98,10,0.45)", transition: "transform 0.15s, box-shadow 0.15s" }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 28px rgba(232,98,10,0.55)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(232,98,10,0.45)"; }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Ask a question
      </button>

      {modalOpen && <AskModal onClose={() => setModalOpen(false)} onPosted={loadPosts} />}
    </section>
  );
}
