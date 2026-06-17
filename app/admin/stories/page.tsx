"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

interface Story {
  id: number;
  user_email: string;
  user_name: string;
  quote: string;
  achievement: string;
  approved: boolean;
  created_at: string;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminStoriesPage() {
  const [pw,      setPw]      = useState("");
  const [authed,  setAuthed]  = useState(true);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [acting,  setActing]  = useState<number | null>(null);

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
      const res  = await fetch("/api/admin/stories");
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed"); return; }
      setStories(data.stories);
    } catch { setError("Something went wrong."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    fetch("/api/admin/auth").then(r => { if (r.ok) setAuthed(true); }).catch(() => {});
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (authed) load(); }, [authed]);

  async function act(id: number, action: "approve" | "reject") {
    setActing(id);
    try {
      await fetch("/api/admin/stories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      setStories((prev) =>
        action === "reject"
          ? prev.filter((s) => s.id !== id)
          : prev.map((s) => s.id === id ? { ...s, approved: true } : s)
      );
    } finally { setActing(null); }
  }

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "2rem", width: "320px" }}>
          <div style={{ fontSize: "1rem", fontWeight: 600, color: "#fff", marginBottom: "1.25rem" }}>Admin — Stories</div>
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

  const pending  = stories.filter((s) => !s.approved);
  const approved = stories.filter((s) => s.approved);

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff" }}>
      <header style={{ background: "#0a0a0a", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 2rem", height: "60px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Link href="/admin"><Image src="/logo.png" alt="" width={28} height={28} className="rounded-full" /></Link>
          <span style={{ fontSize: "0.95rem", fontWeight: 600 }}>Runner Stories</span>
        </div>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <span style={{ fontSize: "0.78rem", color: "#555" }}>{pending.length} pending · {approved.length} live</span>
          <button onClick={() => load()} style={{ fontSize: "0.75rem", color: "#888", background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", padding: "4px 12px", cursor: "pointer", fontFamily: "inherit" }}>Refresh</button>
        </div>
      </header>

      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "2rem 1.5rem", display: "flex", flexDirection: "column", gap: "2rem" }}>

        {/* Pending */}
        <section>
          <div style={{ fontSize: "11px", color: "#555", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "1rem" }}>
            Pending Review ({pending.length})
          </div>
          {pending.length === 0 ? (
            <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", padding: "2rem", textAlign: "center", color: "#555", fontSize: "0.875rem" }}>
              No stories pending review.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {pending.map((s) => (
                <div key={s.id} style={{ background: "#111", border: "1px solid rgba(232,98,10,0.2)", borderRadius: "8px", padding: "1.25rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: "#fff", marginBottom: "2px" }}>{s.user_name}</div>
                      <div style={{ fontSize: "11px", color: "#e8620a", marginBottom: "0.75rem" }}>{s.achievement}</div>
                      <p style={{ fontSize: "0.875rem", color: "#ccc", lineHeight: 1.6, fontStyle: "italic" }}>&ldquo;{s.quote}&rdquo;</p>
                      <div style={{ fontSize: "11px", color: "#555", marginTop: "0.5rem" }}>{s.user_email} · {fmtDate(s.created_at)}</div>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                      <button
                        onClick={() => act(s.id, "approve")}
                        disabled={acting === s.id}
                        style={{ padding: "7px 16px", background: "#4ade80", color: "#000", border: "none", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                      >
                        {acting === s.id ? "…" : "Approve"}
                      </button>
                      <button
                        onClick={() => act(s.id, "reject")}
                        disabled={acting === s.id}
                        style={{ padding: "7px 16px", background: "transparent", color: "#f09595", border: "1px solid rgba(240,149,149,0.3)", borderRadius: "6px", fontSize: "0.8rem", cursor: "pointer", fontFamily: "inherit" }}
                      >
                        {acting === s.id ? "…" : "Reject"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Approved */}
        <section>
          <div style={{ fontSize: "11px", color: "#555", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "1rem" }}>
            Live on Homepage ({approved.length})
          </div>
          {approved.length === 0 ? (
            <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", padding: "2rem", textAlign: "center", color: "#555", fontSize: "0.875rem" }}>
              No approved stories yet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {approved.map((s) => (
                <div key={s.id} style={{ background: "#111", border: "1px solid rgba(74,222,128,0.15)", borderRadius: "8px", padding: "1.25rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: "#fff", marginBottom: "2px" }}>{s.user_name}</div>
                    <div style={{ fontSize: "11px", color: "#4ade80", marginBottom: "0.75rem" }}>{s.achievement}</div>
                    <p style={{ fontSize: "0.875rem", color: "#ccc", lineHeight: 1.6, fontStyle: "italic" }}>&ldquo;{s.quote}&rdquo;</p>
                    <div style={{ fontSize: "11px", color: "#555", marginTop: "0.5rem" }}>{s.user_email} · {fmtDate(s.created_at)}</div>
                  </div>
                  <button
                    onClick={() => act(s.id, "reject")}
                    disabled={acting === s.id}
                    style={{ padding: "6px 14px", background: "transparent", color: "#555", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px", fontSize: "0.78rem", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
