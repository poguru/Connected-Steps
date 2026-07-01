"use client";

import { useEffect, useState } from "react";
import { Card, Chip, Button, Avatar, Input, Textarea, Alert, Modal, Label, Skeleton, EmptyState, color } from "@/components/ui/ds";

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
      const raw   = typeof window !== "undefined" ? localStorage.getItem("cs_user") : null;
      const token = typeof window !== "undefined" ? (localStorage.getItem("cs_user_token") ?? "") : "";
      const user  = raw ? JSON.parse(raw) : null;
      if (!user?.email || !token) { setMsg("Please log in to reply."); return; }

      const res  = await fetch("/api/community/replies", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-token": token },
        body: JSON.stringify({
          post_id:   postId,
          user_name: user.name || user.firstName || user.email.split("@")[0],
          body:      body.trim(),
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
      <Textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, 600))}
        placeholder="Write your answer or suggestion… (max 600 characters)"
        style={{ minHeight: "76px" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "10px", color: color.textMuted }}>{body.length}/600</span>
        <Button size="sm" loading={saving} disabled={!body.trim()} onClick={submit}>Post Answer</Button>
      </div>
      {msg && <Alert variant={msg.startsWith("✓") ? "success" : "error"}>{msg}</Alert>}
    </div>
  );
}

