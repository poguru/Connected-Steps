"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

export default function WaitlistPage() {
  const { slug } = useParams() as { slug: string };
  const [form,     setForm]     = useState({ name: "", email: "", phone: "", distance_category: "", notes: "" });
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState<{ success?: boolean; already?: boolean; position?: number; message?: string; error?: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) return;
    setLoading(true);
    try {
      // Resolve event_id from slug first
      const evRes  = await fetch(`/api/events/by-slug?slug=${slug}`);
      const evData = await evRes.json();
      const eventId = evData.event?.id;
      if (!eventId) { setResult({ error: "Event not found" }); return; }

      const res  = await fetch("/api/events/waitlist", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId, ...form }),
      });
      const data = await res.json();
      setResult(data);
    } catch { setResult({ error: "Network error. Please try again." }); }
    finally { setLoading(false); }
  }

  const S: React.CSSProperties = { width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff", fontSize: 15, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d10", color: "#fff", fontFamily: "inherit" }}>
      <nav style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(13,13,16,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 1.5rem", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href={`/events/${slug}`} style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.6)", textDecoration: "none" }}>← Back to Event</Link>
        <Link href="/" style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.35)", textDecoration: "none" }}>Connected Steps</Link>
      </nav>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "2.5rem 1.5rem" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>📋</div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#fff", margin: 0 }}>Join the Waitlist</h1>
          <p style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.5)", marginTop: "0.5rem" }}>
            This event is fully booked. Add yourself to the waitlist and we'll notify you if a spot opens up.
          </p>
        </div>

        {result?.success || result?.already ? (
          <div style={{ padding: "1.5rem", borderRadius: 14, background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.25)", textAlign: "center" }}>
            <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>{result.already ? "✅" : "🎉"}</div>
            <div style={{ fontWeight: 700, fontSize: "1rem", color: "#60a5fa", marginBottom: "0.5rem" }}>
              {result.already ? "Already on the list!" : "You're on the waitlist!"}
            </div>
            <div style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.6)" }}>
              {result.message ?? `You're at position #${result.position} on the waitlist. We'll email you if a spot becomes available.`}
            </div>
            <Link href={`/events/${slug}`} style={{ display: "inline-block", marginTop: "1.25rem", fontSize: "0.85rem", color: "#e8620a", textDecoration: "none", fontWeight: 600 }}>
              ← Back to event
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>Full Name *</label>
              <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Your name" style={S} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>Email *</label>
              <input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="your@email.com" style={S} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>Phone</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="10-digit phone number" style={S} />
            </div>

            {result?.error && (
              <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", color: "#f87171", fontSize: 14 }}>
                {result.error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{ padding: "14px", background: loading ? "#333" : "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.35)", borderRadius: 10, color: loading ? "#666" : "#60a5fa", fontWeight: 700, fontSize: "1rem", cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", marginTop: "0.5rem" }}>
              {loading ? "Joining waitlist…" : "Join Waitlist"}
            </button>

            <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.3)", textAlign: "center", margin: 0 }}>
              We'll only contact you if a spot becomes available.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
