"use client";

import { useState, useEffect, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";

interface EventData {
  id: string;
  title: string;
  distance_categories: string[] | null;
}

interface Race {
  id: string;
  name: string;
  distance: string;
  max_slots: number | null;
}

function WaitlistForm() {
  const { slug } = useParams() as { slug: string };
  const searchParams = useSearchParams();
  const prefilledCategory = searchParams.get("category") ?? "";

  const [ev,       setEv]       = useState<EventData | null>(null);
  const [races,    setRaces]    = useState<Race[]>([]);
  const [form,     setForm]     = useState({ name: "", email: "", phone: "", distance_category: prefilledCategory, notes: "" });
  const [loading,  setLoading]  = useState(false);
  const [fetching, setFetching] = useState(true);
  const [result,   setResult]   = useState<{ success?: boolean; already?: boolean; position?: number; message?: string; error?: string } | null>(null);

  useEffect(() => {
    // Pre-fill user data from localStorage
    try {
      const raw = localStorage.getItem("cs_user");
      if (raw) {
        const u = JSON.parse(raw) as { first_name?: string; last_name?: string; email?: string; phone?: string };
        const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
        setForm(f => ({ ...f, name: name || f.name, email: u.email || f.email, phone: u.phone || f.phone }));
      }
    } catch { /* ignore */ }

    // Fetch event & races
    async function fetchEvent() {
      try {
        const res  = await fetch(`/api/events/by-slug?slug=${slug}`);
        const data = await res.json();
        if (data.event) setEv(data.event);
        if (data.races?.length) setRaces(data.races);
        // Pre-fill first category if none specified
        if (!prefilledCategory && data.races?.length === 1) {
          setForm(f => ({ ...f, distance_category: data.races[0].distance }));
        }
      } catch { /* ignore */ }
      finally { setFetching(false); }
    }
    void fetchEvent();
  }, [slug, prefilledCategory]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) return;
    if (!ev?.id) { setResult({ error: "Event not found" }); return; }
    setLoading(true);
    try {
      const body: Record<string, string> = {
        event_id: ev.id,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        notes: form.notes.trim(),
      };
      if (form.distance_category) body.distance_category = form.distance_category;

      const res  = await fetch("/api/events/waitlist", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setResult(data);
    } catch { setResult({ error: "Network error. Please try again." }); }
    finally { setLoading(false); }
  }

  const S: React.CSSProperties = { width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff", fontSize: 15, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };

  const hasCategories = races.length > 1 || (ev?.distance_categories?.length ?? 0) > 1;

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
            {prefilledCategory
              ? `The ${prefilledCategory} category is fully booked. Add yourself to the waitlist and we'll notify you if a spot opens.`
              : "This event is fully booked. Add yourself to the waitlist and we'll notify you if a spot opens up."}
          </p>
        </div>

        {fetching ? (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", padding: "2rem" }}>Loading…</div>
        ) : result?.success || result?.already ? (
          <div style={{ padding: "1.5rem", borderRadius: 14, background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.25)", textAlign: "center" }}>
            <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>{result.already ? "✅" : "🎉"}</div>
            <div style={{ fontWeight: 700, fontSize: "1rem", color: "#60a5fa", marginBottom: "0.5rem" }}>
              {result.already ? "Already on the list!" : "You're on the waitlist!"}
            </div>
            <div style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.6)" }}>
              {result.message ?? `You're at position #${result.position}. We'll email you if a spot becomes available.`}
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

            {hasCategories && (
              <div>
                <label style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>Category</label>
                <select
                  value={form.distance_category}
                  onChange={e => setForm(f => ({ ...f, distance_category: e.target.value }))}
                  style={{ ...S, appearance: "none" as const }}
                >
                  <option value="">All categories (event-wide)</option>
                  {races.length > 0
                    ? races.map(r => <option key={r.id} value={r.distance}>{r.name ?? r.distance}</option>)
                    : (ev?.distance_categories ?? []).map(c => <option key={c} value={c}>{c}</option>)
                  }
                </select>
              </div>
            )}

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

export default function WaitlistPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#0d0d10" }} />}>
      <WaitlistForm />
    </Suspense>
  );
}
