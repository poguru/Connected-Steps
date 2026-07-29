"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import type { OpsResponse, OpsMetrics, OpsAlert } from "@/app/api/admin/events/[id]/ops/route";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Scan {
  id: string;
  participant_name: string;
  category: string;
  bib_number: string | null;
  registration_code: string | null;
  service_name: string;
  action: string;
  volunteer_email: string | null;
  volunteer_role: string | null;
  created_at: string;
}

interface Volunteer {
  id: string;
  email: string;
  name: string;
  role: string;
  total_scans: number;
  by_service: Record<string, number>;
  last_active: string | null;
  is_active: boolean;
}

interface Checkpoint {
  id: string;
  label: string;
  description: string | null;
  planned_at: string | null;
  actual_at: string | null;
  status: "pending" | "in_progress" | "done" | "skipped";
  notes: string | null;
  owner_email: string | null;
  display_order: number;
}

interface Incident {
  id: string;
  title: string;
  incident_type: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved" | "closed";
  description: string | null;
  resolution: string | null;
  owner_email: string | null;
  created_by: string | null;
  created_at: string;
  resolved_at: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SERVICE_META: Record<string, { label: string; color: string; bg: string }> = {
  checkin:     { label: "Check-In",    color: "#10b981", bg: "rgba(16,185,129,0.12)" },
  tshirt:      { label: "T-Shirt",     color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  breakfast:   { label: "Breakfast",   color: "#f97316", bg: "rgba(249,115,22,0.12)" },
  bib:         { label: "BIB",         color: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
  medal:       { label: "Medal",       color: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
  certificate: { label: "Certificate", color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
};

const PRIORITY_META: Record<string, { label: string; color: string; dot: string }> = {
  low:      { label: "Low",      color: "#6b7280", dot: "#6b7280" },
  medium:   { label: "Medium",   color: "#f59e0b", dot: "#f59e0b" },
  high:     { label: "High",     color: "#f97316", dot: "#f97316" },
  critical: { label: "Critical", color: "#ef4444", dot: "#ef4444" },
};

const CHECKPOINT_STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:     { label: "Pending",     color: "#6b7280", bg: "rgba(107,114,128,0.12)" },
  in_progress: { label: "In Progress", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  done:        { label: "Done",        color: "#10b981", bg: "rgba(16,185,129,0.12)" },
  skipped:     { label: "Skipped",     color: "#4b5563", bg: "rgba(75,85,99,0.08)"   },
};

const INCIDENT_TYPE_LABELS: Record<string, string> = {
  medical: "🏥 Medical", route: "🗺 Route", traffic: "🚦 Traffic",
  payment: "💳 Payment", qr: "📷 QR", volunteer: "🙋 Volunteer",
  food: "🍽 Food", technical: "⚙️ Technical", other: "📋 Other",
};

// ── Style tokens ──────────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: "#0d0d0d",
  border: "1px solid #1a1a1a",
  borderRadius: 12,
  padding: "16px 18px",
};

const LABEL_SM: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const,
  letterSpacing: "0.1em", color: "#555",
};

const INPUT_STYLE: React.CSSProperties = {
  width: "100%", padding: "8px 10px",
  background: "#0a0a0a", border: "1px solid #222",
  borderRadius: 6, color: "#fff", fontFamily: "inherit",
  fontSize: 13, outline: "none", boxSizing: "border-box" as const,
};

const BTN: React.CSSProperties = {
  padding: "7px 14px", border: "none", borderRadius: 7,
  fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};

// ── Utility components ────────────────────────────────────────────────────────

function MetricTile({ label, value, sub, accent, warn }: {
  label: string; value: string | number; sub?: string; accent?: boolean; warn?: boolean;
}) {
  return (
    <div style={{
      ...CARD, padding: "14px 16px",
      borderColor: accent ? "rgba(232,98,10,0.25)" : warn ? "rgba(245,158,11,0.25)" : "#1a1a1a",
    }}>
      <div style={LABEL_SM}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: warn ? "#f59e0b" : accent ? "#e8620a" : "#fff", lineHeight: 1.2, marginTop: 4 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: "#444", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, color, background: bg, letterSpacing: "0.05em" }}>
      {label}
    </span>
  );
}

function SectionHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.12em", color: "#e8620a" }}>{title}</div>
      {children}
    </div>
  );
}

