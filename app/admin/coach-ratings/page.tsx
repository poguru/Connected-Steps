"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card, Button, Input, Alert, StatCard, EmptyState } from "@/components/ui/ds";

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
  const [authed,  setAuthed]  = useState(true);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [filter,  setFilter]  = useState("All");

  const COACHES = useMemo(() => {
    const names = [...new Set(ratings.map(r => r.coach_name).filter(Boolean))].sort();
    return ["All", ...names];
  }, [ratings]);

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
      const res  = await fetch("/api/admin/coach-ratings");
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed"); return; }
      setRatings(data.ratings);
    } catch { setError("Something went wrong."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    fetch("/api/admin/auth").then(r => { if (r.ok) setAuthed(true); }).catch(() => {});
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (authed) load(); }, [authed]);

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "320px" }}>
          <Card>
            <div style={{ fontSize: "1rem", fontWeight: 600, color: "#fff", marginBottom: "1.25rem" }}>Admin — Coach Ratings</div>
            <Input type="password" placeholder="Admin password" value={pw}
              onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login(pw)}
              style={{ marginBottom: "0.75rem" }} />
            {error && <Alert variant="error" style={{ marginBottom: "0.75rem" }}>{error}</Alert>}
            <Button fullWidth loading={loading} onClick={() => login(pw)}>Access</Button>
            <Link href="/admin" style={{ display: "block", textAlign: "center", marginTop: "1rem", fontSize: "0.75rem", color: "#555", textDecoration: "none" }}>← Back to admin</Link>
          </Card>
        </div>
      </div>
    );
  }

  const filtered = filter === "All" ? ratings : ratings.filter((r) => r.coach_name === filter);

  const summaries = useMemo(() => COACHES.filter((c) => c !== "All").map((name) => {
    const vals = ratings.filter((r) => r.coach_name === name).map((r) => r.rating);
    const avg  = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
    return { name, avg, count: vals.length };
  }), [COACHES, ratings]);

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff" }}>
      <header style={{ background: "#0a0a0a", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 2rem", height: "60px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Link href="/admin"><Image src="/logo.png" alt="" width={28} height={28} className="rounded-full" /></Link>
          <span style={{ fontSize: "0.95rem", fontWeight: 600 }}>Coach Ratings</span>
        </div>
        <Button size="xs" variant="ghost" onClick={() => load()}>Refresh</Button>
      </header>

      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "2rem 1.5rem", display: "flex", flexDirection: "column", gap: "2rem" }}>

        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
          {summaries.map((s) => (
            <StatCard key={s.name} label={s.name} value={s.avg ? `${s.avg}★` : "—"}
              color={s.avg ? "#fbbf24" : "#555"} sub={s.count > 0 ? `${s.count} ${s.count === 1 ? "review" : "reviews"}` : "No ratings yet"} />
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
            <EmptyState title="No ratings yet." />
          ) : filtered.map((r) => (
            <Card key={r.id}>
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
            </Card>
          ))}
        </div>

      </div>
    </div>
  );
}
