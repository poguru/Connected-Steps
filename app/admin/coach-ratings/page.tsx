"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

interface Rating {
  id: number;
  coach_name: string;
  user_email: string;
  rating: number;
  feedback: string | null;
  created_at: string;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function Stars({ n }: { n: number }) {
  return (
    <span style={{ color: "#fbbf24", letterSpacing: "2px" }}>
      {"★".repeat(n)}{"☆".repeat(5 - n)}
    </span>
  );
}

export default function CoachRatingsPage() {
  const [pw,      setPw]      = useState("");
  const [authed,  setAuthed]  = useState(false);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [filter,  setFilter]  = useState("All");

  const COACHES = ["All", "Ashokan K", "Vana Durga Rao", "Kolli Achyuta Kumari"];

  async function load(password: string) {
    setLoading(true); setError("");
    try {
      const res  = await fetch("/api/admin/coach-ratings", { headers: { "x-admin-password": password } });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed"); return; }
      setRatings(data.ratings);
      localStorage.setItem("cs_admin_pw", password);
      setAuthed(true);
    } catch { setError("Something went wrong."); }
    finally { setLoading(false); }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const s = localStorage.getItem("cs_admin_pw"); if (s) load(s); }, []);

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "2rem", width: "320px" }}>
          <div style={{ fontSize: "1rem", fontWeight: 600, color: "#fff", marginBottom: "1.25rem" }}>Admin — Coach Ratings</div>
          <input type="password" placeholder="Admin password" value={pw}
            onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load(pw)}
            style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#fff", fontSize: "0.875rem", outline: "none", boxSizing: "border-box", marginBottom: "0.75rem", fontFamily: "inherit" }} />
          {error && <div style={{ fontSize: "0.8rem", color: "#f09595", marginBottom: "0.75rem" }}>{error}</div>}
          <button onClick={() => load(pw)} disabled={loading}
            style={{ width: "100%", padding: "10px", background: "#e8620a", color: "#fff", border: "none", borderRadius: "6px", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            {loading ? "Loading…" : "Access"}
          </button>
          <Link href="/admin" style={{ display: "block", textAlign: "center", marginTop: "1rem", fontSize: "0.75rem", color: "#555", textDecoration: "none" }}>← Back to admin</Link>
        </div>
      </div>
    );
  }

  const filtered = filter === "All" ? ratings : ratings.filter((r) => r.coach_name === filter);

  // Per-coach averages
  const summaries = COACHES.filter((c) => c !== "All").map((name) => {
    const vals = ratings.filter((r) => r.coach_name === name).map((r) => r.rating);
    const avg  = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
    return { name, avg, count: vals.length };
  });

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff" }}>
      <header style={{ background: "#0a0a0a", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 2rem", height: "60px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Link href="/admin"><Image src="/logo.png" alt="" width={28} height={28} className="rounded-full" /></Link>
          <span style={{ fontSize: "0.95rem", fontWeight: 600 }}>Coach Ratings</span>
        </div>
        <button onClick={() => load(pw)} style={{ fontSize: "0.75rem", color: "#888", background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", padding: "4px 12px", cursor: "pointer", fontFamily: "inherit" }}>Refresh</button>
      </header>

      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "2rem 1.5rem", display: "flex", flexDirection: "column", gap: "2rem" }}>

        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
          {summaries.map((s) => (
            <div key={s.name} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", padding: "1.25rem" }}>
              <div style={{ fontSize: "11px", color: "#555", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.4rem" }}>{s.name}</div>
              {s.avg ? (
                <>
                  <div style={{ fontSize: "2rem", fontWeight: 700, color: "#fbbf24" }}>{s.avg}★</div>
                  <div style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}>{s.count} {s.count === 1 ? "review" : "reviews"}</div>
                </>
              ) : (
                <div style={{ fontSize: "0.82rem", color: "#555" }}>No ratings yet</div>
              )}
            </div>
          ))}
        </div>

        {/* Filter */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {COACHES.map((c) => (
            <button key={c} onClick={() => setFilter(c)}
              style={{ padding: "5px 14px", borderRadius: "20px", fontSize: "0.78rem", border: "none", cursor: "pointer", fontFamily: "inherit", background: filter === c ? "#e8620a" : "rgba(255,255,255,0.06)", color: filter === c ? "#fff" : "#888" }}>
              {c}
            </button>
          ))}
        </div>

        {/* Ratings list */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {filtered.length === 0 ? (
            <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", padding: "2rem", textAlign: "center", color: "#555", fontSize: "0.875rem" }}>No ratings yet.</div>
          ) : filtered.map((r) => (
            <div key={r.id} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", padding: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.4rem" }}>
                    <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#fff" }}>{r.coach_name}</span>
                    <Stars n={r.rating} />
                  </div>
                  {r.feedback && <p style={{ fontSize: "0.82rem", color: "#ccc", lineHeight: 1.6, margin: 0 }}>{r.feedback}</p>}
                  <div style={{ fontSize: "11px", color: "#555", marginTop: "0.4rem" }}>{r.user_email} · {fmtDate(r.created_at)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