// ─── Post Card ───────────────────────────────────────────────────────────────
function PostCard({ post, isLoggedIn, onLoginRedirect, likeCount, liked, onLike }: {
  post: Post; isLoggedIn: boolean; onLoginRedirect: () => void;
  likeCount: number; liked: boolean; onLike: () => void;
}) {
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
    <Card style={{ background: "var(--cs-charcoal)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" as const }}>
        <Chip label={post.category} size="xs" color={c.color} />
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
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <Button size="xs" variant={liked ? "primary" : "ghost"}
            onClick={() => { if (!isLoggedIn) { onLoginRedirect(); return; } onLike(); }}>
            ♥{likeCount > 0 ? ` ${likeCount}` : ""}
          </Button>
          <Button size="xs" variant="secondary" onClick={toggle}>
            {expanded ? "Hide answers" : "View answers"}
          </Button>
          <Button size="xs" onClick={handleReply}>Answer</Button>
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
                    <Avatar name={displayName} size={32} />
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
            <Button variant="ghost" size="sm" fullWidth onClick={handleReply}>+ Write an answer</Button>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Ask Modal ───────────────────────────────────────────────────────────────
function AskModal({ onClose, onPosted }: { onClose: () => void; onPosted: () => void }) {
  const [form,   setForm]   = useState({ category: "General", title: "", body: "" });
  const [saving, setSaving] = useState(false);
  const [msg,    setMsg]    = useState("");
  const [errors, setErrors] = useState({ title: false, body: false });

  async function submit() {
    const titleErr = !form.title.trim();
    const bodyErr  = !form.body.trim();
    if (titleErr || bodyErr) { setErrors({ title: titleErr, body: bodyErr }); setMsg("Please fill in all required fields."); return; }
    setErrors({ title: false, body: false });
    setSaving(true); setMsg("");
    try {
      const raw   = typeof window !== "undefined" ? localStorage.getItem("cs_user") : null;
      const token = typeof window !== "undefined" ? (localStorage.getItem("cs_user_token") ?? "") : "";
      const user  = raw ? JSON.parse(raw) : null;
      if (!user?.email || !token) { setMsg("Please log in to post."); return; }

      const res  = await fetch("/api/community/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-token": token },
        body: JSON.stringify({
          user_name: user.name || user.firstName || user.email.split("@")[0],
          category:  form.category,
          title:     form.title.trim(),
          body:      form.body.trim(),
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
    <Modal open onClose={onClose} title="Ask the Community" maxWidth={500}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div>
          <Label>Category</Label>
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: "6px", marginTop: "0.5rem" }}>
            {POST_CATS.map((cat) => (
              <Chip key={cat} label={cat} size="sm"
                color={form.category === cat ? "var(--cs-orange)" : color.textMuted}
                style={{ cursor: "pointer", opacity: form.category === cat ? 1 : 0.7 }}
                onClick={() => setForm((f) => ({ ...f, category: cat }))} />
            ))}
          </div>
        </div>

        <div>
          <Label>Title / Question</Label>
          <Input value={form.title} onChange={(e) => { setForm((f) => ({ ...f, title: e.target.value.slice(0, 120) })); setErrors((er) => ({ ...er, title: false })); }}
            placeholder="e.g. Best recovery drink after a long run?"
            error={errors.title ? "Required" : undefined} style={{ marginTop: "0.5rem" }} />
          <span style={{ fontSize: "10px", color: color.textMuted, float: "right", marginTop: "3px" }}>{form.title.length}/120</span>
        </div>

        <div>
          <Label>Details</Label>
          <Textarea value={form.body} onChange={(e) => { setForm((f) => ({ ...f, body: e.target.value.slice(0, 600) })); setErrors((er) => ({ ...er, body: false })); }}
            placeholder="Share your question, tip, or experience in detail…"
            style={{ marginTop: "0.5rem", minHeight: "120px", borderColor: errors.body ? "#f09595" : undefined }} />
          <span style={{ fontSize: "10px", color: color.textMuted, float: "right", marginTop: "3px" }}>{form.body.length}/600</span>
        </div>

        {msg && <Alert variant={msg.startsWith("✓") ? "success" : "error"}>{msg}</Alert>}

        <Button fullWidth loading={saving} onClick={submit}>Post to Community</Button>
      </div>
    </Modal>
  );
}

// ─── Main Section ────────────────────────────────────────────────────────────
export default function CommunityQA() {
  const [posts,      setPosts]      = useState<Post[]>([]);
  const [activecat,  setActiveCat]  = useState("All");
  const [loading,    setLoading]    = useState(true);
  const [modalOpen,  setModalOpen]  = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [likeCounts, setLikeCounts] = useState<Record<number, number>>({});
  const [likedByMe,  setLikedByMe]  = useState<Set<number>>(new Set());

  useEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem("cs_user") : null;
    setIsLoggedIn(!!raw);
    if (raw && typeof window !== "undefined") {
      // Floating button sets sessionStorage signal
      if (sessionStorage.getItem("cs_open_ask") === "1") {
        sessionStorage.removeItem("cs_open_ask");
        setModalOpen(true);
        return;
      }
      // Auth redirect back with ?ask=1
      const params = new URLSearchParams(window.location.search);
      if (params.get("ask") === "1") {
        setModalOpen(true);
        const url = new URL(window.location.href);
        url.searchParams.delete("ask");
        window.history.replaceState({}, "", url.toString());
      }
    }
  }, []);

  function loadPosts() {
    setLoading(true);
    fetch("/api/community/posts")
      .then((r) => r.json())
      .then((d) => { if (d.posts) setPosts(d.posts); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  function loadLikes() {
    const raw   = typeof window !== "undefined" ? localStorage.getItem("cs_user") : null;
    const email = raw ? (JSON.parse(raw).email ?? "") : "";
    fetch(`/api/community/likes?email=${encodeURIComponent(email)}`)
      .then((r) => r.json())
      .then((d) => {
        setLikeCounts(d.likeCounts ?? {});
        setLikedByMe(new Set(d.likedByMe ?? []));
      })
      .catch(() => {});
  }

  useEffect(() => { loadPosts(); loadLikes(); }, []);

  async function toggleLike(postId: number) {
    const wasLiked = likedByMe.has(postId);
    // Optimistic update
    setLikedByMe((prev) => { const s = new Set(prev); wasLiked ? s.delete(postId) : s.add(postId); return s; });
    setLikeCounts((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] ?? 0) + (wasLiked ? -1 : 1)) }));

    const token = typeof window !== "undefined" ? (localStorage.getItem("cs_user_token") ?? "") : "";
    if (!token) return;
    const res   = await fetch("/api/community/likes", {
      method: "POST", headers: { "Content-Type": "application/json", "x-user-token": token },
      body: JSON.stringify({ post_id: postId }),
    }).catch(() => null);
    if (!res?.ok) return;
    const data = await res.json();
    setLikeCounts((prev) => ({ ...prev, [postId]: data.count }));
  }

  function handleAskClick() {
    if (!isLoggedIn) {
      window.location.href = `/auth?redirect=${encodeURIComponent("/?ask=1#community")}`;
      return;
    }
    setModalOpen(true);
  }

  const filtered = activecat === "All" ? posts : posts.filter((p) => p.category === activecat);

  return (
    <section id="community" className="section" style={{ background: "var(--cs-black)" }}>
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
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {[1, 2, 3].map((i) => (
              <Card key={i} style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
                  <Skeleton width={52} height={20} style={{ borderRadius: "20px" }} />
                  <Skeleton width={70} height={13} />
                </div>
                <Skeleton width="75%" height={15} />
                <Skeleton width="50%" height={11} />
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon="💬" title="No posts yet" body="Be the first to ask a question or share a tip."
            action={<Button onClick={handleAskClick}>Ask the community →</Button>} />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1rem" }}>
            {filtered.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                isLoggedIn={isLoggedIn}
                onLoginRedirect={() => { window.location.href = `/auth?redirect=${encodeURIComponent("/#community")}`; }}
                likeCount={likeCounts[post.id] ?? 0}
                liked={likedByMe.has(post.id)}
                onLike={() => toggleLike(post.id)}
              />
            ))}
          </div>
        )}

      </div>

      {modalOpen && <AskModal onClose={() => setModalOpen(false)} onPosted={loadPosts} />}
    </section>
  );
}
