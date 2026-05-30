"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

interface SessionInfo {
  id: string;
  title: string;
  date: string;
  time: string | null;
  venue: string | null;
  location: string;
}

function formatDate(date: string) {
  return new Date(date + "T12:00:00Z").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

export default function JoinSessionPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession]   = useState<SessionInfo | null>(null);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [email,   setEmail]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result,  setResult]  = useState<"joined" | "already" | "closed" | null>(null);
  const [error,   setError]   = useState("");

  useEffect(() => {
    fetch(`/api/sessions/${id}/join`)
      .then((r) => r.json())
      .then((d) => {
        if (d.session) setSession(d.session);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));

    // Pre-fill email from localStorage if user is logged in
    try {
      const stored = localStorage.getItem("cs_user");
      if (stored) {
        const u = JSON.parse(stored);
        if (u.email) setEmail(u.email);
      }
    } catch { /* ignore */ }
  }, [id]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setError("");
    try {
      const res  = await fetch(`/api/sessions/${id}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (res.status === 410) { setResult("closed"); return; }
      if (!res.ok) { setError(data.error ?? "Something went wrong."); return; }
      setResult(data.already ? "already" : "joined");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const card: React.CSSProperties = {
    background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "12px", padding: "2rem", maxWidth: "440px", width: "100%",
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--cs-black)", color: "var(--cs-white)", display: "flex", flexDirection: "column" }}>
      <header style={{ background: "var(--cs-dark)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "1rem 2rem", display: "flex", alignItems: "center", gap: "0.6rem" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none" }}>
          <Image src="/logo.png" alt="Connected Steps" width={32} height={32} className="rounded-full" />
          <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--cs-white)" }}>Connected Steps</span>
        </Link>
      </header>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1.5rem" }}>
        {loading ? (
          <div style={{ color: "var(--cs-muted)", fontSize: "0.9rem" }}>Loading session…</div>
        ) : notFound ? (
          <div style={card}>
            <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>🔍</div>
            <h1 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "0.5rem" }}>Session not found</h1>
            <p style={{ fontSize: "0.85rem", color: "var(--cs-muted)", marginBottom: "1.5rem" }}>This session link may have expired or been removed.</p>
            <Link href="/dashboard" style={{ fontSize: "0.85rem", color: "var(--cs-orange)", textDecoration: "none" }}>← Go to Dashboard</Link>
          </div>
        ) : result === "closed" ? (
          <div style={card}>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🔒</div>
            <h1 style={{ fontSize: "1.3rem", fontWeight: 600, marginBottom: "0.4rem" }}>Registration Closed</h1>
            <p style={{ fontSize: "0.875rem", color: "var(--cs-muted)", marginBottom: "1.5rem", lineHeight: 1.6 }}>
              Registration for <strong style={{ color: "var(--cs-white)" }}>{session?.title}</strong> has closed. You can join up to 2 hours after the session starts.
            </p>
            <Link href="/dashboard" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "10px 22px", background: "var(--cs-orange)", color: "#fff", borderRadius: "6px", fontSize: "0.85rem", fontWeight: 700, textDecoration: "none" }}>
              Go to Dashboard →
            </Link>
          </div>
        ) : result ? (
          <div style={card}>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>{result === "joined" ? "✅" : "👍"}</div>
            <h1 style={{ fontSize: "1.3rem", fontWeight: 600, marginBottom: "0.4rem" }}>
              {result === "joined" ? "You're in!" : "Already registered"}
            </h1>
            <p style={{ fontSize: "0.875rem", color: "var(--cs-muted)", marginBottom: "1.5rem", lineHeight: 1.6 }}>
              {result === "joined"
                ? `You've been registered for ${session?.title}. See you on the track! 🏃`
                : `You're already registered for ${session?.title}. See you there!`}
            </p>
            <div style={{ background: "rgba(232,98,10,0.08)", border: "1px solid rgba(232,98,10,0.2)", borderRadius: "8px", padding: "1rem 1.25rem", marginBottom: "1.5rem", fontSize: "0.83rem", color: "var(--cs-muted)", lineHeight: 1.7 }}>
              <div>📋 <strong style={{ color: "var(--cs-white)" }}>{session?.title}</strong></div>
              <div>📅 {formatDate(session!.date)}{session?.time ? ` at ${session.time}` : ""}</div>
              <div>📍 {session?.venue || session?.location}</div>
            </div>
            <Link href="/dashboard" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "10px 22px", background: "var(--cs-orange)", color: "#fff", borderRadius: "6px", fontSize: "0.85rem", fontWeight: 700, textDecoration: "none" }}>
              Go to Dashboard →
            </Link>
          </div>
        ) : (
          <div style={card}>
            <div style={{ fontSize: "10px", color: "var(--cs-orange)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: "0.5rem" }}>Training Session</div>
            <h1 style={{ fontSize: "1.4rem", fontWeight: 300, color: "var(--cs-white)", marginBottom: "1.5rem" }}>
              Join Session
            </h1>

            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", padding: "1rem 1.25rem", marginBottom: "1.75rem", fontSize: "0.85rem", color: "var(--cs-muted)", lineHeight: 1.8 }}>
              <div style={{ fontWeight: 700, color: "var(--cs-white)", marginBottom: "0.25rem" }}>{session?.title}</div>
              <div>📅 {formatDate(session!.date)}{session?.time ? ` at ${session.time}` : ""}</div>
              <div>📍 {session?.venue || session?.location}</div>
            </div>

            <form onSubmit={handleJoin} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "10px", color: "#888", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>Your Email</label>
                <input
                  type="email" required
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#fff", fontSize: "0.875rem", outline: "none", boxSizing: "border-box" }}
                />
                <div style={{ fontSize: "11px", color: "#555", marginTop: "5px" }}>Use the email you registered with on connectedsteps.in</div>
              </div>

              {error && (
                <div style={{ background: "rgba(226,75,74,0.1)", border: "1px solid rgba(226,75,74,0.3)", borderRadius: "6px", padding: "9px 12px", fontSize: "0.8rem", color: "#f09595" }}>{error}</div>
              )}

              <button type="submit" disabled={submitting} style={{ padding: "12px", background: "var(--cs-orange)", color: "#fff", border: "none", borderRadius: "6px", fontSize: "0.875rem", fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1 }}>
                {submitting ? "Registering…" : "Confirm — I'm joining 🏃"}
              </button>
            </form>

            <p style={{ marginTop: "1rem", fontSize: "11px", color: "#555", textAlign: "center" }}>
              Don&apos;t have an account?{" "}
              <Link href="/signup" style={{ color: "var(--cs-orange)", textDecoration: "none" }}>Sign up here</Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