function ts(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function dt(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

function fmt(n: number) { return n.toLocaleString("en-IN"); }

function pct(n: number, d: number) {
  if (!d) return 0;
  return Math.round((n / d) * 100);
}

function ProgressBar({ value, max, color = "#e8620a", height = 4 }: { value: number; max: number; color?: string; height?: number }) {
  const p = Math.min(100, pct(value, max));
  return (
    <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 99, height, overflow: "hidden", marginTop: 4 }}>
      <div style={{ width: `${p}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.5s ease" }} />
    </div>
  );
}

// ── Health Score display ──────────────────────────────────────────────────────

function HealthBadge({ score, status }: { score: number; status: "green" | "amber" | "red" }) {
  const color = status === "green" ? "#10b981" : status === "amber" ? "#f59e0b" : "#ef4444";
  const bg    = status === "green" ? "rgba(16,185,129,0.12)" : status === "amber" ? "rgba(245,158,11,0.12)" : "rgba(239,68,68,0.12)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", background: bg, border: `1px solid ${color}30`, borderRadius: 99 }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}` }} />
      <span style={{ fontSize: 13, fontWeight: 700, color }}>{score}</span>
      <span style={{ fontSize: 11, color: color + "cc" }}>Health</span>
    </div>
  );
}

// ── Alert banner ──────────────────────────────────────────────────────────────

