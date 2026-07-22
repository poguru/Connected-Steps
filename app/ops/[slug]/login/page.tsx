"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ROLE_DEFAULT_MODULE } from "@/lib/ops-auth";
import type { OpsRole } from "@/lib/ops-auth";

const ACCENT = "#e8620a";

interface EventInfo {
  id: string;
  title: string;
  event_type: string | null;
  start_date: string | null;
}

export default function OpsLoginPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug }  = use(params);
  const router    = useRouter();

  const [event,    setEvent]    = useState<EventInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  // Load event info by slug
  useEffect(() => {
    fetch(`/api/events/by-slug?slug=${encodeURIComponent(slug)}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { event?: EventInfo } | null) => {
        if (d?.event) setEvent(d.event);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true));
  }, [slug]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (!event) return;
    setLoading(true);
    setError("");
    try {
      const res  = await fetch("/api/ops/auth", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email.trim().toLowerCase(), password, event_id: event.id }),
      });
      const data = await res.json() as { error?: string; role?: string };
      if (!res.ok) { setError(data.error ?? "Invalid credentials"); return; }
      const module = ROLE_DEFAULT_MODULE[data.role as OpsRole] ?? "dashboard";
      router.push(`/ops/${slug}/${module}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (notFound) {
    return (
      <div style={pageBg}>
        <div style={{ textAlign: "center", color: "#888" }}>
          <div style={{ fontSize: "2rem", marginBottom: 12 }}>❌</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Event not found</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>No event with slug &ldquo;{slug}&rdquo;</div>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div style={pageBg}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #222", borderTopColor: ACCENT, animation: "spin .7s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div style={pageBg}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <Image src="/logo.png" alt="" width={40} height={40} style={{ borderRadius: "50%" }} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "-0.03em" }}>
            {event.title}
          </div>
          <div style={{ fontSize: 13, color: ACCENT, fontWeight: 600, marginTop: 4 }}>
            Event Operations Portal
          </div>
          {event.start_date && (
            <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
              {new Date(event.start_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
            </div>
          )}
        </div>

        {/* Card */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 28 }}>
          <form onSubmit={login}>
            {error && (
              <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, color: "#f87171", fontSize: 13, marginBottom: 16 }}>
                {error}
              </div>
            )}

            <label style={labelStyle}>Email Address</label>
            <input
              type="email" required autoFocus
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="volunteer@example.com"
              style={inputStyle}
            />

            <label style={{ ...labelStyle, marginTop: 14 }}>Password</label>
            <input
              type="password" required
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              style={inputStyle}
            />

            <button
              type="submit" disabled={loading}
              style={{
                width: "100%", marginTop: 20, padding: "13px",
                background: loading ? "rgba(255,255,255,0.1)" : ACCENT,
                border: "none", borderRadius: 10, color: "#fff",
                fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {loading ? "Signing in…" : "Sign In →"}
            </button>
          </form>
        </div>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 12, color: "#444" }}>
          Authorised event staff only
        </div>
      </div>
    </div>
  );
}

const pageBg: React.CSSProperties = {
  minHeight: "100vh", background: "#080808", color: "#fff",
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: "20px 16px", fontFamily: "'Inter',system-ui,sans-serif",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, color: "#888", marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "11px 12px",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8, color: "#fff", fontSize: 14,
  fontFamily: "inherit", outline: "none", boxSizing: "border-box",
};
