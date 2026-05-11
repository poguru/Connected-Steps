"use client";

import { useEffect, useState } from "react";

const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  "Recovery":           { bg: "rgba(74,222,128,0.1)",   color: "#4ade80" },
  "Shoes & Gear":       { bg: "rgba(96,165,250,0.1)",   color: "#60a5fa" },
  "Races & Marathons":  { bg: "rgba(232,98,10,0.12)",   color: "#e8620a" },
  "Running Tips":       { bg: "rgba(251,191,36,0.1)",   color: "#fbbf24" },
  "General":            { bg: "rgba(255,255,255,0.06)",  color: "#888"    },
};

const ALL_CATS = ["All", "Recovery", "Shoes & Gear", "Races & Marathons", "Running Tips", "General"];

interface Post {
  id: number;
  user_name: string;
  category: string;
  title: string;
  body: string;
  created_at: string;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function PostCard({ post }: { post: Post }) {
  const c = CATEGORY_COLORS[post.category] ?? CATEGORY_COLORS["General"];
  return (
    <div style={{
      background: "var(--cs-charcoal)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: "10px", padding: "1.25rem",
      display: "flex", flexDirection: "column", gap: "0.75rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
        <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", padding: "3px 10px", borderRadius: "20px", background: c.bg, color: c.color }}>
          {post.category}
        </span>
        <span style={{ fontSize: "11px", color: "var(--cs-muted)" }}>{fmtDate(post.created_at)}</span>
      </div>
      <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--cs-white)", lineHeight: 1.4 }}>
        {post.title}
      </div>
      <div style={{ fontSize: "0.82rem", color: "var(--cs-muted)", lineHeight: 1.6 }}>
        {post.body.length > 200 ? post.body.slice(0, 200) + "…" : post.body}
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "0.6rem", fontSize: "11px", color: "var(--cs-muted)" }}>
        — {post.user_name}
      </div>
    </div>
  );
}

export default function CommunityQA() {
  const [posts,      setPosts]      = useState<Post[]>([]);
  const [activecat,  setActiveCat]  = useState("All");
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    fetch("/api/community/posts")
      .then((r) => r.json())
      .then((d) => { if (d.posts) setPosts(d.posts); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
          <a href="/dashboard" style={{ padding: "10px 20px", background: "var(--cs-orange)", color: "var(--cs-white)", borderRadius: "6px", textDecoration: "none", fontSize: "0.85rem", fontWeight: 600, whiteSpace: "nowrap" }}>
            Ask a question →
          </a>
        </div>

        {/* Category filter */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "2rem" }}>
          {ALL_CATS.map((cat) => (
            <button key={cat} onClick={() => setActiveCat(cat)}
              style={{
                padding: "5px 14px", borderRadius: "20px", fontSize: "0.78rem", fontWeight: 500,
                cursor: "pointer", fontFamily: "var(--font-body)", border: "none",
                background: activecat === cat ? "var(--cs-orange)" : "rgba(255,255,255,0.06)",
                color: activecat === cat ? "#fff" : "var(--cs-muted)",
                transition: "all 0.15s",
              }}>
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
            <div style={{ fontSize: "0.82rem", color: "var(--cs-muted)", marginBottom: "1.25rem" }}>
              Be the first to ask a question or share a tip.
            </div>
            <a href="/dashboard" style={{ padding: "9px 20px", background: "var(--cs-orange)", color: "#fff", borderRadius: "6px", textDecoration: "none", fontSize: "0.82rem", fontWeight: 600 }}>
              Ask the community →
            </a>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem" }}>
            {filtered.map((post) => <PostCard key={post.id} post={post} />)}
          </div>
        )}

      </div>
    </section>
  );
}