function AlertBanner({ alerts }: { alerts: OpsAlert[] }) {
  if (!alerts.length) return null;
  const critical = alerts.filter(a => a.severity === "critical");
  const warnings = alerts.filter(a => a.severity === "warning");
  const shown = [...critical, ...warnings].slice(0, 3);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
      {shown.map(a => (
        <div key={a.id} style={{
          display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
          background: a.severity === "critical" ? "rgba(239,68,68,0.08)" : "rgba(245,158,11,0.08)",
          border: `1px solid ${a.severity === "critical" ? "rgba(239,68,68,0.25)" : "rgba(245,158,11,0.25)"}`,
          borderRadius: 8, fontSize: 12,
        }}>
          <span style={{ fontSize: 14 }}>{a.severity === "critical" ? "🔴" : "🟡"}</span>
          <span style={{ color: a.severity === "critical" ? "#f87171" : "#f59e0b", fontWeight: 600 }}>{a.message}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function OpsCommandCenter({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);

  const [ops,         setOps]         = useState<OpsResponse | null>(null);
  const [scans,       setScans]       = useState<Scan[]>([]);
  const [volunteers,  setVolunteers]  = useState<Volunteer[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [incidents,   setIncidents]   = useState<Incident[]>([]);

  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [loading,     setLoading]     = useState(true);
  const [tab,         setTab]         = useState<"overview" | "scans" | "volunteers" | "checkpoints" | "incidents">("overview");
  const [scanFilter,  setScanFilter]  = useState("");
  const [scanSearch,  setScanSearch]  = useState("");
  const [connStatus,  setConnStatus]  = useState<"connecting" | "connected" | "error">("connecting");
  const [reconnectKey, setReconnectKey] = useState(0);

  // Checkpoint add form
  const [cpForm, setCpForm] = useState({ label: "", planned_at: "", owner_email: "" });
  const [cpSaving, setCpSaving] = useState(false);

  // Incident add form
  const [incForm, setIncForm] = useState({ title: "", incident_type: "other", priority: "medium", description: "" });
  const [incSaving, setIncSaving] = useState(false);


  const fetchCheckpoints = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/events/${eventId}/checkpoints`);
      if (!res.ok) return;
      const data = await res.json() as { checkpoints: Checkpoint[] };
      setCheckpoints(data.checkpoints);
    } catch { /* keep last */ }
  }, [eventId]);

  const fetchIncidents = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/events/${eventId}/incidents`);
      if (!res.ok) return;
      const data = await res.json() as { incidents: Incident[] };
      setIncidents(data.incidents);
    } catch { /* keep last */ }
  }, [eventId]);

  // ── SSE live feed ─────────────────────────────────────────────────────────
  // Replaces 8 s polling. Sends a full "initial" snapshot on connect, then
  // streams incremental scan events (~3 s), metrics, and volunteers (~9 s).
  // EventSource auto-reconnects on drop; each reconnect re-sends "initial".

  useEffect(() => {
    setLoading(true);
    setConnStatus("connecting");
    const es = new EventSource(`/api/admin/events/${eventId}/ops/stream`);

    es.addEventListener("initial", (e) => {
      type InitialPayload = OpsResponse & { scans: Scan[]; volunteers: Volunteer[] };
      const d = JSON.parse((e as MessageEvent).data as string) as InitialPayload;
      setOps(d);
      setScans(Array.isArray(d.scans)      ? d.scans      : []);
      setVolunteers(Array.isArray(d.volunteers) ? d.volunteers : []);
      setLastUpdated(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      setLoading(false);
      setConnStatus("connected");
    });

    es.addEventListener("metrics", (e) => {
      setOps(JSON.parse((e as MessageEvent).data as string) as OpsResponse);
      setLastUpdated(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    });

    es.addEventListener("scans", (e) => {
      const d = JSON.parse((e as MessageEvent).data as string) as { scans: Scan[] };
      if (d.scans.length > 0) {
        setScans(prev => {
          const seen  = new Set(prev.map(s => s.id));
          const fresh = d.scans.filter(s => !seen.has(s.id));
          return [...fresh, ...prev].slice(0, 100);
        });
        setLastUpdated(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      }
    });

    es.addEventListener("volunteers", (e) => {
      const d = JSON.parse((e as MessageEvent).data as string) as { volunteers: Volunteer[] };
      setVolunteers(d.volunteers);
    });

    es.onerror = () => setConnStatus("error");

    return () => es.close();
  // reconnectKey lets the Refresh button force a new SSE connection
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, reconnectKey]);

  // Checkpoints + incidents: still polled (30 s) — user-mutated in-page,
  // and SSE push for them would conflict with optimistic local updates.
  useEffect(() => {
    void fetchCheckpoints();
    void fetchIncidents();
  }, [fetchCheckpoints, fetchIncidents]);

  useEffect(() => {
    const id = setInterval(() => {
      void fetchCheckpoints();
      void fetchIncidents();
    }, 30000);
    return () => clearInterval(id);
  }, [fetchCheckpoints, fetchIncidents]);

  // ── Checkpoint actions ────────────────────────────────────────────────────

  async function addCheckpoint() {
    if (!cpForm.label.trim()) return;
    setCpSaving(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/checkpoints`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: cpForm.label.trim(), planned_at: cpForm.planned_at || null, owner_email: cpForm.owner_email || null }),
      });
      if (res.ok) {
        const d = await res.json() as { checkpoint: Checkpoint };
        setCheckpoints(prev => [...prev, d.checkpoint]);
        setCpForm({ label: "", planned_at: "", owner_email: "" });
      }
    } finally { setCpSaving(false); }
  }

  async function markCheckpoint(id: string, status: Checkpoint["status"]) {
    const res = await fetch(`/api/admin/events/${eventId}/checkpoints`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) {
      const d = await res.json() as { checkpoint: Checkpoint };
      setCheckpoints(prev => prev.map(c => c.id === id ? d.checkpoint : c));
    }
  }

  async function deleteCheckpoint(id: string) {
    if (!confirm("Delete checkpoint?")) return;
    const res = await fetch(`/api/admin/events/${eventId}/checkpoints`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setCheckpoints(prev => prev.filter(c => c.id !== id));
  }

  // ── Incident actions ──────────────────────────────────────────────────────

  async function addIncident() {
    if (!incForm.title.trim()) return;
    setIncSaving(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/incidents`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...incForm, title: incForm.title.trim() }),
      });
      if (res.ok) {
        const d = await res.json() as { incident: Incident };
        setIncidents(prev => [d.incident, ...prev]);
        setIncForm({ title: "", incident_type: "other", priority: "medium", description: "" });
      }
    } finally { setIncSaving(false); }
  }

  async function updateIncidentStatus(id: string, status: Incident["status"]) {
    const res = await fetch(`/api/admin/events/${eventId}/incidents`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) {
      const d = await res.json() as { incident: Incident };
      setIncidents(prev => prev.map(i => i.id === id ? d.incident : i));
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 14 }}>
        Loading Command Center…
      </div>
    );
  }

  if (connStatus === "error" && !ops) {
    return (
      <div style={{ minHeight: "100vh", background: "#080808", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <div style={{ color: "#f87171", fontSize: 14 }}>Failed to connect to live stream</div>
        <button onClick={() => setReconnectKey(k => k + 1)} style={{ ...BTN, background: "#e8620a", color: "#fff" }}>Retry</button>
      </div>
    );
  }

  const m: OpsMetrics = ops?.metrics ?? {} as OpsMetrics;
  const event = ops?.event;
  const health = ops?.health ?? { score: 0, status: "red" as const, factors: [] };
  const alerts = ops?.alerts ?? [];

  // Compute check-in rate for progress bars
  const checkinRate = pct(m.checked_in, m.confirmed);
  const tshirtRate  = pct(m.tshirt_issued, m.confirmed);
  const breakfastRate = pct(m.breakfast_issued, m.confirmed);

  // SSE sends all scans; both service filter and search are now client-side
  const filteredScans = scans.filter(s =>
    (!scanFilter || s.service_name === scanFilter) &&
    (!scanSearch || (
      s.participant_name.toLowerCase().includes(scanSearch.toLowerCase()) ||
      (s.registration_code ?? "").toLowerCase().includes(scanSearch.toLowerCase()) ||
      (s.volunteer_email ?? "").toLowerCase().includes(scanSearch.toLowerCase())
    ))
  );

  const openIncidents = incidents.filter(i => i.status === "open" || i.status === "in_progress");

  const NAV_TABS: { key: typeof tab; label: string; badge?: number }[] = [
    { key: "overview",     label: "Overview" },
    { key: "scans",        label: "Live Scans",   badge: scans.length > 0 ? scans.length : undefined },
    { key: "volunteers",   label: "Volunteers",   badge: volunteers.filter(v => v.is_active).length || undefined },
    { key: "checkpoints",  label: "Checkpoints",  badge: checkpoints.filter(c => c.status === "in_progress").length || undefined },
    { key: "incidents",    label: "Incidents",    badge: openIncidents.length || undefined },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#fff", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @keyframes livePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        .live-dot--on { animation: livePulse 2s ease-in-out infinite; box-shadow: 0 0 5px #10b981; }
      `}</style>

      {/* ── Sticky header ───────────────────────────────────────────────── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(8,8,8,0.95)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid #1a1a1a", padding: "0 20px",
      }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", alignItems: "center", gap: 12, height: 56 }}>
          <Link href={`/admin/events/${eventId}/manage`} style={{ color: "#555", fontSize: 18, textDecoration: "none", lineHeight: 1 }}>←</Link>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {event?.title ?? "Command Center"}
            </div>
            <div style={{ fontSize: 10, color: "#444", marginTop: 1 }}>Operations · Last updated {lastUpdated || "—"}</div>
          </div>

          <HealthBadge score={health.score} status={health.status} />

          {/* Live connection status indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", background: "rgba(16,16,16,0.8)", border: `1px solid ${connStatus === "connected" ? "rgba(16,185,129,0.25)" : connStatus === "error" ? "rgba(239,68,68,0.25)" : "rgba(245,158,11,0.25)"}`, borderRadius: 99 }}>
            <span className={connStatus === "connected" ? "live-dot live-dot--on" : "live-dot"} style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: connStatus === "connected" ? "#10b981" : connStatus === "error" ? "#ef4444" : "#f59e0b" }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: connStatus === "connected" ? "#10b981" : connStatus === "error" ? "#f87171" : "#f59e0b" }}>
              {connStatus === "connected" ? "LIVE" : connStatus === "error" ? "RECONNECTING" : "CONNECTING"}
            </span>
          </div>

          <button
            onClick={() => setReconnectKey(k => k + 1)}
            style={{ ...BTN, background: "rgba(255,255,255,0.06)", color: "#888", border: "1px solid #222" }}
          >↻ Refresh</button>

          <Link
            href={`/admin/events/${eventId}/race-day`}
            style={{ ...BTN, background: "#e8620a", color: "#fff", textDecoration: "none", display: "inline-flex", alignItems: "center" }}
          >
            🏃 Race Day Hub
          </Link>
        </div>

        {/* Sub-nav tabs */}
        <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", gap: 2 }}>
          {NAV_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "10px 14px", background: "transparent", border: "none",
                borderBottom: `2px solid ${tab === t.key ? "#e8620a" : "transparent"}`,
                color: tab === t.key ? "#fff" : "#555", fontSize: 12, fontWeight: tab === t.key ? 700 : 400,
                cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6,
                transition: "all 0.15s",
              }}
            >
              {t.label}
              {t.badge !== undefined && t.badge > 0 && (
                <span style={{ fontSize: 10, background: t.key === "incidents" ? "#ef4444" : "#e8620a", color: "#fff", borderRadius: 99, padding: "1px 6px", fontWeight: 700 }}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "20px 20px 60px" }}>

        {/* Alerts */}
        <AlertBanner alerts={alerts} />

        {/* ── OVERVIEW TAB ─────────────────────────────────────────────── */}
        {tab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Metric grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
              <MetricTile label="Total Registrations" value={fmt(m.total_regs)} />
              <MetricTile label="Confirmed" value={fmt(m.confirmed)} accent />
              <MetricTile label="Pending Payment" value={fmt(m.pending_payment)} warn={m.pending_payment > 0} />
              <MetricTile label="Cancelled" value={fmt(m.cancelled)} />
              <MetricTile label="Waitlist" value={fmt(m.waitlist_count)} />
              <MetricTile label="Slots Remaining" value={m.remaining_slots !== null ? fmt(m.remaining_slots) : "∞"} warn={(m.remaining_slots ?? 99) <= 10} />
              <MetricTile label="Checked In" value={fmt(m.checked_in)} sub={`${checkinRate}% of confirmed`} accent />
              <MetricTile label="T-Shirts Issued" value={fmt(m.tshirt_issued)} sub={`${tshirtRate}%`} />
              <MetricTile label="Breakfast Issued" value={fmt(m.breakfast_issued)} sub={`${breakfastRate}%`} />
              <MetricTile label="Certificates" value={fmt(m.certificates_issued)} />
              <MetricTile label="Revenue" value={`₹${fmt(m.revenue_collected)}`} accent />
              <MetricTile label="Coupons Used" value={fmt(m.coupons_used)} />
            </div>

            {/* Two-column: progress + health factors */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

              {/* Event Day Progress */}
              <div style={CARD}>
                <SectionHead title="Event Day Progress" />
                {[
                  { label: "Check-in",    value: m.checked_in,    max: m.confirmed, color: "#10b981" },
                  { label: "BIB",         value: m.bib_collected, max: m.confirmed, color: "#60a5fa" },
                  { label: "T-Shirt",     value: m.tshirt_issued, max: m.confirmed, color: "#f59e0b" },
                  { label: "Breakfast",   value: m.breakfast_issued, max: m.confirmed, color: "#f97316" },
                  { label: "Medal",       value: m.medals_issued,    max: m.confirmed, color: "#fbbf24" },
                  { label: "Certificate", value: m.certificates_issued, max: m.confirmed, color: "#a78bfa" },
                ].map(row => (
                  <div key={row.label} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                      <span style={{ fontSize: 12, color: "#888" }}>{row.label}</span>
                      <span style={{ fontSize: 12, color: "#fff", fontWeight: 600 }}>
                        {fmt(row.value)} <span style={{ color: "#444", fontWeight: 400 }}>/ {fmt(row.max)}</span>
                        <span style={{ color: "#555", marginLeft: 6 }}>({pct(row.value, row.max)}%)</span>
                      </span>
                    </div>
                    <ProgressBar value={row.value} max={row.max} color={row.color} height={5} />
                  </div>
                ))}
              </div>

              {/* Health Score Breakdown */}
              <div style={CARD}>
                <SectionHead title="Health Score">
                  <HealthBadge score={health.score} status={health.status} />
                </SectionHead>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {health.factors.map(f => (
                    <div key={f.label}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 12, color: "#888" }}>{f.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: f.score >= 75 ? "#10b981" : f.score >= 50 ? "#f59e0b" : "#ef4444" }}>{f.score}</span>
                      </div>
                      <ProgressBar value={f.score} max={100} color={f.score >= 75 ? "#10b981" : f.score >= 50 ? "#f59e0b" : "#ef4444"} height={4} />
                      <div style={{ fontSize: 10, color: "#444", marginTop: 2 }}>{f.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick links */}
            <div style={CARD}>
              <SectionHead title="Quick Navigation" />
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
                {[
                  { href: `/admin/events/${eventId}/race-day`,      label: "🏃 Race Day Hub" },
                  { href: `/admin/events/${eventId}/participants`,   label: "🪪 Participants" },
                  { href: `/admin/events/${eventId}/registrations`,  label: "👥 Registrations" },
                  { href: `/admin/events/${eventId}/analytics`,      label: "📈 Analytics" },
                  { href: `/admin/events/${eventId}/volunteers`,     label: "🙋 Volunteers" },
                  { href: `/admin/events/${eventId}/communicate`,    label: "📢 Communicate" },
                  { href: `/admin/events/${eventId}/bib`,            label: "📦 BIB Collection" },
                  { href: `/admin/events/${eventId}/results`,        label: "🏅 Results" },
                  { href: `/event-checkin`,                          label: "📷 Check-in Scanner" },
                ].map(l => (
                  <Link
                    key={l.href}
                    href={l.href}
                    style={{
                      padding: "8px 14px", background: "rgba(255,255,255,0.04)",
                      border: "1px solid #222", borderRadius: 8,
                      color: "#ccc", fontSize: 12, textDecoration: "none",
                      transition: "all 0.15s",
                    }}
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>

            {/* Email + queue health */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={CARD}>
                <SectionHead title="Email Queue" />
                <div style={{ display: "flex", gap: 16 }}>
                  <div>
                    <div style={LABEL_SM}>Queued</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>{ops?.email_queue.queued ?? 0}</div>
                  </div>
                  <div>
                    <div style={LABEL_SM}>Failed</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: (ops?.email_queue.failed ?? 0) > 0 ? "#f87171" : "#fff" }}>{ops?.email_queue.failed ?? 0}</div>
                  </div>
                  <div>
                    <div style={LABEL_SM}>Dead Jobs</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: (ops?.email_queue.dead ?? 0) > 0 ? "#ef4444" : "#fff" }}>{ops?.email_queue.dead ?? 0}</div>
                  </div>
                </div>
                {(ops?.email_queue.failed ?? 0) > 0 && (
                  <Link href={`/admin/events/${eventId}/communicate`} style={{ display: "inline-block", marginTop: 12, fontSize: 11, color: "#e8620a", textDecoration: "underline" }}>
                    View communication hub →
                  </Link>
                )}
              </div>

              <div style={CARD}>
                <SectionHead title="Volunteer Coverage" />
                <div style={{ fontSize: 28, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{m.volunteers_assigned}</div>
                <div style={{ fontSize: 12, color: "#555" }}>volunteer assignment(s)</div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <div style={{ fontSize: 12, color: "#10b981" }}>● {volunteers.filter(v => v.is_active).length} active</div>
                  <div style={{ fontSize: 12, color: "#555" }}>● {volunteers.filter(v => !v.is_active).length} inactive</div>
                </div>
                <Link href={`/admin/events/${eventId}/volunteers`} style={{ display: "inline-block", marginTop: 8, fontSize: 11, color: "#e8620a", textDecoration: "underline" }}>
                  Manage volunteers →
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ── LIVE SCANS TAB ───────────────────────────────────────────── */}
        {tab === "scans" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Filter bar */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
              <input
                value={scanSearch}
                onChange={e => setScanSearch(e.target.value)}
                placeholder="Search by name, code, volunteer…"
                style={{ ...INPUT_STYLE, maxWidth: 280 }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                {["", "checkin", "tshirt", "breakfast", "bib", "medal", "certificate"].map(svc => (
                  <button
                    key={svc}
                    onClick={() => setScanFilter(svc)}
                    style={{
                      ...BTN,
                      background: scanFilter === svc ? (svc ? (SERVICE_META[svc]?.bg ?? "rgba(232,98,10,0.15)") : "rgba(255,255,255,0.1)") : "rgba(255,255,255,0.04)",
                      color: scanFilter === svc ? (svc ? (SERVICE_META[svc]?.color ?? "#e8620a") : "#fff") : "#555",
                      border: "1px solid #222",
                    }}
                  >
                    {svc ? (SERVICE_META[svc]?.label ?? svc) : "All"}
                  </button>
                ))}
              </div>
            </div>

            {/* Scan feed */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {filteredScans.length === 0 && (
                <div style={{ textAlign: "center", padding: "48px 0", color: "#333", fontSize: 13 }}>
                  No scans found{scanSearch ? ` matching "${scanSearch}"` : ""}. Scans will appear as volunteers process participants.
                </div>
              )}
              {filteredScans.map(scan => {
                const svc = SERVICE_META[scan.service_name];
                return (
                  <div key={scan.id} style={{
                    ...CARD, padding: "12px 14px",
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto auto",
                    gap: 12, alignItems: "center",
                    borderLeft: `3px solid ${svc?.color ?? "#333"}`,
                  }}>
                    <div style={{ width: 36, textAlign: "center" }}>
                      <Pill label={svc?.label ?? scan.service_name} color={svc?.color ?? "#888"} bg={svc?.bg ?? "#1a1a1a"} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{scan.participant_name}</div>
                      <div style={{ fontSize: 11, color: "#555", marginTop: 1 }}>
                        {scan.category}{scan.bib_number ? ` · BIB ${scan.bib_number}` : ""}
                        {scan.registration_code ? ` · ${scan.registration_code}` : ""}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: "#444", textAlign: "right" }}>
                      <div>{scan.volunteer_email?.split("@")[0] ?? "—"}</div>
                      <div style={{ color: "#333" }}>{scan.volunteer_role ?? ""}</div>
                    </div>
                    <div style={{ fontSize: 11, color: "#444", fontVariantNumeric: "tabular-nums", minWidth: 60, textAlign: "right" }}>
                      {ts(scan.created_at)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── VOLUNTEERS TAB ───────────────────────────────────────────── */}
        {tab === "volunteers" && (
          <div>
            {volunteers.length === 0 && (
              <div style={{ ...CARD, textAlign: "center", padding: "48px", color: "#444", fontSize: 13 }}>
                No volunteers assigned yet.{" "}
                <Link href={`/admin/events/${eventId}/volunteers`} style={{ color: "#e8620a" }}>Manage volunteers →</Link>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
              {volunteers.map(v => (
                <div key={v.id} style={{ ...CARD, borderLeft: `3px solid ${v.is_active ? "#10b981" : "#222"}` }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{v.name || v.email}</div>
                      <div style={{ fontSize: 11, color: "#444", marginTop: 1 }}>{v.email}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                      <Pill
                        label={v.is_active ? "Active" : "Offline"}
                        color={v.is_active ? "#10b981" : "#555"}
                        bg={v.is_active ? "rgba(16,185,129,0.12)" : "rgba(107,114,128,0.08)"}
                      />
                      <span style={{ fontSize: 10, color: "#333", textTransform: "capitalize" as const }}>{v.role.replace(/_/g, " ")}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{fmt(v.total_scans)}</div>
                  <div style={{ fontSize: 11, color: "#444", marginBottom: 10 }}>total scans</div>
                  <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 5 }}>
                    {Object.entries(v.by_service).map(([svc, cnt]) => {
                      const meta = SERVICE_META[svc];
                      return (
                        <span key={svc} style={{
                          fontSize: 10, padding: "2px 7px", borderRadius: 20,
                          color: meta?.color ?? "#888", background: meta?.bg ?? "#1a1a1a",
                        }}>
                          {meta?.label ?? svc}: {cnt}
                        </span>
                      );
                    })}
                  </div>
                  {v.last_active && (
                    <div style={{ fontSize: 10, color: "#333", marginTop: 8 }}>Last seen {ts(v.last_active)}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── CHECKPOINTS TAB ─────────────────────────────────────────── */}
        {tab === "checkpoints" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 740 }}>
            {/* Add form */}
            <div style={CARD}>
              <SectionHead title="Add Checkpoint" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 180px 180px auto", gap: 8, alignItems: "flex-end" }}>
                <div>
                  <div style={{ ...LABEL_SM, marginBottom: 4 }}>Label</div>
                  <input
                    value={cpForm.label}
                    onChange={e => setCpForm(f => ({ ...f, label: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && addCheckpoint()}
                    placeholder="e.g. Flag-off"
                    style={INPUT_STYLE}
                  />
                </div>
                <div>
                  <div style={{ ...LABEL_SM, marginBottom: 4 }}>Planned Time</div>
                  <input
                    type="datetime-local"
                    value={cpForm.planned_at}
                    onChange={e => setCpForm(f => ({ ...f, planned_at: e.target.value }))}
                    style={{ ...INPUT_STYLE, colorScheme: "dark" as const }}
                  />
                </div>
                <div>
                  <div style={{ ...LABEL_SM, marginBottom: 4 }}>Owner Email</div>
                  <input
                    value={cpForm.owner_email}
                    onChange={e => setCpForm(f => ({ ...f, owner_email: e.target.value }))}
                    placeholder="owner@..."
                    style={INPUT_STYLE}
                  />
                </div>
                <button
                  onClick={addCheckpoint}
                  disabled={cpSaving || !cpForm.label.trim()}
                  style={{ ...BTN, background: "#e8620a", color: "#fff", whiteSpace: "nowrap" as const, padding: "8px 16px" }}
                >
                  {cpSaving ? "Adding…" : "Add"}
                </button>
              </div>
            </div>

            {/* Checkpoint list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {checkpoints.length === 0 && (
                <div style={{ ...CARD, textAlign: "center", padding: "36px", color: "#444", fontSize: 13 }}>
                  No checkpoints yet. Add milestones like Venue Ready, Flag-off, Breakfast, etc.
                </div>
              )}
              {checkpoints.map((cp, idx) => {
                const meta = CHECKPOINT_STATUS_META[cp.status];
                return (
                  <div key={cp.id} style={{
                    ...CARD, display: "flex", alignItems: "flex-start", gap: 12,
                    borderLeft: `3px solid ${meta.color}`,
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%",
                      background: cp.status === "done" ? "#10b981" : "#1a1a1a",
                      border: `2px solid ${meta.color}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 700, color: cp.status === "done" ? "#fff" : meta.color,
                      flexShrink: 0, marginTop: 1,
                    }}>
                      {cp.status === "done" ? "✓" : idx + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{cp.label}</span>
                        <Pill label={meta.label} color={meta.color} bg={meta.bg} />
                      </div>
                      {cp.description && <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>{cp.description}</div>}
                      <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#444" }}>
                        {cp.planned_at && <span>📅 Planned: {dt(cp.planned_at)}</span>}
                        {cp.actual_at  && <span style={{ color: "#10b981" }}>✓ Done: {dt(cp.actual_at)}</span>}
                        {cp.owner_email && <span>👤 {cp.owner_email}</span>}
                      </div>
                      {cp.notes && <div style={{ fontSize: 11, color: "#555", marginTop: 4, fontStyle: "italic" }}>{cp.notes}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      {cp.status !== "done" && cp.status !== "skipped" && (
                        <button
                          onClick={() => markCheckpoint(cp.id, cp.status === "pending" ? "in_progress" : "done")}
                          style={{ ...BTN, background: cp.status === "pending" ? "rgba(245,158,11,0.12)" : "rgba(16,185,129,0.12)", color: cp.status === "pending" ? "#f59e0b" : "#10b981", border: `1px solid ${cp.status === "pending" ? "rgba(245,158,11,0.2)" : "rgba(16,185,129,0.2)"}` }}
                        >
                          {cp.status === "pending" ? "Start" : "Done"}
                        </button>
                      )}
                      {cp.status === "done" && (
                        <button onClick={() => markCheckpoint(cp.id, "pending")} style={{ ...BTN, background: "rgba(255,255,255,0.04)", color: "#555", border: "1px solid #222" }}>
                          Undo
                        </button>
                      )}
                      <button onClick={() => deleteCheckpoint(cp.id)} style={{ ...BTN, background: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>×</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── INCIDENTS TAB ────────────────────────────────────────────── */}
        {tab === "incidents" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 800 }}>
            {/* Add form */}
            <div style={CARD}>
              <SectionHead title="Log Incident" />
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 140px", gap: 8 }}>
                  <div>
                    <div style={{ ...LABEL_SM, marginBottom: 4 }}>Title</div>
                    <input
                      value={incForm.title}
                      onChange={e => setIncForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="Describe the incident"
                      style={INPUT_STYLE}
                    />
                  </div>
                  <div>
                    <div style={{ ...LABEL_SM, marginBottom: 4 }}>Type</div>
                    <select value={incForm.incident_type} onChange={e => setIncForm(f => ({ ...f, incident_type: e.target.value }))} style={{ ...INPUT_STYLE, colorScheme: "dark" as const }}>
                      {Object.entries(INCIDENT_TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k} style={{ background: "#0a0a0a" }}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div style={{ ...LABEL_SM, marginBottom: 4 }}>Priority</div>
                    <select value={incForm.priority} onChange={e => setIncForm(f => ({ ...f, priority: e.target.value }))} style={{ ...INPUT_STYLE, colorScheme: "dark" as const }}>
                      <option value="low" style={{ background: "#0a0a0a" }}>Low</option>
                      <option value="medium" style={{ background: "#0a0a0a" }}>Medium</option>
                      <option value="high" style={{ background: "#0a0a0a" }}>High</option>
                      <option value="critical" style={{ background: "#0a0a0a" }}>Critical</option>
                    </select>
                  </div>
                </div>
                <div>
                  <div style={{ ...LABEL_SM, marginBottom: 4 }}>Description (optional)</div>
                  <textarea
                    value={incForm.description}
                    onChange={e => setIncForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Additional details, location, who is involved…"
                    style={{ ...INPUT_STYLE, minHeight: 60, resize: "vertical" as const }}
                  />
                </div>
                <button
                  onClick={addIncident}
                  disabled={incSaving || !incForm.title.trim()}
                  style={{ ...BTN, background: "#e8620a", color: "#fff", alignSelf: "flex-start" as const, padding: "8px 18px" }}
                >
                  {incSaving ? "Logging…" : "Log Incident"}
                </button>
              </div>
            </div>

            {/* Incident list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {incidents.length === 0 && (
                <div style={{ ...CARD, textAlign: "center", padding: "36px", color: "#444", fontSize: 13 }}>
                  No incidents logged. Use this to track medical situations, QR failures, volunteer issues, and other operational events.
                </div>
              )}
              {incidents.map(inc => {
                const pm = PRIORITY_META[inc.priority];
                const isOpen = inc.status === "open" || inc.status === "in_progress";
                return (
                  <div key={inc.id} style={{
                    ...CARD,
                    borderLeft: `3px solid ${pm.dot}`,
                    opacity: inc.status === "closed" ? 0.6 : 1,
                  }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const, marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{inc.title}</span>
                          <Pill label={pm.label} color={pm.color} bg={`${pm.dot}18`} />
                          <Pill
                            label={inc.status.replace("_", " ")}
                            color={inc.status === "resolved" || inc.status === "closed" ? "#10b981" : inc.status === "in_progress" ? "#f59e0b" : "#6b7280"}
                            bg={inc.status === "resolved" || inc.status === "closed" ? "rgba(16,185,129,0.1)" : inc.status === "in_progress" ? "rgba(245,158,11,0.1)" : "rgba(107,114,128,0.08)"}
                          />
                          <span style={{ fontSize: 10, color: "#333" }}>{INCIDENT_TYPE_LABELS[inc.incident_type] ?? inc.incident_type}</span>
                        </div>
                        {inc.description && <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>{inc.description}</div>}
                        {inc.resolution  && <div style={{ fontSize: 12, color: "#10b981", marginBottom: 4 }}>Resolution: {inc.resolution}</div>}
                        <div style={{ fontSize: 10, color: "#333" }}>
                          {inc.created_by && `By ${inc.created_by} · `}
                          {dt(inc.created_at)}
                          {inc.resolved_at && ` · Resolved ${dt(inc.resolved_at)}`}
                        </div>
                      </div>
                      {isOpen && (
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          {inc.status === "open" && (
                            <button onClick={() => updateIncidentStatus(inc.id, "in_progress")} style={{ ...BTN, background: "rgba(245,158,11,0.1)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.2)", fontSize: 11 }}>
                              In Progress
                            </button>
                          )}
                          <button onClick={() => updateIncidentStatus(inc.id, "resolved")} style={{ ...BTN, background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.2)", fontSize: 11 }}>
                            Resolve
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
