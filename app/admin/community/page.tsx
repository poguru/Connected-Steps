"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

interface Post {
  id: number;
  user_email: string;
  user_name: string;
  category: string;
  title: string;
  body: string;
  approved: boolean;
  created_at: string;
}

interface Reply {
  id: number;
  post_id: number;
  user_email: string;
  user_name: string;
  body: string;
  approved: boolean;
  created_at: string;
  community_posts: { title: string; category: string } | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  "Recovery": "#4ade80", "Shoes & Gear": "#60a5fa",
  "Races & Marathons": "#e8620a", "Running Tips": "#fbbf24", "General": "#888",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminCommunityPage() {
  const [pw,      setPw]      = useState("");
  const [authed,  setAuthed]  = useState(true);
  const [posts,   setPosts]   = useState<Post[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [actingPost,    setActingPost]    = useState<number | null>(null);
  const [actingReply,   setActingReply]   = useState<number | null>(null);
  const [approvingAll,  setApprovingAll]  = useState(false);

  async function login(password: string) {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) { setError("Incorrect password."); return; }
      setAuthed(true);
    } catch { setError("Network error."); }
    finally { setLoading(false); }
  }

  async function load() {
    setLoading(true); setError("");
    try {
      const [postsRes, repliesRes] = await Promise.all([
        fetch("/api/admin/community"),
        fetch("/api/admin/community/replies"),
      ]);
      const postsData   = await postsRes.json();
      const repliesData = await repliesRes.json();
      if (!postsRes.ok)   { setError(postsData.error ?? "Failed"); return; }
      if (!repliesRes.ok) { setError(repliesData.error ?? "Failed"); return; }
      setPosts(postsData.posts);
      setReplies(repliesData.replies);
    } catch { setError("Something went wrong."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    fetch("/api/admin/auth").then(r => { if (r.ok) setAuthed(true); }).catch(() => {});
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (authed) load(); }, [authed]);

  async function approveAll() {
    setApprovingAll(true);
    try {
      const res = await fetch("/api/admin/community", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve_all" }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? `Approve failed (${res.status})`); return; }
      setPosts((prev) => prev.map((p) => ({ ...p, approved: true })));
    } catch { setError("Network error during approve all."); }
    finally { setApprovingAll(false); }
  }

  async function actPost(id: number, action: "approve" | "reject") {
    setActingPost(id);
    try {
      const res = await fetch("/api/admin/community", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? `Action failed (${res.status}) — session may have expired, refresh the page.`);
        return;
      }
      setPosts((prev) =>
        action === "reject"
          ? prev.filter((p) => p.id !== id)
          : prev.map((p) => p.id === id ? { ...p, approved: true } : p)
      );
    } catch { setError("Network error. Please try again."); }
    finally { setActingPost(null); }
  }

  async function actReply(id: number, action: "approve" | "reject") {
    setActingReply(id);
    try {
      const res = await fetch("/api/admin/community/replies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? `Action failed (${res.status}) — session may have expired, refresh the page.`);
        return;
      }
      setReplies((prev) =>
        action === "reject"
          ? prev.filter((r) => r.id !== id)
          : prev.map((r) => r.id === id ? { ...r, approved: true } : r)
      );
    } catch { setError("Network error. Please try again."); }
    finally { setActingReply(null); }
  }

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "2rem", width: "320px" }}>
          <div style={{ fontSize: "1rem", fontWeight: 600, color: "#fff", marginBottom: "1.25rem" }}>Admin — Community Q&A</div>
          <input type="password" placeholder="Admin password" value={pw}
            onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login(pw)}
            style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#fff", fontSize: "0.875rem", outline: "none", boxSizing: "border-box", marginBottom: "0.75rem", fontFamily: "inherit" }} />
          {error && <div style={{ fontSize: "0.8rem", color: "#f09595", marginBottom: "0.75rem" }}>{error}</div>}
          <button onClick={() => login(pw)} disabled={loading}
            style={{ width: "100%", padding: "10px", background: "#e8620a", color: "#fff", border: "none", borderRadius: "6px", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            {loading ? "Loading…" : "Access"}
          </button>
          <Link href="/admin" style={{ display: "block", textAlign: "center", marginTop: "1rem", fontSize: "0.75rem", color: "#555", textDecoration: "none" }}>← Back to admin</Link>
        </div>
      </div>
    );
  }

  const pendingPosts    = posts.filter((p) => !p.approved);
  const approvedPosts   = posts.filter((p) => p.approved);
  const pendingReplies  = replies.filter((r) => !r.approved);
  const approvedReplies = replies.filter((r) => r.approved);

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff" }}>
      <header style={{ background: "#0a0a0a", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 2rem", height: "60px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Link href="/admin"><Image src="/logo.png" alt="" width={28} height={28} className="rounded-full" /></Link>
          <span style={{ fontSize: "0.95rem", fontWeight: 600 }}>Community Q&A</span>
        </div>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <span style={{ fontSize: "0.78rem", color: "#555" }}>
            {pendingPosts.length} posts · {pendingReplies.length} replies pending
          </span>
          <button onClick={() => { setError(""); login(pw); }} style={{ fontSize: "0.75rem", color: "#888", background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", padding: "4px 12px", cursor: "pointer", fontFamily: "inherit" }}>Refresh</button>
        </div>
      </header>

      {error && (
        <div style={{ background: "rgba(240,149,149,0.08)", borderBottom: "1px solid rgba(240,149,149,0.25)", padding: "10px 2rem", fontSize: "0.82rem", color: "#f09595", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>⚠ {error}</span>
          <button onClick={() => setError("")} style={{ background: "none", border: "none", color: "#f09595", cursor: "pointer", fontSize: "1rem", lineHeight: 1, padding: 0 }}>×</button>
        </div>
      )}
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "2rem 1.5rem", display: "flex", flexDirection: "column", gap: "2.5rem" }}>

        {/* Pending Posts */}
        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
            <div style={{ fontSize: "11px", color: "#555", letterSpacing: "0.08em", textTransform: "uppercase" }}>Pending Posts ({pendingPosts.length})</div>
            {pendingPosts.length > 0 && (
              <button onClick={approveAll} disabled={approvingAll}
                style={{ padding: "5px 14px", background: "#4ade80", color: "#000", border: "none", borderRadius: "6px", fontSize: "0.78rem", fontWeight: 700, cursor: approvingAll ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: approvingAll ? 0.6 : 1 }}>
                {approvingAll ? "Approving…" : `Approve all (${pendingPosts.length})`}
              </button>
            )}
          </div>
          {pendingPosts.length === 0 ? (
            <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", padding: "1.5rem", textAlign: "center", color: "#555", fontSize: "0.875rem" }}>No posts pending.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {pendingPosts.map((p) => (
                <div key={p.id} style={{ background: "#111", border: "1px solid rgba(232,98,10,0.2)", borderRadius: "8px", padding: "1.25rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.5rem" }}>
                        <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "20px", background: "rgba(255,255,255,0.07)", color: CATEGORY_COLORS[p.category] ?? "#888" }}>{p.category}</span>
                        <span style={{ fontSize: "11px", color: "#555" }}>{p.user_name} · {fmtDate(p.created_at)}</span>
                      </div>
                      <div style={{ fontWeight: 600, color: "#fff", marginBottom: "0.5rem" }}>{p.title}</div>
                      <p style={{ fontSize: "0.875rem", color: "#ccc", lineHeight: 1.6 }}>{p.body}</p>
                      <div style={{ fontSize: "11px", color: "#555", marginTop: "0.5rem" }}>{p.user_email}</div>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                      <button onClick={() => actPost(p.id, "approve")} disabled={actingPost === p.id}
                        style={{ padding: "7px 16px", background: "#4ade80", color: "#000", border: "none", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                        {actingPost === p.id ? "…" : "Approve"}
                      </button>
                      <button onClick={() => actPost(p.id, "reject")} disabled={actingPost === p.id}
                        style={{ padding: "7px 16px", background: "transparent", color: "#f09595", border: "1px solid rgba(240,149,149,0.3)", borderRadius: "6px", fontSize: "0.8rem", cursor: "pointer", fontFamily: "inherit" }}>
                        {actingPost === p.id ? "…" : "Reject"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Pending Replies */}
        <section>
          <div style={{ fontSize: "11px", color: "#555", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "1rem" }}>Pending Replies ({pendingReplies.length})</div>
          {pendingReplies.length === 0 ? (
            <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", padding: "1.5rem", textAlign: "center", color: "#555", fontSize: "0.875rem" }}>No replies pending.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {pendingReplies.map((r) => (
                <div key={r.id} style={{ background: "#111", border: "1px solid rgba(96,165,250,0.2)", borderRadius: "8px", padding: "1.25rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
                    <div style={{ flex: 1 }}>
                      {r.community_posts && (
                        <div style={{ fontSize: "11px", color: "#555", marginBottom: "0.4rem" }}>
                          Reply to: <span style={{ color: CATEGORY_COLORS[r.community_posts.category] ?? "#888" }}>{r.community_posts.title}</span>
                        </div>
                      )}
                      <p style={{ fontSize: "0.875rem", color: "#ccc", lineHeight: 1.6 }}>{r.body}</p>
                      <div style={{ fontSize: "11px", color: "#555", marginTop: "0.4rem" }}>{r.user_name} · {r.user_email} · {fmtDate(r.created_at)}</div>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                      <button onClick={() => actReply(r.id, "approve")} disabled={actingReply === r.id}
                        style={{ padding: "7px 16px", background: "#4ade80", color: "#000", border: "none", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                        {actingReply === r.id ? "…" : "Approve"}
                      </button>
                      <button onClick={() => actReply(r.id, "reject")} disabled={actingReply === r.id}
                        style={{ padding: "7px 16px", background: "transparent", color: "#f09595", border: "1px solid rgba(240,149,149,0.3)", borderRadius: "6px", fontSize: "0.8rem", cursor: "pointer", fontFamily: "inherit" }}>
                        {actingReply === r.id ? "…" : "Reject"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Live Posts */}
        <section>
          <div style={{ fontSize: "11px", color: "#555", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "1rem" }}>Live Posts ({approvedPosts.length})</div>
          {approvedPosts.length === 0 ? (
            <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", padding: "1.5rem", textAlign: "center", color: "#555", fontSize: "0.875rem" }}>No approved posts yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {approvedPosts.map((p) => {
                const postReplies = approvedReplies.filter((r) => r.post_id === p.id);
                return (
                  <div key={p.id} style={{ background: "#111", border: "1px solid rgba(74,222,128,0.15)", borderRadius: "8px", padding: "1.25rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.5rem" }}>
                          <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "20px", background: "rgba(74,222,128,0.1)", color: CATEGORY_COLORS[p.category] ?? "#888" }}>{p.category}</span>
                          <span style={{ fontSize: "11px", color: "#555" }}>{p.user_name} · {fmtDate(p.created_at)}</span>
                          {postReplies.length > 0 && (
                            <span style={{ fontSize: "11px", color: "#60a5fa" }}>{postReplies.length} answer{postReplies.length !== 1 ? "s" : ""}</span>
                          )}
                        </div>
                        <div style={{ fontWeight: 600, color: "#fff", marginBottom: "0.4rem" }}>{p.title}</div>
                        <p style={{ fontSize: "0.82rem", color: "#aaa", lineHeight: 1.6 }}>{p.body}</p>
                        {postReplies.length > 0 && (
                          <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                            {postReplies.map((r) => (
                              <div key={r.id} style={{ fontSize: "0.82rem", color: "#ccc", lineHeight: 1.5 }}>
                                <span style={{ color: "#888", marginRight: "0.5rem" }}>↳ {r.user_name}:</span>{r.body}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <button onClick={() => actPost(p.id, "reject")} disabled={actingPost === p.id}
                        style={{ padding: "6px 14px", background: "transparent", color: "#555", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px", fontSize: "0.78rem", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
