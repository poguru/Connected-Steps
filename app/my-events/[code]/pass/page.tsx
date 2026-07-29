"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

// ── Types ────────────────────────────────────────────────────────────────────

interface Participant {
  id: string; first_name: string; last_name: string | null;
  distance_category: string | null; qr_token: string | null;
  checked_in_at: string | null; tshirt_issued: boolean;
  breakfast_availed: boolean; medal_issued: boolean;
  bib_collected_at: string | null; bib_number: string | null;
  certificate_url: string | null; status: string;
}

interface EventData {
  title: string; start_date: string; start_time: string | null; location: string;
}

interface Registration {
  registration_code: string; user_name: string;
}

interface HubData {
  registration: Registration; event: EventData; participants: Participant[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

function fmtTime(t: string | null) {
  if (!t) return null;
  const [hh, mm] = t.split(":");
  const h = parseInt(hh, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h > 12 ? h - 12 : h || 12}:${mm} ${ampm}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RaceDayPassPage() {
  const params  = useParams();
  const router  = useRouter();
  const code    = params.code as string;

  const [data,       setData]       = useState<HubData | null>(null);
  const [activeIdx,  setActiveIdx]  = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [scanMode,   setScanMode]   = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Auth + fetch
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("cs_user_token") : null;
    if (!token) { router.replace(`/my-events/${code}`); return; }

    fetch(`/api/my-events/${code}`, { headers: { "x-user-token": token } })
      .then(r => r.ok ? r.json() : r.json().then((e: { error?: string }) => Promise.reject(new Error(e.error ?? "Error"))))
      .then((d: HubData) => { setData(d); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [code, router]);

  // Acquire/release screen wake lock when entering scan mode
  useEffect(() => {
    if (scanMode && "wakeLock" in navigator) {
      navigator.wakeLock.request("screen")
        .then(lock => { wakeLockRef.current = lock; })
        .catch(() => {});
    } else if (!scanMode && wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
    return () => { wakeLockRef.current?.release().catch(() => {}); };
  }, [scanMode]);

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f1014" }}>
        <div style={{ width: 40, height: 40, border: "3px solid #2a2d35", borderTop: "3px solid #f97316", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, background: "#0f1014", color: "#e8e9eb", padding: 24 }}>
        <p style={{ fontSize: 15, color: "#f87171" }}>{error ?? "Could not load pass."}</p>
        <Link href={`/my-events/${code}`} style={{ color: "#f97316", fontSize: 14 }}>← Back to My Event</Link>
      </div>
    );
  }

  const { event, registration, participants } = data;
  const p = participants[activeIdx] ?? participants[0];
  if (!p) return null;

  const date      = fmtDate(event.start_date);
  const time      = fmtTime(event.start_time);
  const fullName  = [p.first_name, p.last_name].filter(Boolean).join(" ");
  const hasBib    = Boolean(p.bib_number);
  const multiPax  = participants.length > 1;

  // ── Scan mode: fullscreen bright white for easier scanning ────────────────
  if (scanMode) {
    return (
      <div style={{ minHeight: "100dvh", background: "#ffffff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }}>
        <button
          onClick={() => setScanMode(false)}
          style={{ position: "absolute", top: 20, right: 20, background: "#111", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 14, cursor: "pointer" }}
        >
          ✕ Exit
        </button>
        {p.qr_token ? (
          <img
            src={`/api/events/qr/${p.qr_token}`}
            alt="QR Code"
            style={{ width: "min(80vw, 320px)", height: "min(80vw, 320px)", imageRendering: "pixelated" }}
          />
        ) : (
          <div style={{ width: "min(80vw, 280px)", height: "min(80vw, 280px)", display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f4f6", borderRadius: 8 }}>
            <span style={{ fontSize: 13, color: "#6b7280" }}>QR not available</span>
          </div>
        )}
        <p style={{ fontSize: 22, fontWeight: 700, color: "#111", marginTop: 8 }}>{fullName}</p>
        {hasBib && <p style={{ fontSize: 36, fontWeight: 900, color: "#f97316", letterSpacing: 2 }}>BIB {p.bib_number}</p>}
        <p style={{ fontSize: 14, color: "#6b7280" }}>{p.distance_category ?? "—"}</p>
      </div>
    );
  }

  // ── Normal pass view ──────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100dvh",
      background: "#0f1014",
      display: "flex",
      flexDirection: "column",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      paddingBottom: "env(safe-area-inset-bottom)",
    }}>
      {/* Nav bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px 10px", paddingTop: "calc(14px + env(safe-area-inset-top))" }}>
        <Link href={`/my-events/${code}`} style={{ display: "flex", alignItems: "center", gap: 6, color: "#9ca3af", textDecoration: "none", fontSize: 14 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          My Event
        </Link>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#4b5563", letterSpacing: "0.08em", textTransform: "uppercase" }}>Race Day Pass</span>
        <button
          onClick={() => setScanMode(true)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#f97316", fontSize: 12, fontWeight: 600, padding: 4 }}
          title="Enlarge QR for scanning"
        >
          Scan
        </button>
      </div>

      {/* Pass card */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "6px 16px 16px" }}>
        <div style={{
          background: "#181a1f",
          borderRadius: 20,
          overflow: "hidden",
          boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
          border: "1px solid #2a2d35",
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}>

          {/* Orange header band */}
          <div style={{ background: "linear-gradient(135deg, #ea580c 0%, #f97316 60%, #fb923c 100%)", padding: "18px 20px 14px" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(0,0,0,0.55)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
              Connected Steps
            </p>
            <h1 style={{ fontSize: 17, fontWeight: 800, color: "#000", lineHeight: 1.25, marginBottom: 10 }}>
              {event.title}
            </h1>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
              <span style={{ fontSize: 12, color: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", gap: 4 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                {date}{time ? ` · ${time}` : ""}
              </span>
              <span style={{ fontSize: 12, color: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", gap: 4 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                {event.location}
              </span>
            </div>
          </div>

          {/* Perforated divider */}
          <div style={{ position: "relative", height: 24, display: "flex", alignItems: "center" }}>
            <div style={{ position: "absolute", left: -1, top: "50%", transform: "translateY(-50%)", width: 20, height: 20, borderRadius: "50%", background: "#0f1014", border: "1px solid #2a2d35", borderLeft: "none" }} />
            <div style={{ flex: 1, borderTop: "2px dashed #2a2d35", margin: "0 24px" }} />
            <div style={{ position: "absolute", right: -1, top: "50%", transform: "translateY(-50%)", width: 20, height: 20, borderRadius: "50%", background: "#0f1014", border: "1px solid #2a2d35", borderRight: "none" }} />
          </div>

          {/* QR code */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 20px 16px" }}>
            {p.qr_token ? (
              <div style={{ background: "#fff", borderRadius: 12, padding: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.5)" }}>
                <img
                  src={`/api/events/qr/${p.qr_token}`}
                  alt={`QR code for ${fullName}`}
                  style={{ width: "min(64vw, 240px)", height: "min(64vw, 240px)", display: "block", imageRendering: "pixelated" }}
                />
              </div>
            ) : (
              <div style={{ width: "min(64vw, 240px)", height: "min(64vw, 240px)", background: "#24262e", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 13, color: "#6b7280", textAlign: "center" }}>QR not<br/>available</span>
              </div>
            )}
            <p style={{ marginTop: 8, fontSize: 11, color: "#4b5563", letterSpacing: "0.06em" }}>PRESENT AT ENTRY FOR SCANNING</p>
          </div>

          {/* BIB + name */}
          <div style={{ padding: "0 20px 16px", textAlign: "center" }}>
            {hasBib && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ flex: 1, height: 1, background: "#2a2d35" }} />
                <span style={{ fontSize: 28, fontWeight: 900, color: "#f97316", letterSpacing: 3, fontVariantNumeric: "tabular-nums" }}>
                  BIB {p.bib_number}
                </span>
                <div style={{ flex: 1, height: 1, background: "#2a2d35" }} />
              </div>
            )}
            <p style={{ fontSize: 18, fontWeight: 700, color: "#e8e9eb", marginBottom: 4 }}>{fullName}</p>
            {p.distance_category && (
              <span style={{ display: "inline-block", background: "#1e2028", border: "1px solid #2a2d35", color: "#9ca3af", fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 20 }}>
                {p.distance_category}
              </span>
            )}
          </div>

          {/* Service status chips */}
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
              <StatusChip done={Boolean(p.checked_in_at)}   label="Checked In"  doneColor="#22c55e" />
              <StatusChip done={Boolean(p.bib_collected_at)} label="BIB"         doneColor="#3b82f6" />
              <StatusChip done={p.tshirt_issued}            label="T-Shirt"      doneColor="#a78bfa" />
              <StatusChip done={p.breakfast_availed}        label="Breakfast"    doneColor="#f59e0b" />
              <StatusChip done={p.medal_issued}             label="Medal"        doneColor="#f97316" />
            </div>
          </div>

          {/* Perforated divider */}
          <div style={{ position: "relative", height: 24, display: "flex", alignItems: "center" }}>
            <div style={{ position: "absolute", left: -1, top: "50%", transform: "translateY(-50%)", width: 20, height: 20, borderRadius: "50%", background: "#0f1014", border: "1px solid #2a2d35", borderLeft: "none" }} />
            <div style={{ flex: 1, borderTop: "2px dashed #2a2d35", margin: "0 24px" }} />
            <div style={{ position: "absolute", right: -1, top: "50%", transform: "translateY(-50%)", width: 20, height: 20, borderRadius: "50%", background: "#0f1014", border: "1px solid #2a2d35", borderRight: "none" }} />
          </div>

          {/* Footer: reg code + participant nav */}
          <div style={{ padding: "10px 20px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ fontSize: 10, color: "#4b5563", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>Registration</p>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", fontVariantNumeric: "tabular-nums" }}>{registration.registration_code}</p>
            </div>
            {multiPax && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  onClick={() => setActiveIdx(i => Math.max(0, i - 1))}
                  disabled={activeIdx === 0}
                  style={{ background: activeIdx === 0 ? "#1e2028" : "#2a2d35", border: "none", color: activeIdx === 0 ? "#4b5563" : "#e8e9eb", width: 30, height: 30, borderRadius: 8, cursor: activeIdx === 0 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <div style={{ display: "flex", gap: 4 }}>
                  {participants.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveIdx(i)}
                      style={{ width: i === activeIdx ? 16 : 6, height: 6, borderRadius: 3, background: i === activeIdx ? "#f97316" : "#2a2d35", border: "none", cursor: "pointer", transition: "all 0.2s", padding: 0 }}
                    />
                  ))}
                </div>
                <button
                  onClick={() => setActiveIdx(i => Math.min(participants.length - 1, i + 1))}
                  disabled={activeIdx === participants.length - 1}
                  style={{ background: activeIdx === participants.length - 1 ? "#1e2028" : "#2a2d35", border: "none", color: activeIdx === participants.length - 1 ? "#4b5563" : "#e8e9eb", width: 30, height: 30, borderRadius: 8, cursor: activeIdx === participants.length - 1 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
            )}
            {p.certificate_url && (
              <a href={p.certificate_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 600, color: "#f97316", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Certificate
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── StatusChip atom ───────────────────────────────────────────────────────────

function StatusChip({ done, label, doneColor }: { done: boolean; label: string; doneColor: string }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "4px 10px",
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 600,
      background: done ? `${doneColor}18` : "#1e2028",
      color: done ? doneColor : "#4b5563",
      border: `1px solid ${done ? `${doneColor}40` : "#2a2d35"}`,
    }}>
      {done ? "✓" : "·"} {label}
    </span>
  );
}
