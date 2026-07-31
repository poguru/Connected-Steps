"use client";

import { useState, useEffect, useCallback, useRef, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getLifecycle } from "@/lib/event-lifecycle";
import { Button, Alert, Badge, Card, EmptyState, Spinner } from "@/components/ui/ds";
import { EventFormBuilder } from "@/components/admin/EventFormBuilder";

// ── Section error boundary ─────────────────────────────────────────────────────

class SectionBoundary extends Component<
  { title: string; children: ReactNode },
  { caught: boolean; msg: string }
> {
  state = { caught: false, msg: "" };
  static getDerivedStateFromError(e: unknown) {
    return { caught: true, msg: e instanceof Error ? e.message : String(e) };
  }
  componentDidCatch(e: Error, info: ErrorInfo) {
    console.error(`[EventHub] "${this.props.title}" crashed:`, e.message, info.componentStack?.slice(0, 200));
  }
  render() {
    if (this.state.caught) {
      return (
        <div style={{ background: "#111", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 10, padding: "1rem 1.25rem", marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#f87171", marginBottom: 4 }}>⚠ Unable to load: {this.props.title}</div>
          <div style={{ fontSize: 11, color: "#555" }}>{this.state.msg}</div>
          <Button size="xs" variant="ghost" style={{ marginTop: 8 }} onClick={() => this.setState({ caught: false, msg: "" })}>Retry</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface EventOverview {
  event: {
    id: string; title: string; status: string;
    start_date: string; start_time: string | null;
    end_date: string | null; end_time: string | null;
    location: string; max_participants: number | null;
    price: number; cover_image: string | null;
    registration_closes_at: string | null;
    distance_categories: string[] | null;
    featured: boolean; share_slug: string | null;
    registration_config:     Record<string, unknown> | null;
    allow_multi_participant: boolean;
    max_per_registration:    number;
  } | null;
  registrations: { total: number; confirmed: number; pending: number; cancelled: number; paid: number; free: number; checked_in: number; active: number };
  capacity:  { max: number | null; filled: number; remaining: number | null };
  revenue:   { collected: number; pending: number };
  emails:    { campaigns: number; confirmation_sent: number; confirmation_failed: number; campaign_delivered: number; campaign_failed: number; campaign_queued: number };
  races:     Array<{ id: string; name: string; distance: string; price: number; max_slots: number | null; status: string; gun_time: string | null; flag_off_time: string | null; report_time: string | null }>;
  recent_comms: Array<{ sent: number; failed: number; status: string; sent_at: string; subject: string; channel: string | null; recipients: number }>;
  waitlist:  { waiting: number };
}

// ── Nav definition ─────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { key: "overview",      icon: "⚡", label: "Overview",       inline: true  },
  { key: "ops",           icon: "🎛️", label: "Command Center", inline: false, href: "ops"           },
  { key: "registrations", icon: "👥", label: "Registrations",  inline: false, href: "registrations" },
  { key: "participants",  icon: "🪪", label: "Participants",   inline: false, href: "participants"  },
  { key: "races",         icon: "🏁", label: "Races",          inline: true  },
  { key: "form",          icon: "📋", label: "Form Builder",   inline: true  },
  { key: "steps",         icon: "🔢", label: "Reg. Steps",     inline: true  },
  { key: "pricing",       icon: "🏷️", label: "Pricing Rules",  inline: true  },
  { key: "registration",  icon: "🧾", label: "Registration",   inline: true  },
  { key: "cat-changes",   icon: "🔄", label: "Cat. Changes",   inline: true  },
  { key: "waitlist",      icon: "⏳", label: "Waitlist",       inline: true  },
  { key: "route-maps",    icon: "🗺️", label: "Route Maps",     inline: true  },
  { key: "landing",       icon: "🌐", label: "Landing Page",   inline: true  },
  { key: "communicate",   icon: "📢", label: "Communicate",    inline: false, href: "communicate"   },
  { key: "announce",      icon: "📣", label: "Announce",       inline: true  },
  { key: "race-day",      icon: "🏃", label: "Race Day",       inline: false, href: "race-day"      },
  { key: "bib",           icon: "📦", label: "BIB Collection", inline: false, href: "bib"           },
  { key: "results",       icon: "🏅", label: "Results",        inline: false, href: "results"       },
  { key: "analytics",     icon: "📈", label: "Analytics",      inline: false, href: "analytics"     },
  { key: "sponsors",      icon: "🤝", label: "Sponsors",       inline: false, href: "sponsors"      },
  { key: "volunteers",    icon: "🙋", label: "Volunteers",     inline: false, href: "volunteers"    },
  { key: "teams",         icon: "🏢", label: "Corp. Wellness", inline: false, href: "teams"         },
  { key: "services",      icon: "🔧", label: "Services",       inline: false, href: "services"      },
  { key: "cancellations", icon: "↩️", label: "Cancellations",  inline: false, href: "cancellations" },
  { key: "finance",       icon: "💰", label: "Finance",        inline: true  },
  { key: "versions",      icon: "🕐", label: "Versions",       inline: true  },
  { key: "settings",      icon: "⚙️", label: "Settings",       inline: true  },
] as const;

type TabKey = typeof NAV_ITEMS[number]["key"];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number)    { return (n ?? 0).toLocaleString("en-IN"); }
function fmtInr(n: number) { return `₹${(n ?? 0).toLocaleString("en-IN")}`; }
function fmtDate(d: string) {
  try { return new Date(d + "T12:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }); }
  catch { return d; }
}
function fmtTime(t: string | null) {
  if (!t) return null;
  try { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; }
  catch { return t; }
}
function safePct(a: number, b: number) { return b > 0 ? Math.round((a / b) * 100) : 0; }

// ── Status badge ───────────────────────────────────────────────────────────────

const FALLBACK_BADGE = { label: "Published", color: "#4ade80", bg: "rgba(74,222,128,0.12)", border: "rgba(74,222,128,0.3)" };
const BADGES: Record<string, typeof FALLBACK_BADGE> = {
  draft:                { label: "Draft",         color: "#6b7280", bg: "rgba(107,114,128,0.12)", border: "rgba(107,114,128,0.25)" },
  archived:             { label: "Archived",       color: "#6b7280", bg: "rgba(107,114,128,0.08)", border: "rgba(107,114,128,0.2)"  },
  registration_not_open:{ label: "Reg. Not Open", color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  border: "rgba(96,165,250,0.3)"   },
  registration_open:    { label: "Reg. Open",     color: "#4ade80", bg: "rgba(74,222,128,0.12)",  border: "rgba(74,222,128,0.3)"   },
  registration_closed:  { label: "Reg. Closed",   color: "#fbbf24", bg: "rgba(251,191,36,0.12)",  border: "rgba(251,191,36,0.3)"   },
  event_live:           { label: "Live Now",       color: "#a78bfa", bg: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.3)"  },
  completed:            { label: "Completed",      color: "#6b7280", bg: "rgba(107,114,128,0.12)", border: "rgba(107,114,128,0.25)" },
};

function getBadge(ev: EventOverview["event"]) {
  if (!ev) return FALLBACK_BADGE;
  if (ev.status === "draft" || ev.status === "archived") return BADGES[ev.status] ?? FALLBACK_BADGE;
  try {
    const lc = getLifecycle({ start_date: ev.start_date, start_time: ev.start_time, end_date: ev.end_date, end_time: ev.end_time, registration_closes_at: ev.registration_closes_at });
    return BADGES[lc.state] ?? FALLBACK_BADGE;
  } catch { return FALLBACK_BADGE; }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function EventStatCard({ label, value, color = "#fff", accent = false }: { label: string; value: string | number; color?: string; accent?: boolean }) {
  return (
    <div style={{ background: accent ? `${color}0d` : "#111", border: `1px solid ${accent ? `${color}22` : "rgba(255,255,255,0.07)"}`, borderRadius: 10, padding: "0.85rem 1rem" }}>
      <div style={{ fontSize: "1.4rem", fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 5, fontWeight: 700 }}>{label}</div>
    </div>
  );
}

function SecHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: ".08em" }}>{title}</div>
      {action}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function EventManagePage() {
  const { id: eventId } = useParams() as { id: string };

  const [data,    setData]    = useState<EventOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [tab,     setTab]     = useState<TabKey>("overview");

  const load = useCallback(async () => {
    if (!eventId) { setError("No event ID"); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/overview`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      const ev = json.event ?? null;
      if (!ev) throw new Error("Event not found");
      setData({
        event: ev,
        registrations: { total: 0, confirmed: 0, pending: 0, cancelled: 0, paid: 0, free: 0, checked_in: 0, active: 0, ...json.registrations },
        capacity:      { max: null, filled: 0, remaining: null, ...json.capacity },
        revenue:       { collected: 0, pending: 0, ...json.revenue },
        emails:        { campaigns: 0, confirmation_sent: 0, confirmation_failed: 0, campaign_delivered: 0, campaign_failed: 0, campaign_queued: 0, ...json.emails },
        races:         json.races         ?? [],
        recent_comms:  json.recent_comms  ?? [],
        waitlist:      json.waitlist       ?? { waiting: 0 },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { void load(); }, [load]);

  async function togglePublish() {
    if (!data?.event) return;
    const next = data.event.status === "published" ? "draft" : "published";
    await fetch("/api/admin/events", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: eventId, status: next }) });
    setData(d => d?.event ? { ...d, event: { ...d.event, status: next } } : d);
  }

  async function duplicateEvent() {
    const t = prompt("New event title:", `${data?.event?.title ?? ""} (Copy)`);
    if (t === null) return;
    const res = await fetch(`/api/admin/events/${eventId}/duplicate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ new_title: t || undefined, include_sponsors: confirm("Copy sponsors too?") }) });
    const d   = await res.json() as { event_id?: string; title?: string; error?: string };
    if (res.ok && d.event_id) { if (confirm(`✅ "${d.title}" created. Open it?`)) window.location.href = `/admin/events/${d.event_id}/manage`; }
    else alert(`❌ ${d.error ?? "Failed"}`);
  }

  async function saveAsTemplate() {
    if (!data?.event) return;
    const name = prompt("Template name:", `${data.event.title} Template`);
    if (!name) return;
    const res = await fetch("/api/admin/event-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: eventId, name: name.trim() }),
    });
    const d = await res.json() as { template?: { name: string }; error?: string };
    if (res.ok && d.template) alert(`✅ Template "${d.template.name}" saved!\nUse it in the New Event wizard to pre-fill settings.`);
    else alert(`❌ ${d.error ?? "Failed to save template"}`);
  }

  async function archiveEvent() {
    if (!data?.event) return;
    const isArch = data.event.status === "archived";
    if (!confirm(`${isArch ? "Restore" : "Archive"} this event?`)) return;
    const res = await fetch(`/api/admin/events/${eventId}/archive`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: isArch ? "restore" : "archive" }) });
    const d   = await res.json() as { status?: string; error?: string };
    if (res.ok && d.status) setData(o => o?.event ? { ...o, event: { ...o.event, status: d.status! } } : o);
    else alert(`❌ ${d.error}`);
  }

  // ── Announce tab state ───────────────────────────────────────────────────────

  const [annPreview,   setAnnPreview]   = useState<{ member_count: number; email_count: number; wa_count: number } | null>(null);
  const [annLoading,   setAnnLoading]   = useState(false);
  const [annChannels,  setAnnChannels]  = useState(["email", "whatsapp"]);
  const [annSubject,   setAnnSubject]   = useState("");
  const [annBody,      setAnnBody]      = useState("");
  const [annSending,   setAnnSending]   = useState(false);
  const [annResult,    setAnnResult]    = useState<{ email_queued: number; wa_total: number; batch_id: string } | null>(null);
  const [annError,     setAnnError]     = useState("");
  const [annDelivered,    setAnnDelivered]    = useState(0);
  const [annFailed,       setAnnFailed]       = useState(0);
  const [annPolling,      setAnnPolling]      = useState(false);
  const [annPollTotal,    setAnnPollTotal]    = useState(0);
  const [annTestEmail,    setAnnTestEmail]    = useState("");
  const [annTestSending,  setAnnTestSending]  = useState(false);
  const [annTestResult,   setAnnTestResult]   = useState<{ ok: boolean; msg: string } | null>(null);

  function defaultBody(_evTitle: string, _dateStr: string, timeStr: string, _location: string) {
    return `We're excited to announce an upcoming event!\n\n🏃 {event}\n📅 {date}${timeStr ? " at {time}" : ""}\n📍 {location}\n\nRegister now to secure your spot:\n{register_link}\n\nSee you there!\n\nTeam Connected Steps`;
  }

  async function loadAnnouncePreview() {
    setAnnLoading(true); setAnnError("");
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/announce`);
      const data = await res.json();
      if (!res.ok) { setAnnError(data.error ?? "Failed"); return; }
      setAnnPreview(data);
      if (!annSubject && data.event) {
        const d = data.event.start_date
          ? new Date(data.event.start_date + "T12:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
          : "";
        const t = data.event.start_time
          ? (() => { const [h, m] = data.event.start_time.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; })()
          : "";
        setAnnSubject(`Upcoming Event: ${data.event.title}${d ? ` — ${d}` : ""}`);
        setAnnBody(defaultBody(data.event.title, d, t, data.event.location));
      }
    } catch { setAnnError("Network error."); }
    finally { setAnnLoading(false); }
  }

  async function sendAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    if (!annChannels.length) { setAnnError("Select at least one channel."); return; }
    if (annChannels.includes("email") && (!annSubject.trim() || !annBody.trim())) {
      setAnnError("Subject and body are required."); return;
    }
    if (!confirm(`Send to ${annPreview?.member_count ?? "all"} active members via ${annChannels.join(" + ")}?`)) return;
    setAnnSending(true); setAnnError(""); setAnnResult(null); setAnnDelivered(0); setAnnFailed(0); setAnnTestResult(null);
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/announce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channels: annChannels, subject: annSubject, email_body: annBody }),
      });
      const data = await res.json();
      if (!res.ok) { setAnnError(data.error ?? "Send failed."); return; }
      setAnnResult(data);
      if (data.email_queued > 0) {
        setAnnPollTotal(data.email_queued);
        setAnnPolling(true);
      }
    } catch { setAnnError("Network error."); }
    finally { setAnnSending(false); }
  }

  // Status polling — updates delivered/failed counts every 3s
  useEffect(() => {
    if (!annPolling || !annResult?.batch_id) return;
    const batchId = annResult.batch_id;
    const iv = setInterval(async () => {
      try {
        const res  = await fetch(`/api/admin/events/${eventId}/communicate/status?batch_id=${batchId}`);
        const data = await res.json() as { queued: number; sending: number; delivered: number; failed: number };
        setAnnDelivered(data.delivered ?? 0);
        setAnnFailed(data.failed ?? 0);
        if (data.queued === 0 && data.sending === 0) setAnnPolling(false);
      } catch { /* non-critical */ }
    }, 3000);
    return () => clearInterval(iv);
  }, [annPolling, annResult?.batch_id, eventId]);

  // Send-next driver — processes one email every 1.1s so delivery doesn't
  // depend solely on after() which is killed by Vercel's function timeout.
  useEffect(() => {
    if (!annPolling || !annResult?.batch_id) return;
    const batchId = annResult.batch_id;
    let inFlight = false;
    const iv = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const res  = await fetch(`/api/admin/events/${eventId}/communicate/send-next`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batch_id: batchId }),
        });
        const data = await res.json() as { done?: boolean };
        if (data.done) setAnnPolling(false);
      } catch { /* retry on next tick */ }
      finally { inFlight = false; }
    }, 1100);
    return () => clearInterval(iv);
  }, [annPolling, annResult?.batch_id, eventId]);

  async function sendTestEmail() {
    const to = annTestEmail.trim();
    if (!to || !annSubject.trim() || !annBody.trim()) {
      setAnnError("Enter a test email address, subject, and body first."); return;
    }
    setAnnTestSending(true); setAnnTestResult(null); setAnnError("");
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/announce/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject: annSubject, email_body: annBody }),
      });
      const data = await res.json() as { ok?: boolean; message?: string; error?: string };
      setAnnTestResult({ ok: !!res.ok, msg: res.ok ? (data.message ?? `Sent to ${to}`) : (data.error ?? "Failed") });
    } catch { setAnnTestResult({ ok: false, msg: "Network error" }); }
    finally { setAnnTestSending(false); }
  }

  // ── Form Builder state ───────────────────────────────────────────────────────

  interface FieldCondition {
    field_key: string; operator: "equals" | "not_equals" | "contains" | "is_empty" | "is_not_empty"; value: string;
  }

  interface FormField {
    id: string; field_key: string; field_type: string; label: string;
    placeholder: string | null; help_text: string | null; required: boolean;
    options: string[]; display_order: number; is_active: boolean;
    conditions: FieldCondition[]; default_value: string | null;
    max_length: number | null; validation_pattern: string | null;
    editable_after_reg: boolean; section: string | null;
  }

  const [formFields,    setFormFields]    = useState<FormField[]>([]);
  const [formLoading,   setFormLoading]   = useState(false);
  const [formSaving,    setFormSaving]    = useState(false);
  const [formError,     setFormError]     = useState("");
  const [showAddField,  setShowAddField]  = useState(false);
  const [editingField,  setEditingField]  = useState<string | null>(null);
  const [newField, setNewField] = useState({
    label: "", field_type: "text", placeholder: "", help_text: "", required: false, options: "",
  });

  const loadFormFields = useCallback(async () => {
    setFormLoading(true); setFormError("");
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/form-fields`);
      const data = await res.json();
      if (!res.ok) { setFormError(data.error ?? "Failed"); return; }
      setFormFields(data.fields ?? []);
    } catch { setFormError("Network error"); }
    finally { setFormLoading(false); }
  }, [eventId]);

  useEffect(() => {
    if (tab === "form" && formFields.length === 0 && !formLoading) {
      void loadFormFields();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // ── Route Maps state ─────────────────────────────────────────────────────────

  interface RouteMap {
    id: string; event_id: string; race_id: string | null; name: string;
    file_url: string; file_type: "image" | "pdf" | "gpx";
    file_size: number | null; version: number; is_active: boolean;
    display_order: number; created_at: string;
  }

  const [routeMaps,        setRouteMaps]        = useState<RouteMap[]>([]);
  const [routeMapsLoading, setRouteMapsLoading] = useState(false);
  const [routeMapsError,   setRouteMapsError]   = useState("");
  const [routeMapUploading,setRouteMapUploading]= useState(false);
  const [routeMapName,     setRouteMapName]     = useState("");
  const [routeMapFile,     setRouteMapFile]     = useState<File | null>(null);
  const routeMapInputRef = useRef<HTMLInputElement>(null);

  const loadRouteMaps = useCallback(async () => {
    setRouteMapsLoading(true); setRouteMapsError("");
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/route-maps`);
      const data = await res.json();
      if (!res.ok) { setRouteMapsError(data.error ?? "Failed"); return; }
      setRouteMaps(data.route_maps ?? []);
    } catch { setRouteMapsError("Network error"); }
    finally { setRouteMapsLoading(false); }
  }, [eventId]);

  useEffect(() => {
    if (tab === "route-maps" && routeMaps.length === 0 && !routeMapsLoading) {
      void loadRouteMaps();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function uploadRouteMap() {
    if (!routeMapFile) { setRouteMapsError("Please select a file"); return; }
    const name = routeMapName.trim() || routeMapFile.name;
    setRouteMapUploading(true); setRouteMapsError("");
    try {
      // 1. Upload file
      const form = new FormData();
      form.append("file", routeMapFile);
      form.append("name", name);
      const upRes  = await fetch(`/api/admin/events/${eventId}/route-maps/upload`, { method: "POST", body: form });
      const upData = await upRes.json() as { url?: string; file_type?: string; file_size?: number; error?: string };
      if (!upRes.ok) { setRouteMapsError(upData.error ?? "Upload failed"); return; }
      // 2. Create row
      const rowRes  = await fetch(`/api/admin/events/${eventId}/route-maps`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, file_url: upData.url, file_type: upData.file_type, file_size: upData.file_size }),
      });
      if (!rowRes.ok) { const d = await rowRes.json(); setRouteMapsError(d.error ?? "Failed to save"); return; }
      setRouteMapFile(null); setRouteMapName("");
      if (routeMapInputRef.current) routeMapInputRef.current.value = "";
      await loadRouteMaps();
    } catch { setRouteMapsError("Network error"); }
    finally { setRouteMapUploading(false); }
  }

  async function toggleRouteMapActive(map: RouteMap) {
    await fetch(`/api/admin/events/${eventId}/route-maps`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: map.id, is_active: !map.is_active }),
    });
    await loadRouteMaps();
  }

  async function deleteRouteMap(id: string) {
    if (!confirm("Delete this route map?")) return;
    await fetch(`/api/admin/events/${eventId}/route-maps`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await loadRouteMaps();
  }

  async function moveRouteMap(id: string, dir: "up" | "down") {
    const idx = routeMaps.findIndex(m => m.id === id);
    if (idx < 0) return;
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= routeMaps.length) return;
    const a = routeMaps[idx]; const b = routeMaps[swapIdx];
    await Promise.all([
      fetch(`/api/admin/events/${eventId}/route-maps`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.id, display_order: b.display_order }) }),
      fetch(`/api/admin/events/${eventId}/route-maps`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id, display_order: a.display_order }) }),
    ]);
    await loadRouteMaps();
  }

  // ── Registration Config state ──────────────────────────────────────────────

  interface RegConfig {
    require_gender:            boolean;
    require_dob:               boolean;
    require_blood_group:       boolean;
    require_emergency_contact: boolean;
    show_notes:                boolean;
    notes_label:               string;
    notes_placeholder:         string;
    multi_step:                boolean;
  }

  const REG_DEFAULTS: RegConfig = {
    require_gender:            true,
    require_dob:               true,
    require_blood_group:       true,
    require_emergency_contact: true,
    show_notes:                true,
    notes_label:               "Notes",
    notes_placeholder:         "Medical conditions, dietary needs, or any questions. Enter NA if none.",
    multi_step:                false,
  };

  const [regConfig,        setRegConfig]        = useState<RegConfig>(REG_DEFAULTS);
  const [regConfigSaving,  setRegConfigSaving]  = useState(false);
  const [regConfigSaved,   setRegConfigSaved]   = useState(false);
  const [regConfigLoaded,  setRegConfigLoaded]  = useState(false);

  const [multiEnabled,     setMultiEnabled]     = useState(false);
  const [maxPerReg,        setMaxPerReg]        = useState(10);
  const [multiSaving,      setMultiSaving]      = useState(false);
  const [multiSaved,       setMultiSaved]       = useState(false);

  useEffect(() => {
    if (tab === "registration" && !regConfigLoaded && data) {
      const saved = data.event?.registration_config as Partial<RegConfig> | null | undefined;
      if (saved) setRegConfig({ ...REG_DEFAULTS, ...saved });
      setMultiEnabled(data.event?.allow_multi_participant ?? false);
      setMaxPerReg(data.event?.max_per_registration ?? 10);
      setRegConfigLoaded(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function saveRegConfig(patch: Partial<RegConfig>) {
    const next = { ...regConfig, ...patch };
    setRegConfig(next);
    setRegConfigSaving(true); setRegConfigSaved(false);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/edit`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { registration_config: next } }),
      });
      if (res.ok) { setRegConfigSaved(true); setTimeout(() => setRegConfigSaved(false), 2000); }
    } finally { setRegConfigSaving(false); }
  }

  async function saveMultiConfig(enabled: boolean, maxPer: number) {
    setMultiSaving(true); setMultiSaved(false);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/edit`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { allow_multi_participant: enabled, max_per_registration: Math.max(1, maxPer) } }),
      });
      if (res.ok) { setMultiSaved(true); setTimeout(() => setMultiSaved(false), 2000); }
    } finally { setMultiSaving(false); }
  }

  // ── Category Changes state ────────────────────────────────────────────────

  interface CatChangeRequest {
    id: string; registration_id: string; registration_code: string;
    participant_count: number; requested_by_email: string;
    old_category: string; new_category: string; reason: string | null;
    status: "pending" | "approved" | "rejected";
    reviewed_by: string | null; reviewed_at: string | null;
    admin_note: string | null; created_at: string;
  }

  const [catChanges,        setCatChanges]        = useState<CatChangeRequest[]>([]);
  const [catChangesLoading, setCatChangesLoading] = useState(false);
  const [catChangesError,   setCatChangesError]   = useState("");
  const [catChangesFilter,  setCatChangesFilter]  = useState<"pending" | "all">("pending");

  const loadCatChanges = useCallback(async () => {
    setCatChangesLoading(true); setCatChangesError("");
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/category-changes`);
      const data = await res.json() as { requests?: CatChangeRequest[]; error?: string };
      if (!res.ok) { setCatChangesError(data.error ?? "Failed"); return; }
      setCatChanges(data.requests ?? []);
    } catch { setCatChangesError("Network error"); }
    finally { setCatChangesLoading(false); }
  }, [eventId]);

  useEffect(() => {
    if (tab === "cat-changes") void loadCatChanges();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function resolveCatChange(requestId: string, action: "approve" | "reject", adminNote?: string) {
    const res = await fetch(`/api/admin/events/${eventId}/category-changes`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request_id: requestId, action, admin_note: adminNote }),
    });
    if (!res.ok) {
      const d = await res.json() as { error?: string };
      setCatChangesError(d.error ?? "Failed");
      return;
    }
    await loadCatChanges();
  }

  // ── Waitlist state ────────────────────────────────────────────────────────

  interface WaitlistEntry {
    id: string; position: number | null; user_name: string; user_email: string;
    phone: string | null; distance_category: string | null; status: string;
    notes: string | null; approved_at: string | null; notified_at: string | null;
    created_at: string;
  }

  const [waitlist,        setWaitlist]        = useState<WaitlistEntry[]>([]);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [waitlistError,   setWaitlistError]   = useState("");
  const [wlCatFilter,     setWlCatFilter]     = useState("all");
  const [wlStatusFilter,  setWlStatusFilter]  = useState<"waiting" | "approved" | "all">("waiting");
  const [wlActing,        setWlActing]        = useState<string | null>(null);
  const [expiring,        setExpiring]        = useState(false);
  const [expireMsg,       setExpireMsg]       = useState("");

  const loadWaitlist = useCallback(async () => {
    setWaitlistLoading(true); setWaitlistError("");
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/waitlist`);
      const data = await res.json() as { waitlist?: WaitlistEntry[]; error?: string };
      if (!res.ok) { setWaitlistError(data.error ?? "Failed"); return; }
      setWaitlist(data.waitlist ?? []);
    } catch { setWaitlistError("Network error"); }
    finally { setWaitlistLoading(false); }
  }, [eventId]);

  useEffect(() => {
    if (tab === "waitlist") void loadWaitlist();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function expireStaleSlots() {
    if (!confirm("Expire stale pending_payment registrations? This frees up slots for waitlisted users.")) return;
    setExpiring(true); setExpireMsg("");
    try {
      const r = await fetch(`/api/admin/events/${eventId}/expire-stale`, { method: "POST" });
      const d = await r.json() as { message?: string; error?: string };
      setExpireMsg(d.message ?? d.error ?? "Done");
    } catch { setExpireMsg("Network error"); }
    finally { setExpiring(false); }
  }

  async function waitlistAction(entryId: string, action: "approve" | "reject" | "delete") {
    setWlActing(entryId); setWaitlistError("");
    try {
      if (action === "delete") {
        const r = await fetch(`/api/admin/events/${eventId}/waitlist`, {
          method: "DELETE", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ waitlist_id: entryId }),
        });
        if (!r.ok) { setWaitlistError("Delete failed"); return; }
        setWaitlist(w => w.filter(e => e.id !== entryId));
      } else {
        const r = await fetch(`/api/admin/events/${eventId}/waitlist`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ waitlist_id: entryId, action }),
        });
        const d = await r.json() as { success?: boolean; status?: string; error?: string };
        if (!r.ok) { setWaitlistError(d.error ?? "Failed"); return; }
        setWaitlist(w => w.map(e => e.id === entryId ? { ...e, status: d.status ?? e.status, approved_at: action === "approve" ? new Date().toISOString() : e.approved_at } : e));
      }
    } catch { setWaitlistError("Network error"); }
    finally { setWlActing(null); }
  }

  // ── Version History state ─────────────────────────────────────────────────

  interface EventVersion {
    id: string; version_number: number; label: string | null;
    created_by: string | null; created_at: string;
    title?: string; status?: string;
  }

  const [versions,        setVersions]        = useState<EventVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError,   setVersionsError]   = useState("");
  const [versionSaving,   setVersionSaving]   = useState(false);
  const [versionLabel,    setVersionLabel]     = useState("");
  const [restoring,       setRestoring]        = useState<string | null>(null);

  const loadVersions = useCallback(async () => {
    setVersionsLoading(true); setVersionsError("");
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/versions`);
      const data = await res.json();
      if (!res.ok) { setVersionsError(data.error ?? "Failed"); return; }
      setVersions(data.versions ?? []);
    } catch { setVersionsError("Network error"); }
    finally { setVersionsLoading(false); }
  }, [eventId]);

  useEffect(() => {
    if (tab === "versions" && versions.length === 0 && !versionsLoading) {
      void loadVersions();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function saveVersionCheckpoint() {
    setVersionSaving(true); setVersionsError("");
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/versions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: versionLabel.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setVersionsError(data.error ?? "Failed"); return; }
      setVersionLabel("");
      setVersions(vs => [data.version as EventVersion, ...vs]);
    } catch { setVersionsError("Network error"); }
    finally { setVersionSaving(false); }
  }

  async function restoreVersion(versionId: string, versionNum: number) {
    if (!confirm(`Restore event to version ${versionNum}? Current changes will be overwritten. Registrations are never affected.`)) return;
    setRestoring(versionId); setVersionsError("");
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/versions/${versionId}/restore`, { method: "POST" });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) { setVersionsError(data.error ?? "Restore failed"); return; }
      alert(`✅ Restored to version ${versionNum}. Refresh the page to see the updated event.`);
      void load();
    } catch { setVersionsError("Network error"); }
    finally { setRestoring(null); }
  }

  // ── Registration Steps state ─────────────────────────────────────────────

  interface RegStep {
    id: string; step_key: string; label: string; description: string | null;
    display_order: number; is_visible: boolean; is_required: boolean;
    step_type: string; icon: string | null; field_scope: string[];
  }

  const [regSteps,        setRegSteps]        = useState<RegStep[]>([]);
  const [stepsLoading,    setStepsLoading]    = useState(false);
  const [stepsError,      setStepsError]      = useState("");
  const [stepSaving,      setStepSaving]      = useState(false);
  const [newStepLabel,    setNewStepLabel]    = useState("");
  const [newStepType,     setNewStepType]     = useState("standard");
  const [editingStep,     setEditingStep]     = useState<string | null>(null);
  const [editingStepData, setEditingStepData] = useState<Partial<RegStep> | null>(null);

  const loadRegSteps = useCallback(async () => {
    setStepsLoading(true); setStepsError("");
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/registration-steps`);
      const data = await res.json();
      if (!res.ok) { setStepsError(data.error ?? "Failed"); return; }
      setRegSteps(data.steps ?? []);
    } catch { setStepsError("Network error"); }
    finally { setStepsLoading(false); }
  }, [eventId]);

  useEffect(() => {
    if (tab === "steps" && regSteps.length === 0 && !stepsLoading) void loadRegSteps();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function addRegStep() {
    if (!newStepLabel.trim()) return;
    setStepSaving(true); setStepsError("");
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/registration-steps`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newStepLabel.trim(), step_type: newStepType }),
      });
      const data = await res.json();
      if (!res.ok) { setStepsError(data.error ?? "Failed"); return; }
      setRegSteps(s => [...s, data.step as RegStep]);
      setNewStepLabel("");
    } catch { setStepsError("Network error"); }
    finally { setStepSaving(false); }
  }

  async function saveStepEdit() {
    if (!editingStep || !editingStepData) return;
    setStepSaving(true); setStepsError("");
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/registration-steps`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingStep, ...editingStepData }),
      });
      const data = await res.json();
      if (!res.ok) { setStepsError(data.error ?? "Failed"); return; }
      setRegSteps(s => s.map(x => x.id === editingStep ? { ...x, ...(data.step as RegStep) } : x));
      setEditingStep(null); setEditingStepData(null);
    } catch { setStepsError("Network error"); }
    finally { setStepSaving(false); }
  }

  async function deleteRegStep(id: string, label: string) {
    if (!confirm(`Delete step "${label}"?`)) return;
    const res  = await fetch(`/api/admin/events/${eventId}/registration-steps`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setRegSteps(s => s.filter(x => x.id !== id));
    else setStepsError("Delete failed");
  }

  // ── Pricing Rules state ───────────────────────────────────────────────────

  interface PricingRule {
    id: string; rule_type: string; label: string; description: string | null;
    discount_type: string; discount_value: number;
    min_participants: number | null; max_uses: number | null; uses_count: number;
    valid_from: string | null; valid_until: string | null;
    is_active: boolean; created_at: string;
  }

  const [pricingRules,     setPricingRules]    = useState<PricingRule[]>([]);
  const [pricingLoading,   setPricingLoading]  = useState(false);
  const [pricingError,     setPricingError]    = useState("");
  const [pricingSaving,    setPricingSaving]   = useState(false);
  const [newRule,          setNewRule]         = useState({ label: "", rule_type: "group", discount_type: "flat", discount_value: "0", min_participants: "", max_uses: "" });
  type EditingRuleForm = Omit<Partial<PricingRule>, "discount_value"> & { discount_value: string };
  const [editingRule,      setEditingRule]     = useState<string | null>(null);
  const [editingRuleData,  setEditingRuleData] = useState<EditingRuleForm>({ label: "", rule_type: "group", discount_type: "flat", discount_value: "0" });

  const loadPricingRules = useCallback(async () => {
    setPricingLoading(true); setPricingError("");
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/pricing-rules`);
      const data = await res.json();
      if (!res.ok) { setPricingError(data.error ?? "Failed"); return; }
      setPricingRules(data.rules ?? []);
    } catch { setPricingError("Network error"); }
    finally { setPricingLoading(false); }
  }, [eventId]);

  useEffect(() => {
    if (tab === "pricing" && pricingRules.length === 0 && !pricingLoading) void loadPricingRules();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function addPricingRule() {
    if (!newRule.label.trim()) return;
    setPricingSaving(true); setPricingError("");
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/pricing-rules`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label:           newRule.label.trim(),
          rule_type:       newRule.rule_type,
          discount_type:   newRule.discount_type,
          discount_value:  Number(newRule.discount_value) || 0,
          min_participants:newRule.min_participants ? Number(newRule.min_participants) : null,
          max_uses:        newRule.max_uses         ? Number(newRule.max_uses)         : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setPricingError(data.error ?? "Failed"); return; }
      setPricingRules(r => [...r, data.rule as PricingRule]);
      setNewRule({ label: "", rule_type: "group", discount_type: "flat", discount_value: "0", min_participants: "", max_uses: "" });
    } catch { setPricingError("Network error"); }
    finally { setPricingSaving(false); }
  }

  async function savePricingEdit() {
    if (!editingRule) return;
    setPricingSaving(true); setPricingError("");
    try {
      const payload = { id: editingRule, ...editingRuleData, discount_value: Number(editingRuleData.discount_value) || 0 };
      const res  = await fetch(`/api/admin/events/${eventId}/pricing-rules`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setPricingError(data.error ?? "Failed"); return; }
      setPricingRules(r => r.map(x => x.id === editingRule ? { ...x, ...(data.rule as PricingRule) } : x));
      setEditingRule(null);
    } catch { setPricingError("Network error"); }
    finally { setPricingSaving(false); }
  }

  async function deletePricingRule(id: string, label: string) {
    if (!confirm(`Delete pricing rule "${label}"?`)) return;
    const res  = await fetch(`/api/admin/events/${eventId}/pricing-rules`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setPricingRules(r => r.filter(x => x.id !== id));
    else setPricingError("Delete failed");
  }

  // ── Landing page builder state ───────────────────────────────────────────

  interface LpHighlight { icon: string; title: string; description: string }
  interface LpFaq       { question: string; answer: string }

  const [lpLoaded,          setLpLoaded]          = useState(false);
  const [lpLoading,         setLpLoading]         = useState(false);
  const [lpError,           setLpError]           = useState("");
  const [lpSaving,          setLpSaving]          = useState(false);
  const [lpSavedSection,    setLpSavedSection]    = useState<string | null>(null);
  const [lpCoverUrl,        setLpCoverUrl]        = useState("");
  const [lpBannerUrl,       setLpBannerUrl]       = useState("");
  const [lpCoverUpl,        setLpCoverUpl]        = useState(false);
  const [lpBannerUpl,       setLpBannerUpl]       = useState(false);
  const [lpHighlights,      setLpHighlights]      = useState<LpHighlight[]>([]);
  const [lpHlEdit,          setLpHlEdit]          = useState<number | null>(null);
  const [lpHlForm,          setLpHlForm]          = useState<LpHighlight>({ icon: "", title: "", description: "" });
  const [lpGallery,         setLpGallery]         = useState<string[]>([]);
  const [lpGalleryUpl,      setLpGalleryUpl]      = useState(false);
  const [lpFaqs,            setLpFaqs]            = useState<LpFaq[]>([]);
  const [lpFaqEdit,         setLpFaqEdit]         = useState<number | null>(null);
  const [lpFaqForm,         setLpFaqForm]         = useState<LpFaq>({ question: "", answer: "" });
  const [lpTerms,           setLpTerms]           = useState("");
  const [lpWa,              setLpWa]              = useState("");
  const lpCoverRef   = useRef<HTMLInputElement>(null);
  const lpBannerRef  = useRef<HTMLInputElement>(null);
  const lpGalleryRef = useRef<HTMLInputElement>(null);

  // ── Form field inline-edit state ──────────────────────────────────────────

  const [editingFieldData, setEditingFieldData] = useState<{
    id: string; label: string; field_type: string; placeholder: string;
    help_text: string; required: boolean; options: string; is_active: boolean;
    default_value: string; max_length: string; validation_pattern: string;
    editable_after_reg: boolean; section: string;
    conditions: FieldCondition[];
  } | null>(null);

  function startEditField(field: FormField) {
    setEditingField(field.id);
    setEditingFieldData({
      id:                 field.id,
      label:              field.label,
      field_type:         field.field_type,
      placeholder:        field.placeholder        ?? "",
      help_text:          field.help_text          ?? "",
      required:           field.required,
      options:            field.options?.join(", ") ?? "",
      is_active:          field.is_active,
      default_value:      field.default_value      ?? "",
      max_length:         field.max_length          != null ? String(field.max_length) : "",
      validation_pattern: field.validation_pattern  ?? "",
      editable_after_reg: field.editable_after_reg  ?? true,
      section:            field.section             ?? "",
      conditions:         field.conditions          ?? [],
    });
  }

  async function saveFieldEdit() {
    if (!editingFieldData) return;
    setFormSaving(true); setFormError("");
    try {
      const opts = editingFieldData.options.split(",").map(s => s.trim()).filter(Boolean);
      const res  = await fetch(`/api/admin/events/${eventId}/form-fields`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id:                 editingFieldData.id,
          label:              editingFieldData.label,
          field_type:         editingFieldData.field_type,
          placeholder:        editingFieldData.placeholder  || null,
          help_text:          editingFieldData.help_text    || null,
          required:           editingFieldData.required,
          is_active:          editingFieldData.is_active,
          options:            opts,
          default_value:      editingFieldData.default_value      || null,
          max_length:         editingFieldData.max_length ? Number(editingFieldData.max_length) : null,
          validation_pattern: editingFieldData.validation_pattern  || null,
          editable_after_reg: editingFieldData.editable_after_reg,
          section:            editingFieldData.section              || null,
          conditions:         editingFieldData.conditions,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error ?? "Failed"); return; }
      setFormFields(fs => fs.map(f => f.id === editingFieldData.id ? (data.field as FormField) : f));
      setEditingField(null);
      setEditingFieldData(null);
    } catch { setFormError("Network error"); }
    finally { setFormSaving(false); }
  }

  async function saveNewField() {
    if (!newField.label.trim()) { setFormError("Label is required"); return; }
    setFormSaving(true); setFormError("");
    try {
      const opts = newField.options.split(",").map(s => s.trim()).filter(Boolean);
      const res  = await fetch(`/api/admin/events/${eventId}/form-fields`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newField, options: opts }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error ?? "Failed"); return; }
      setFormFields(f => [...f, data.field as FormField]);
      setNewField({ label: "", field_type: "text", placeholder: "", help_text: "", required: false, options: "" });
      setShowAddField(false);
    } catch { setFormError("Network error"); }
    finally { setFormSaving(false); }
  }

  async function deleteField(id: string) {
    if (!confirm("Delete this field? Existing responses will remain in registration records.")) return;
    const res = await fetch(`/api/admin/events/${eventId}/form-fields`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setFormFields(f => f.filter(x => x.id !== id));
    else { const d = await res.json(); setFormError(d.error ?? "Failed"); }
  }

  async function toggleFieldActive(field: FormField) {
    const res = await fetch(`/api/admin/events/${eventId}/form-fields`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: field.id, is_active: !field.is_active }),
    });
    if (res.ok) setFormFields(f => f.map(x => x.id === field.id ? { ...x, is_active: !x.is_active } : x));
  }

  async function moveField(id: string, direction: "up" | "down") {
    const idx  = formFields.findIndex(f => f.id === id);
    if (idx < 0) return;
    if (direction === "up"   && idx === 0)                    return;
    if (direction === "down" && idx === formFields.length - 1) return;
    const next = [...formFields];
    const swap = direction === "up" ? idx - 1 : idx + 1;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setFormFields(next);
    await fetch(`/api/admin/events/${eventId}/form-fields/reorder`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: next.map(f => f.id) }),
    });
  }

  // ── Landing page functions ───────────────────────────────────────────────

  const loadLanding = useCallback(async () => {
    setLpLoading(true); setLpError("");
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/edit`);
      const d    = await res.json();
      if (!res.ok) { setLpError(d.error ?? "Failed to load"); return; }
      const lev  = d.event;
      setLpCoverUrl( lev.cover_image            ?? "");
      setLpBannerUrl(lev.banner_image           ?? "");
      setLpHighlights(Array.isArray(lev.highlights)     ? lev.highlights     : []);
      setLpGallery(   Array.isArray(lev.gallery_images)  ? lev.gallery_images  : []);
      setLpFaqs(      Array.isArray(lev.faqs)            ? lev.faqs            : []);
      setLpTerms(lev.terms_conditions           ?? "");
      setLpWa(   lev.whatsapp_community_url     ?? "");
      setLpLoaded(true);
    } catch { setLpError("Network error"); }
    finally { setLpLoading(false); }
  }, [eventId]);

  useEffect(() => {
    if (tab === "landing" && !lpLoaded && !lpLoading) void loadLanding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function saveLpFields(fields: Record<string, unknown>, section: string) {
    setLpSaving(true); setLpError(""); setLpSavedSection(null);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/edit`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      const d = await res.json();
      if (!res.ok) { setLpError(d.error ?? "Save failed"); return; }
      setLpSavedSection(section);
      setTimeout(() => setLpSavedSection(null), 2500);
    } catch { setLpError("Network error"); }
    finally { setLpSaving(false); }
  }

  async function uploadLpImage(file: File, purpose: string): Promise<string | null> {
    const form = new FormData();
    form.append("file", file);
    form.append("purpose", purpose);
    const res = await fetch(`/api/admin/events/${eventId}/upload`, { method: "POST", body: form });
    const d   = await res.json();
    if (!res.ok) { setLpError(d.error ?? "Upload failed"); return null; }
    return d.url as string;
  }

  async function handleLpCoverUpload(file: File) {
    setLpCoverUpl(true); setLpError("");
    const url = await uploadLpImage(file, "poster");
    if (url) { setLpCoverUrl(url); await saveLpFields({ cover_image: url }, "cover"); }
    setLpCoverUpl(false);
  }

  async function handleLpBannerUpload(file: File) {
    setLpBannerUpl(true); setLpError("");
    const url = await uploadLpImage(file, "banner");
    if (url) { setLpBannerUrl(url); await saveLpFields({ banner_image: url }, "banner"); }
    setLpBannerUpl(false);
  }

  async function handleLpGalleryUpload(file: File) {
    setLpGalleryUpl(true); setLpError("");
    const url = await uploadLpImage(file, "gallery");
    if (url) {
      const next = [...lpGallery, url];
      setLpGallery(next);
      await saveLpFields({ gallery_images: next }, "gallery");
    }
    setLpGalleryUpl(false);
  }

  function removeLpGalleryImage(idx: number) {
    const next = lpGallery.filter((_, i) => i !== idx);
    setLpGallery(next);
    void saveLpFields({ gallery_images: next }, "gallery");
  }

  function saveHighlight() {
    if (!lpHlForm.title.trim()) return;
    const next = lpHlEdit !== null && lpHlEdit >= 0
      ? lpHighlights.map((h, i) => i === lpHlEdit ? lpHlForm : h)
      : [...lpHighlights, lpHlForm];
    setLpHighlights(next);
    setLpHlEdit(null);
    setLpHlForm({ icon: "", title: "", description: "" });
    void saveLpFields({ highlights: next }, "highlights");
  }

  function removeHighlight(idx: number) {
    const next = lpHighlights.filter((_, i) => i !== idx);
    setLpHighlights(next);
    void saveLpFields({ highlights: next }, "highlights");
  }

  function saveFaq() {
    if (!lpFaqForm.question.trim()) return;
    const next = lpFaqEdit !== null && lpFaqEdit >= 0
      ? lpFaqs.map((f, i) => i === lpFaqEdit ? lpFaqForm : f)
      : [...lpFaqs, lpFaqForm];
    setLpFaqs(next);
    setLpFaqEdit(null);
    setLpFaqForm({ question: "", answer: "" });
    void saveLpFields({ faqs: next }, "faqs");
  }

  function removeFaq(idx: number) {
    const next = lpFaqs.filter((_, i) => i !== idx);
    setLpFaqs(next);
    void saveLpFields({ faqs: next }, "faqs");
  }

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (loading) return <div style={{ padding: "3rem 2rem", textAlign: "center" }}><Spinner /></div>;

  if (error || !data?.event) return (
    <div style={{ padding: "3rem 2rem", textAlign: "center" }}>
      <Alert variant="error" style={{ marginBottom: 12 }}>{error || "Event not found"}</Alert>
      <Link href="/admin/events" style={{ color: "#e8620a", fontSize: 13, textDecoration: "none" }}>← All Events</Link>
      <div style={{ marginTop: 12 }}>
        <Button size="sm" variant="secondary" onClick={load}>Retry</Button>
      </div>
    </div>
  );

  const ev    = data.event;
  const reg   = data.registrations;
  const cap   = data.capacity;
  const rev   = data.revenue;
  const emails= data.emails;
  const races = data.races;
  const wl    = data.waitlist;
  const badge = getBadge(ev);
  const isPub = ev.status === "published";
  const capPct= cap.max && cap.max > 0 ? safePct(cap.filled, cap.max) : 0;

  // ── Layout ───────────────────────────────────────────────────────────────────
  // KEY DESIGN DECISION:
  // The admin layout (app/admin/layout.tsx) already provides:
  //   - A fixed sidebar (228px or 58px)
  //   - A sticky desktop topbar (52px, zIndex: 30)
  //   - marginLeft on cs-main
  //
  // The Event Hub must NOT add:
  //   - Another minHeight: 100vh wrapper (causes blank space)
  //   - overflowY: auto on main (creates nested scroll container)
  //   - position: sticky at top: 0 (conflicts with admin topbar at top: 0)
  //
  // Instead: render a flat two-column layout, let the PAGE body scroll,
  // sticky elements use top: 52px to dock below the admin topbar.

  return (
    <div style={{ display: "flex", background: "#0a0a0a", color: "#fff" }}>

      {/* ── Event-specific sidebar ────────────────────────────────────────── */}
      {/* sticky top:52px = docks below the 52px admin desktop topbar */}
      <aside style={{
        width: 200, flexShrink: 0,
        background: "#0d0d0d",
        borderRight: "1px solid rgba(255,255,255,0.06)",
        position: "sticky",
        top: 52,                            // admin topbar height
        height: "calc(100vh - 52px)",       // fill remaining viewport below topbar
        overflowY: "auto",
        display: "flex", flexDirection: "column",
      }}>
        {/* Event info */}
        <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#fff", lineHeight: 1.3, marginBottom: 4 }}>{ev.title}</div>
          <div style={{ fontSize: 10, color: "#555" }}>{ev.start_date ? fmtDate(ev.start_date) : ""}</div>
          {(ev.distance_categories?.length ?? 0) > 0 && (
            <div style={{ fontSize: 10, color: "#e8620a", marginTop: 3 }}>{ev.distance_categories!.join(" · ")}</div>
          )}
          <div style={{ marginTop: 8 }}>
            <Badge size="sm" style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>{badge.label}</Badge>
          </div>
        </div>

        {/* Nav items */}
        <nav style={{ padding: "6px 8px", flex: 1 }}>
          {NAV_ITEMS.map(item => {
            const active = item.inline && tab === item.key;
            const href   = "href" in item ? `/admin/events/${eventId}/${item.href}` : null;
            const s: React.CSSProperties = {
              display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
              borderRadius: 7, marginBottom: 1, fontSize: 12,
              fontWeight: active ? 700 : 400, color: active ? "#fff" : "#777",
              background: active ? "rgba(232,98,10,0.12)" : "transparent",
              border: active ? "1px solid rgba(232,98,10,0.2)" : "1px solid transparent",
              cursor: "pointer", textDecoration: "none", fontFamily: "inherit", width: "100%",
            };
            if (href) return <Link key={item.key} href={href} style={s}><span>{item.icon}</span>{item.label}</Link>;
            return <button key={item.key} onClick={() => setTab(item.key as TabKey)} style={s}><span>{item.icon}</span>{item.label}</button>;
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: "8px 14px", borderTop: "1px solid rgba(255,255,255,0.05)", flexShrink: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <Button size="xs" variant="ghost" onClick={load}>↻ Refresh</Button>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Event sub-header — sticky at 52px, below admin topbar */}
        <div style={{
          position: "sticky",
          top: 52,
          zIndex: 20,                        // below admin topbar zIndex:30
          background: "rgba(10,10,10,0.98)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          height: 48,
          display: "flex", alignItems: "center", padding: "0 1.25rem", gap: 10, flexShrink: 0,
        }}>
          <Link href="/admin/events" style={{ color: "#555", fontSize: 12, textDecoration: "none", flexShrink: 0 }}>← Events</Link>
          <span style={{ color: "#222" }}>/</span>
          <span style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{ev.title}</span>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {ev.share_slug && (
              <Link href={`/events/${ev.share_slug}`} target="_blank">
                <Button size="xs" variant="ghost">Preview ↗</Button>
              </Link>
            )}
            <Link href={`/admin/events/${eventId}/edit`}>
              <Button size="xs" variant="secondary">Edit</Button>
            </Link>
            <Button size="xs" variant={isPub ? "danger" : "primary"} onClick={togglePublish}>
              {isPub ? "Unpublish" : "Publish"}
            </Button>
          </div>
        </div>

        {/* Tab content — plain block, page scrolls naturally */}
        <div style={{ padding: "1.25rem 1.5rem" }}>

          {/* ── OVERVIEW ─────────────────────────────────────────────────── */}
          {tab === "overview" && (
            <div style={{ maxWidth: 900 }}>

              <SectionBoundary title="Participants">
                <div style={{ marginBottom: 18 }}>
                  <SecHead title="Participants" action={
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button onClick={load} title="Refresh" style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 14, padding: "2px 4px" }}>↻</button>
                      <Link href={`/admin/events/${eventId}/registrations`} style={{ fontSize: 11, color: "#e8620a", textDecoration: "none", fontWeight: 600 }}>View all →</Link>
                    </div>
                  } />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 10 }}>
                    <EventStatCard label="Total"      value={fmt(reg.total)}      />
                    <EventStatCard label="Confirmed"  value={fmt(reg.confirmed)}  color="#4ade80" accent />
                    <EventStatCard label="Paid"       value={fmt(reg.paid)}       color="#4ade80" />
                    <EventStatCard label="Free"       value={fmt(reg.free)}       color="#60a5fa" />
                    <EventStatCard label="Pending"    value={fmt(reg.pending)}    color={reg.pending > 0 ? "#fbbf24" : "#555"} accent={reg.pending > 0} />
                    <EventStatCard label="Checked In" value={fmt(reg.checked_in)} color="#a78bfa" accent />
                    <EventStatCard label="Cancelled"  value={fmt(reg.cancelled)}  color={reg.cancelled > 0 ? "#f87171" : "#555"} />
                    {wl.waiting > 0 && (
                      <button onClick={() => setTab("waitlist")} style={{ all: "unset", cursor: "pointer" }}>
                        <EventStatCard label="Waitlisted" value={fmt(wl.waiting)} color="#fbbf24" accent />
                      </button>
                    )}
                  </div>
                </div>
              </SectionBoundary>

              {cap.max !== null && (
                <SectionBoundary title="Capacity">
                  <div style={{ marginBottom: 18 }}>
                    <SecHead title="Capacity" />
                    <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "1rem 1.25rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <div>
                          <span style={{ fontSize: 24, fontWeight: 800, color: capPct >= 90 ? "#f87171" : "#fff" }}>{fmt(cap.filled)}</span>
                          <span style={{ fontSize: 12, color: "#555", marginLeft: 4 }}>/ {fmt(cap.max!)}</span>
                        </div>
                        <span style={{ fontSize: 17, fontWeight: 700, color: capPct >= 90 ? "#f87171" : "#4ade80" }}>{capPct}%</span>
                      </div>
                      <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.min(capPct, 100)}%`, background: capPct >= 90 ? "#f87171" : capPct >= 70 ? "#fbbf24" : "#e8620a", borderRadius: 3 }} />
                      </div>
                      <div style={{ marginTop: 6, fontSize: 12, color: "#555" }}>
                        <span style={{ color: "#4ade80", fontWeight: 700 }}>{fmt(cap.remaining ?? 0)}</span> remaining
                        {capPct >= 90 && <span style={{ color: "#f87171", fontWeight: 600, marginLeft: 12 }}>⚠ Almost full</span>}
                      </div>
                    </div>
                  </div>
                </SectionBoundary>
              )}

              <SectionBoundary title="Revenue">
                <div style={{ marginBottom: 18 }}>
                  <SecHead title="Revenue" />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <EventStatCard label="Collected" value={fmtInr(rev.collected)} color="#e8620a" accent />
                    <EventStatCard label="Pending"   value={fmtInr(rev.pending)}   color={rev.pending > 0 ? "#fbbf24" : "#555"} accent={rev.pending > 0} />
                  </div>
                </div>
              </SectionBoundary>

              <SectionBoundary title="Communication">
                <div style={{ marginBottom: 18 }}>
                  <SecHead title="Communication" action={
                    <Link href={`/admin/events/${eventId}/communicate`} style={{ fontSize: 11, color: "#e8620a", textDecoration: "none", fontWeight: 600 }}>Open Hub →</Link>
                  } />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 10, marginBottom: 10 }}>
                    <EventStatCard label="Campaigns"   value={fmt(emails.campaigns)}             />
                    <EventStatCard label="Confirm. ✓"  value={fmt(emails.confirmation_sent)}   color="#4ade80" accent={emails.confirmation_sent > 0} />
                    <EventStatCard label="Confirm. ✗"  value={fmt(emails.confirmation_failed)} color={emails.confirmation_failed > 0 ? "#f87171" : "#555"} />
                    <EventStatCard label="Bulk Sent"   value={fmt(emails.campaign_delivered)}  color="#4ade80" accent={emails.campaign_delivered > 0} />
                  </div>
                  {data.recent_comms.length > 0 && (
                    <div style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, overflow: "hidden" }}>
                      {data.recent_comms.slice(0, 3).map((c, i) => (
                        <div key={i} style={{ display: "flex", gap: 12, padding: "8px 12px", borderBottom: i < 2 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{c.subject}</div>
                            <div style={{ fontSize: 10, color: "#555" }}>
                              {new Date(c.sent_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {c.recipients ?? 0}
                            </div>
                          </div>
                          <span style={{ fontSize: 11, color: "#4ade80", flexShrink: 0 }}>✓ {c.sent ?? 0}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </SectionBoundary>

              <SectionBoundary title="Event Timeline">
                <div style={{ marginBottom: 18 }}>
                  <SecHead title="Event Status Timeline" />
                  {(() => {
                    const now   = new Date();
                    const toDate = (d: string | null | undefined) => {
                      if (!d) return null;
                      try { return new Date(d.includes("T") ? d : d + "T12:00:00"); } catch { return null; }
                    };
                    const regCloses = toDate(ev.registration_closes_at);
                    const evStart   = toDate(ev.start_date);
                    const evEnd     = toDate(ev.end_date ?? ev.start_date);

                    const steps = [
                      { key: "created",   label: "Created",           done: true,                                                                                                          desc: ev.status === "draft" ? "Draft" : "Saved" },
                      { key: "published", label: "Published",         done: ev.status !== "draft" && ev.status !== "archived",                                                             desc: ev.status === "draft" ? "Not yet" : ev.status === "archived" ? "Archived" : "Live" },
                      { key: "reg_open",  label: "Registrations",     done: !!(regCloses && now > regCloses) || ev.status === "completed",                                                 desc: regCloses ? (now < regCloses ? regCloses.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "Closed") : "Open" },
                      { key: "event",     label: "Event Day",         done: !!(evStart && now > evStart),                                                                                  desc: evStart ? evStart.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) : "Not set" },
                      { key: "completed", label: "Completed",         done: ev.status === "completed" || !!(evEnd && now > evEnd && now.getTime() - evEnd.getTime() > 86_400_000),         desc: ev.status === "completed" ? "Done" : "After event" },
                    ];
                    const activeIdx = steps.reduce((acc, s, i) => s.done ? i : acc, -1);
                    return (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 0, overflowX: "auto", paddingBottom: 4 }}>
                        {steps.map((step, i) => (
                          <div key={step.key} style={{ display: "flex", alignItems: "flex-start", flex: 1, minWidth: 70 }}>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                              <div style={{ width: 26, height: 26, borderRadius: "50%", border: `2px solid ${step.done ? "#e8620a" : i === activeIdx + 1 ? "rgba(232,98,10,0.4)" : "rgba(255,255,255,0.1)"}`, background: step.done ? "#e8620a" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: step.done ? "#fff" : "#555", flexShrink: 0, zIndex: 1 }}>
                                {step.done ? "✓" : i + 1}
                              </div>
                              <div style={{ fontSize: 10, fontWeight: step.done ? 700 : 400, color: step.done ? "#e8620a" : i === activeIdx + 1 ? "#ccc" : "#555", textAlign: "center" as const, marginTop: 4, lineHeight: 1.3 }}>{step.label}</div>
                              <div style={{ fontSize: 9, color: "#444", textAlign: "center" as const, marginTop: 2, lineHeight: 1.3, maxWidth: 72 }}>{step.desc}</div>
                            </div>
                            {i < steps.length - 1 && <div style={{ height: 2, flex: 1, background: step.done ? "#e8620a" : "rgba(255,255,255,0.08)", marginTop: 12, minWidth: 12 }} />}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </SectionBoundary>

              <SectionBoundary title="Quick Actions">
                <div style={{ marginBottom: 18 }}>
                  <SecHead title="Quick Actions" />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
                    {[
                      { label: "Registrations",    icon: "👥", href: `/admin/events/${eventId}/registrations` },
                      { label: "Communicate",      icon: "📢", href: `/admin/events/${eventId}/communicate`   },
                      { label: "Race Day",         icon: "🏃", href: `/admin/events/${eventId}/race-day`      },
                      { label: "BIB Collection",   icon: "📦", href: `/admin/events/${eventId}/bib`           },
                      { label: "Results",          icon: "🏅", href: `/admin/events/${eventId}/results`       },
                      { label: "Analytics",        icon: "📈", href: `/admin/events/${eventId}/analytics`     },
                      { label: "Register Walk-in", icon: "➕", href: `/admin/events/${eventId}/registrations?action=register` },
                      { label: "Participants",     icon: "🪪", href: `/admin/events/${eventId}/participants`  },
                      { label: "Volunteers",       icon: "🙋", href: `/admin/events/${eventId}/volunteers`    },
                      { label: "Services",         icon: "🔧", href: `/admin/events/${eventId}/services`      },
                      { label: "Edit Event",       icon: "✏️", href: `/admin/events/${eventId}/edit`          },
                    ].map(a => (
                      <Link key={a.label} href={a.href} style={{ textDecoration: "none" }}>
                        <Card hoverable style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: "0.9rem 0.5rem" }}>
                          <span style={{ fontSize: 18 }}>{a.icon}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#777", textAlign: "center" as const }}>{a.label}</span>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </div>
              </SectionBoundary>
            </div>
          )}

          {/* ── RACES ────────────────────────────────────────────────────── */}
          {tab === "races" && (
            <SectionBoundary title="Races">
              <div style={{ maxWidth: 780 }}>
                <SecHead title={`Races (${races.length})`} action={<Link href={`/admin/events/new?edit=${eventId}`} style={{ fontSize: 11, color: "#e8620a", textDecoration: "none", fontWeight: 600 }}>Edit in wizard →</Link>} />
                {races.length === 0 ? (
                  <EmptyState icon="🏁" title="No races configured."
                    action={<Link href={`/admin/events/new?edit=${eventId}`}><Button size="sm" variant="outline">Add races →</Button></Link>} />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {races.map(r => (
                      <div key={r.id} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "0.9rem 1.1rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const, gap: 10 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{r.name}</div>
                          <div style={{ display: "flex", gap: 10, marginTop: 3, fontSize: 12, color: "#666" }}>
                            {r.distance && <span>📏 {r.distance}</span>}
                            {r.flag_off_time && <span>🏁 {r.flag_off_time}</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: "#e8620a" }}>₹{r.price}</span>
                          {r.max_slots && <span style={{ fontSize: 12, color: "#555" }}>{r.max_slots} slots</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SectionBoundary>
          )}

          {/* ── FINANCE ──────────────────────────────────────────────────── */}
          {tab === "finance" && (
            <SectionBoundary title="Finance">
              <div style={{ maxWidth: 580 }}>
                <SecHead title="Finance Summary" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <EventStatCard label="Collected" value={fmtInr(rev.collected)} color="#e8620a" accent />
                  <EventStatCard label="Pending"   value={fmtInr(rev.pending)}   color={rev.pending > 0 ? "#fbbf24" : "#555"} />
                </div>
                <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                        {["Category","Count","Amount"].map(h => (
                          <th key={h} style={{ padding: "9px 14px", textAlign: "left" as const, fontSize: 10, color: "#555", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".07em" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label:"Paid",    color:"#4ade80", count:reg.paid,    amount:fmtInr(rev.collected) },
                        { label:"Pending", color:"#fbbf24", count:reg.pending, amount:fmtInr(rev.pending)   },
                        { label:"Free",    color:"#60a5fa", count:reg.free,    amount:"₹0"                  },
                      ].map(row => (
                        <tr key={row.label} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                          <td style={{ padding:"9px 14px", color:row.color, fontWeight:600 }}>{row.label}</td>
                          <td style={{ padding:"9px 14px", color:"#888" }}>{fmt(row.count)}</td>
                          <td style={{ padding:"9px 14px", fontWeight:700, color:"#e8620a" }}>{row.amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </SectionBoundary>
          )}

          {/* ── ANNOUNCE ─────────────────────────────────────────────────── */}
          {tab === "announce" && (
            <SectionBoundary title="Announce">
              <div style={{ maxWidth: 640 }}>
                <SecHead title="Announce to All Active Members" />

                {/* Step 1 — recipient preview */}
                {!annPreview ? (
                  <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "1.25rem", marginBottom: 16 }}>
                    <div style={{ fontSize: 13, color: "#888", marginBottom: 12 }}>
                      Sends an event announcement to <strong style={{ color: "#fff" }}>all active members</strong> — not just registrants — via Email and/or WhatsApp.
                    </div>
                    <Button onClick={loadAnnouncePreview} loading={annLoading}>Check Recipients</Button>
                    {annError && <Alert variant="error" style={{ marginTop: 10 }}>{annError}</Alert>}
                  </div>
                ) : (
                  <>
                    {/* Recipient count */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
                      {[
                        { label: "Active Members", value: annPreview.member_count, color: "#fff" },
                        { label: "Email",          value: annPreview.email_count,  color: "#60a5fa" },
                        { label: "WhatsApp",       value: annPreview.wa_count,     color: "#4ade80" },
                      ].map(s => <EventStatCard key={s.label} label={s.label} value={s.value} color={s.color} />)}
                    </div>

                    {/* Result banner */}
                    {annResult && (
                      <div style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
                        <div style={{ fontWeight: 700, color: "#4ade80", marginBottom: 6 }}>
                          ✅ Announcement sent!
                        </div>
                        {annResult.wa_total > 0 && (
                          <div style={{ fontSize: 13, color: "#aaa" }}>
                            WhatsApp: <strong style={{ color: "#4ade80" }}>{annResult.wa_total}</strong> messages queued
                          </div>
                        )}
                        {annResult.email_queued > 0 && (
                          <div style={{ fontSize: 13, color: "#aaa", marginTop: 4 }}>
                            Email:{" "}
                            {annPolling ? (
                              <span>
                                <span style={{ color: "#eab308" }}>
                                  {annDelivered}/{annPollTotal} sent
                                </span>
                                {annFailed > 0 && (
                                  <span style={{ color: "#f87171", marginLeft: 8 }}>· {annFailed} failed</span>
                                )}
                                <span style={{ color: "#555", marginLeft: 8 }}>
                                  · {Math.max(0, annPollTotal - annDelivered - annFailed)} pending
                                </span>
                              </span>
                            ) : (
                              <span>
                                <strong style={{ color: "#4ade80" }}>{annDelivered} delivered</strong>
                                {annFailed > 0 && (
                                  <span style={{ color: "#f87171", marginLeft: 8 }}>· {annFailed} failed</span>
                                )}
                              </span>
                            )}
                          </div>
                        )}
                        <button onClick={() => { setAnnResult(null); setAnnPreview(null); setAnnDelivered(0); setAnnFailed(0); setAnnSubject(""); setAnnBody(""); setAnnTestResult(null); }}
                          style={{ marginTop: 10, fontSize: 12, color: "#555", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
                          Send another →
                        </button>
                      </div>
                    )}

                    {!annResult && (
                      <form onSubmit={sendAnnouncement} style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                        {/* Channel toggles */}
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase" as const, letterSpacing: ".07em", marginBottom: 8 }}>Channels</div>
                          <div style={{ display: "flex", gap: 10 }}>
                            {(["email", "whatsapp"] as const).map(ch => {
                              const on = annChannels.includes(ch);
                              return (
                                <button key={ch} type="button"
                                  onClick={() => setAnnChannels(prev => on ? prev.filter(c => c !== ch) : [...prev, ch])}
                                  style={{ padding: "7px 16px", borderRadius: 7, border: `1px solid ${on ? (ch === "email" ? "rgba(96,165,250,0.5)" : "rgba(74,222,128,0.5)") : "rgba(255,255,255,0.1)"}`, background: on ? (ch === "email" ? "rgba(96,165,250,0.1)" : "rgba(74,222,128,0.1)") : "transparent", color: on ? (ch === "email" ? "#60a5fa" : "#4ade80") : "#555", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                                  {ch === "email" ? "📧 Email" : "💬 WhatsApp"}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* WhatsApp preview */}
                        {annChannels.includes("whatsapp") && (
                          <div style={{ background: "rgba(37,211,102,0.05)", border: "1px solid rgba(37,211,102,0.15)", borderRadius: 10, padding: "12px 14px" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase" as const, letterSpacing: ".07em", marginBottom: 8 }}>WhatsApp Preview (session_alert_v3 template)</div>
                            <div style={{ fontSize: 12, color: "#aaa", lineHeight: 1.7 }}>
                              <span style={{ color: "#4ade80" }}>Hi [Name],</span><br />
                              <em style={{ color: "#666" }}>[Template intro text]</em><br />
                              📌 <strong style={{ color: "#fff" }}>{ev.title}</strong><br />
                              📅 {ev.start_date ? new Date(ev.start_date + "T12:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                              {ev.start_time && (() => { const [h, m] = ev.start_time!.split(":").map(Number); return `, ${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; })()}<br />
                              📍 {ev.location}
                            </div>
                            <div style={{ fontSize: 11, color: "#555", marginTop: 8 }}>
                              Sent to {annPreview.wa_count} members with a saved phone number.
                            </div>
                          </div>
                        )}

                        {/* Email compose */}
                        {annChannels.includes("email") && (
                          <>
                            <div>
                              <label style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase" as const, letterSpacing: ".07em", display: "block", marginBottom: 6 }}>Subject</label>
                              <input value={annSubject} onChange={e => setAnnSubject(e.target.value)} required
                                style={{ width: "100%", padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const }} />
                            </div>

                            <div>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                                <label style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase" as const, letterSpacing: ".07em" }}>Body</label>
                                <div style={{ fontSize: 10, color: "#444" }}>vars: {"{name} {event} {date} {time} {location} {register_link}"}</div>
                              </div>
                              <textarea value={annBody} onChange={e => setAnnBody(e.target.value)} required rows={10}
                                style={{ width: "100%", padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#fff", fontSize: 13, fontFamily: "monospace", outline: "none", resize: "vertical" as const, boxSizing: "border-box" as const }} />
                            </div>
                          </>
                        )}

                        {/* Test email — verify pipeline before bulk send */}
                        {annChannels.includes("email") && (
                          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "12px 14px" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase" as const, letterSpacing: ".07em", marginBottom: 8 }}>
                              🧪 Test Email (verify delivery before bulk send)
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <input
                                type="email"
                                value={annTestEmail}
                                onChange={e => setAnnTestEmail(e.target.value)}
                                placeholder="your@email.com"
                                style={{ flex: 1, padding: "7px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none" }}
                              />
                              <button
                                type="button"
                                onClick={() => void sendTestEmail()}
                                disabled={annTestSending || !annTestEmail.trim()}
                                style={{ padding: "7px 14px", borderRadius: 7, background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.25)", color: "#60a5fa", fontSize: 12, fontWeight: 700, cursor: annTestSending || !annTestEmail.trim() ? "not-allowed" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" as const, opacity: annTestSending || !annTestEmail.trim() ? 0.6 : 1 }}>
                                {annTestSending ? "Sending…" : "Send Test"}
                              </button>
                            </div>
                            {annTestResult && (
                              <div style={{ marginTop: 8, fontSize: 12, color: annTestResult.ok ? "#4ade80" : "#f87171" }}>
                                {annTestResult.ok ? "✓ " : "✗ "}{annTestResult.msg}
                              </div>
                            )}
                          </div>
                        )}

                        {annError && <Alert variant="error">{annError}</Alert>}

                        <Button type="submit" loading={annSending} disabled={!annChannels.length}>
                          📣 Send Announcement ({annPreview.member_count} members)
                        </Button>
                      </form>
                    )}
                  </>
                )}
              </div>
            </SectionBoundary>
          )}

          {/* ── FORM BUILDER ─────────────────────────────────────────────── */}
          {tab === "form" && (
            <SectionBoundary title="Form Builder">
              <div>
                <EventFormBuilder
                  eventId={eventId}
                  races={races.map(r => ({ id: r.id, name: r.name, distance: r.distance }))}
                />

              </div>
            </SectionBoundary>
          )}

          {/* ── REGISTRATION CONFIG ──────────────────────────────────────── */}
          {tab === "registration" && (
            <SectionBoundary title="Registration Settings">
              <div style={{ maxWidth: 560 }}>
                <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, marginBottom: 24 }}>
                  Configure what information is collected during participant registration. Changes take effect immediately for new registrations.
                </p>

                {/* Toggle helper */}
                {(() => {
                  type ToggleKey = "require_gender" | "require_dob" | "require_blood_group" | "require_emergency_contact" | "show_notes" | "multi_step";
                  const ToggleRow = ({ k, label, desc }: { k: ToggleKey; label: string; desc: string }) => (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#ddd" }}>{label}</div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{desc}</div>
                      </div>
                      <button
                        onClick={() => void saveRegConfig({ [k]: !regConfig[k] })}
                        style={{
                          width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", flexShrink: 0,
                          background: regConfig[k] ? "#e8620a" : "rgba(255,255,255,0.12)",
                          position: "relative", transition: "background 0.2s",
                        }}
                        aria-label={`Toggle ${label}`}
                      >
                        <span style={{
                          position: "absolute", top: 3, left: regConfig[k] ? 23 : 3,
                          width: 18, height: 18, borderRadius: "50%", background: "#fff",
                          transition: "left 0.2s",
                        }} />
                      </button>
                    </div>
                  );

                  return (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>Required Fields</div>
                      <ToggleRow k="require_gender"            label="Gender"             desc="Require participants to select their gender" />
                      <ToggleRow k="require_dob"               label="Date of Birth"      desc="Require date of birth for age verification" />
                      <ToggleRow k="require_blood_group"       label="Blood Group"        desc="Require blood group for medical emergencies" />
                      <ToggleRow k="require_emergency_contact" label="Emergency Contact"  desc="Require an emergency contact name and phone number" />

                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginTop: 24, marginBottom: 8 }}>Optional Sections</div>
                      <ToggleRow k="show_notes" label="Notes / Medical Info field" desc="Show a free-text field for medical conditions or dietary needs" />

                      {regConfig.show_notes && (
                        <div style={{ padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", flexDirection: "column", gap: 10 }}>
                          <div>
                            <label style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 5 }}>Notes field label</label>
                            <input
                              defaultValue={regConfig.notes_label}
                              onBlur={e => { if (e.target.value.trim() !== regConfig.notes_label) void saveRegConfig({ notes_label: e.target.value.trim() || "Notes" }); }}
                              style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, padding: "8px 11px", color: "#fff", fontSize: 13, boxSizing: "border-box" }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 5 }}>Notes field placeholder</label>
                            <input
                              defaultValue={regConfig.notes_placeholder}
                              onBlur={e => { if (e.target.value.trim() !== regConfig.notes_placeholder) void saveRegConfig({ notes_placeholder: e.target.value.trim() || REG_DEFAULTS.notes_placeholder }); }}
                              style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, padding: "8px 11px", color: "#fff", fontSize: 13, boxSizing: "border-box" }}
                            />
                          </div>
                        </div>
                      )}

                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginTop: 24, marginBottom: 8 }}>Experience</div>
                      <ToggleRow k="multi_step" label="Multi-step form" desc="Show registration as a step-by-step flow instead of a single page" />

                      {regConfigSaving && (
                        <div style={{ marginTop: 16, fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Saving…</div>
                      )}
                      {regConfigSaved && (
                        <div style={{ marginTop: 16, fontSize: 13, color: "#4ade80" }}>Saved</div>
                      )}
                    </div>
                  );
                })()}

                {/* ── Group / Multi-participant ── */}
                <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>Group / Multi-participant Registration</div>

                  {/* Toggle */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#ddd" }}>Allow group registration</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>One person registers and pays for multiple participants in a single booking</div>
                    </div>
                    <button
                      onClick={() => { const next = !multiEnabled; setMultiEnabled(next); void saveMultiConfig(next, maxPerReg); }}
                      style={{
                        width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", flexShrink: 0,
                        background: multiEnabled ? "#e8620a" : "rgba(255,255,255,0.12)",
                        position: "relative", transition: "background 0.2s",
                      }}
                      aria-label="Toggle group registration"
                    >
                      <span style={{
                        position: "absolute", top: 3, left: multiEnabled ? 23 : 3,
                        width: 18, height: 18, borderRadius: "50%", background: "#fff",
                        transition: "left 0.2s",
                      }} />
                    </button>
                  </div>

                  {/* Max per registration — only shown when enabled */}
                  {multiEnabled && (
                    <div style={{ padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <label style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 6 }}>
                        Maximum participants per booking
                        <span style={{ marginLeft: 6, fontSize: 11, color: "rgba(255,255,255,0.3)" }}>(1 = individual only, 2–20 = group allowed)</span>
                      </label>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <input
                          type="number" min={1} max={20}
                          value={maxPerReg}
                          onChange={e => setMaxPerReg(Math.max(1, Math.min(20, Number(e.target.value))))}
                          onBlur={() => void saveMultiConfig(multiEnabled, maxPerReg)}
                          style={{ width: 80, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, padding: "7px 10px", color: "#fff", fontSize: 14, outline: "none" }}
                        />
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>participants max</span>
                      </div>
                      <div style={{ marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
                        Each participant gets their own QR code. Pricing is calculated per-race category (flat per booking or per person depending on race settings).
                      </div>
                    </div>
                  )}

                  {multiSaving && <div style={{ marginTop: 12, fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Saving…</div>}
                  {multiSaved  && <div style={{ marginTop: 12, fontSize: 13, color: "#4ade80" }}>Saved</div>}
                </div>
              </div>
            </SectionBoundary>
          )}

          {/* ── CATEGORY CHANGES ─────────────────────────────────────────── */}
          {tab === "cat-changes" && (
            <SectionBoundary title="Category Change Requests">
              <div style={{ maxWidth: 720 }}>
                {/* Filter tabs */}
                <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                  {(["pending", "all"] as const).map(f => (
                    <button key={f} onClick={() => setCatChangesFilter(f)}
                      style={{ padding: "6px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                        background: catChangesFilter === f ? "#e8620a" : "rgba(255,255,255,0.08)",
                        color: catChangesFilter === f ? "#fff" : "rgba(255,255,255,0.55)" }}>
                      {f === "pending" ? "Pending" : "All Requests"}
                    </button>
                  ))}
                  <button onClick={() => void loadCatChanges()} style={{ marginLeft: "auto", padding: "6px 12px", borderRadius: 8, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", border: "none", cursor: "pointer", fontSize: 12 }}>↻ Refresh</button>
                </div>

                {catChangesError && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 12 }}>{catChangesError}</div>}

                {catChangesLoading ? (
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>Loading…</div>
                ) : (() => {
                  const filtered = catChanges.filter(r => catChangesFilter === "all" || r.status === "pending");
                  if (filtered.length === 0) return (
                    <div style={{ textAlign: "center", padding: "40px 20px", color: "rgba(255,255,255,0.3)", fontSize: 14 }}>
                      {catChangesFilter === "pending" ? "No pending requests." : "No category change requests yet."}
                    </div>
                  );
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {filtered.map(req => (
                        <div key={req.id} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${req.status === "pending" ? "rgba(234,179,8,0.25)" : req.status === "approved" ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}`, borderRadius: 10, padding: 16 }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                            <div style={{ flex: 1, minWidth: 200 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <span style={{ fontFamily: "monospace", fontSize: 12, color: "#e8620a" }}>{req.registration_code}</span>
                                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>({req.participant_count} participant{req.participant_count !== 1 ? "s" : ""})</span>
                                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                                  background: req.status === "pending" ? "rgba(234,179,8,0.15)" : req.status === "approved" ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
                                  color: req.status === "pending" ? "#eab308" : req.status === "approved" ? "#4ade80" : "#f87171" }}>
                                  {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                                </span>
                              </div>
                              <div style={{ fontSize: 13, marginBottom: 4 }}>
                                <span style={{ color: "rgba(255,255,255,0.5)" }}>{req.requested_by_email}</span>
                              </div>
                              <div style={{ fontSize: 14, fontWeight: 600 }}>
                                <span style={{ color: "#f87171" }}>{req.old_category}</span>
                                <span style={{ color: "rgba(255,255,255,0.4)", margin: "0 8px" }}>→</span>
                                <span style={{ color: "#4ade80" }}>{req.new_category}</span>
                              </div>
                              {req.reason && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 6, fontStyle: "italic" }}>&ldquo;{req.reason}&rdquo;</div>}
                              {req.admin_note && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Admin note: {req.admin_note}</div>}
                              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 6 }}>
                                Requested {new Date(req.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                {req.reviewed_by && ` · Reviewed by ${req.reviewed_by}`}
                              </div>
                            </div>
                            {req.status === "pending" && (
                              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                                <button
                                  onClick={() => {
                                    const note = prompt("Admin note (optional):");
                                    void resolveCatChange(req.id, "approve", note ?? undefined);
                                  }}
                                  style={{ padding: "7px 16px", borderRadius: 8, background: "rgba(74,222,128,0.15)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                                  Approve
                                </button>
                                <button
                                  onClick={() => {
                                    const note = prompt("Reason for rejection (shown to user):");
                                    void resolveCatChange(req.id, "reject", note ?? undefined);
                                  }}
                                  style={{ padding: "7px 16px", borderRadius: 8, background: "rgba(248,113,113,0.12)", color: "#f87171", border: "1px solid rgba(248,113,113,0.2)", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                                  Reject
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </SectionBoundary>
          )}

          {/* ── WAITLIST ─────────────────────────────────────────────────── */}
          {tab === "waitlist" && (
            <SectionBoundary title="Waitlist">
              <div style={{ maxWidth: 780 }}>
                {(() => {
                  const cats = Array.from(new Set(waitlist.map(e => e.distance_category).filter(Boolean) as string[]));
                  const filtered = waitlist.filter(e => {
                    if (wlStatusFilter !== "all" && e.status !== wlStatusFilter) return false;
                    if (wlCatFilter !== "all" && e.distance_category !== wlCatFilter) return false;
                    return true;
                  });
                  const waiting  = waitlist.filter(e => e.status === "waiting").length;
                  const approved = waitlist.filter(e => e.status === "approved").length;
                  const total    = waitlist.length;

                  return (
                    <>
                      {/* Stats row */}
                      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                        {[
                          { label: "Waiting",  val: waiting,           col: "#fbbf24" },
                          { label: "Approved", val: approved,          col: "#4ade80" },
                          { label: "Total",    val: total,             col: "#888"    },
                        ].map(s => (
                          <div key={s.label} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "8px 14px", minWidth: 80 }}>
                            <div style={{ fontSize: "1.2rem", fontWeight: 800, color: s.col }}>{s.val}</div>
                            <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".07em", fontWeight: 700, marginTop: 2 }}>{s.label}</div>
                          </div>
                        ))}
                        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <button onClick={() => void loadWaitlist()} style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", border: "none", cursor: "pointer", fontSize: 12 }}>↻ Refresh</button>
                          <button onClick={() => void expireStaleSlots()} disabled={expiring}
                            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.06)", color: "#f87171", cursor: expiring ? "not-allowed" : "pointer", fontSize: 12, fontFamily: "inherit" }}>
                            {expiring ? "Expiring…" : "⏳ Expire Stale Slots"}
                          </button>
                        </div>
                      </div>
                      {expireMsg && (
                        <div style={{ marginBottom: 12, fontSize: 12, padding: "8px 12px", borderRadius: 7, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#ccc" }}>
                          {expireMsg}
                        </div>
                      )}

                      {/* Filter bar */}
                      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                        {(["waiting", "approved", "all"] as const).map(f => (
                          <button key={f} onClick={() => setWlStatusFilter(f)}
                            style={{ padding: "5px 13px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                              background: wlStatusFilter === f ? "#e8620a" : "rgba(255,255,255,0.08)",
                              color:      wlStatusFilter === f ? "#fff"    : "rgba(255,255,255,0.5)" }}>
                            {f === "waiting" ? "Waiting" : f === "approved" ? "Approved" : "All"}
                          </button>
                        ))}
                        {cats.length > 0 && (
                          <select value={wlCatFilter} onChange={e => setWlCatFilter(e.target.value)}
                            style={{ padding: "5px 10px", borderRadius: 8, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", color: wlCatFilter !== "all" ? "#e8620a" : "rgba(255,255,255,0.5)", fontSize: 12, cursor: "pointer", colorScheme: "dark" }}>
                            <option value="all">All Categories</option>
                            {cats.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        )}
                      </div>

                      {waitlistError && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 12 }}>{waitlistError}</div>}

                      {waitlistLoading ? (
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>Loading…</div>
                      ) : filtered.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "40px 20px", color: "rgba(255,255,255,0.3)", fontSize: 14 }}>
                          {total === 0 ? "Nobody on the waitlist yet." : "No entries match the current filter."}
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {filtered.map(entry => {
                            const isWaiting  = entry.status === "waiting";
                            const isApproved = entry.status === "approved";
                            const acting     = wlActing === entry.id;
                            const joinedAgo  = (() => {
                              const ms = Date.now() - new Date(entry.created_at).getTime();
                              const h  = Math.floor(ms / 3_600_000);
                              const d  = Math.floor(h / 24);
                              return d > 0 ? `${d}d ago` : h > 0 ? `${h}h ago` : "just now";
                            })();
                            const approvedAgo = entry.approved_at ? (() => {
                              const ms = Date.now() - new Date(entry.approved_at).getTime();
                              const h  = Math.floor(ms / 3_600_000);
                              const d  = Math.floor(h / 24);
                              return d > 0 ? `approved ${d}d ago` : h > 0 ? `approved ${h}h ago` : "just approved";
                            })() : null;
                            const statusCol = isWaiting ? "#fbbf24" : isApproved ? "#4ade80" : "#f87171";

                            return (
                              <div key={entry.id} style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${isWaiting ? "rgba(251,191,36,0.15)" : isApproved ? "rgba(74,222,128,0.12)" : "rgba(255,255,255,0.06)"}`, borderRadius: 10, padding: "12px 14px" }}>
                                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>

                                  {/* Position badge (waiting only) */}
                                  {isWaiting && entry.position && (
                                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#fbbf24", flexShrink: 0 }}>
                                      #{entry.position}
                                    </div>
                                  )}

                                  {/* Info */}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
                                      <span style={{ fontWeight: 700, fontSize: 13, color: "#eee" }}>{entry.user_name}</span>
                                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: `${statusCol}18`, color: statusCol }}>
                                        {entry.status}
                                      </span>
                                      {entry.distance_category && (
                                        <span style={{ fontSize: 10, color: "#e8620a", background: "rgba(232,98,10,0.1)", padding: "2px 7px", borderRadius: 99, fontWeight: 700 }}>
                                          {entry.distance_category}
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ fontSize: 11, color: "#555" }}>
                                      {entry.user_email}
                                      {entry.phone && <span style={{ marginLeft: 10 }}>📞 {entry.phone}</span>}
                                    </div>
                                    <div style={{ fontSize: 11, color: "#444", marginTop: 3 }}>
                                      Joined {joinedAgo}
                                      {approvedAgo && <span style={{ marginLeft: 8, color: "#4ade80" }}>{approvedAgo}{entry.notified_at ? " · email sent" : " · not notified"}</span>}
                                    </div>
                                    {entry.notes && <div style={{ fontSize: 11, color: "#555", marginTop: 3, fontStyle: "italic" }}>{entry.notes}</div>}
                                  </div>

                                  {/* Actions */}
                                  <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
                                    {isWaiting && (
                                      <>
                                        <button disabled={acting} onClick={() => void waitlistAction(entry.id, "approve")}
                                          style={{ padding: "5px 12px", borderRadius: 6, background: "rgba(74,222,128,0.12)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.25)", cursor: "pointer", fontSize: 12, fontWeight: 700, opacity: acting ? 0.5 : 1 }}>
                                          {acting ? "…" : "Approve"}
                                        </button>
                                        <button disabled={acting} onClick={() => void waitlistAction(entry.id, "reject")}
                                          style={{ padding: "5px 12px", borderRadius: 6, background: "rgba(248,113,113,0.1)", color: "#f87171", border: "1px solid rgba(248,113,113,0.2)", cursor: "pointer", fontSize: 12, fontWeight: 700, opacity: acting ? 0.5 : 1 }}>
                                          {acting ? "…" : "Reject"}
                                        </button>
                                      </>
                                    )}
                                    <button disabled={acting} onClick={() => { if (confirm("Remove this entry from the waitlist?")) void waitlistAction(entry.id, "delete"); }}
                                      style={{ padding: "5px 10px", borderRadius: 6, background: "rgba(255,255,255,0.04)", color: "#666", border: "1px solid rgba(255,255,255,0.06)", cursor: "pointer", fontSize: 12, opacity: acting ? 0.5 : 1 }}>
                                      ×
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </SectionBoundary>
          )}

          {/* ── ROUTE MAPS ───────────────────────────────────────────────── */}
          {tab === "route-maps" && (
            <SectionBoundary title="Route Maps">
              <div style={{ maxWidth: 700 }}>
                <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, marginBottom: 20 }}>
                  Upload route maps (images, PDFs, or GPX files). These are shown to participants on the event page.
                </p>

                {/* Upload form */}
                <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 20, marginBottom: 24 }}>
                  <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 15 }}>Add New Route Map</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", display: "block", marginBottom: 6 }}>Name</label>
                      <input
                        value={routeMapName}
                        onChange={e => setRouteMapName(e.target.value)}
                        placeholder="e.g. 10K Route Map"
                        style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 14, boxSizing: "border-box" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", display: "block", marginBottom: 6 }}>File <span style={{ color: "rgba(255,255,255,0.35)" }}>(JPEG · PNG · PDF · GPX, max 30 MB)</span></label>
                      <input
                        ref={routeMapInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/svg+xml,application/pdf,.gpx,application/gpx+xml,text/xml"
                        onChange={e => setRouteMapFile(e.target.files?.[0] ?? null)}
                        style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}
                      />
                    </div>
                    {routeMapsError && (
                      <div style={{ color: "#f87171", fontSize: 13 }}>{routeMapsError}</div>
                    )}
                    <button
                      onClick={() => void uploadRouteMap()}
                      disabled={routeMapUploading || !routeMapFile}
                      style={{ alignSelf: "flex-start", padding: "9px 20px", borderRadius: 8, background: routeMapUploading || !routeMapFile ? "rgba(255,255,255,0.1)" : "#3b82f6", color: "#fff", border: "none", cursor: routeMapUploading || !routeMapFile ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600 }}
                    >
                      {routeMapUploading ? "Uploading…" : "Upload & Add"}
                    </button>
                  </div>
                </div>

                {/* List */}
                {routeMapsLoading ? (
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>Loading…</div>
                ) : routeMaps.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 20px", color: "rgba(255,255,255,0.3)", fontSize: 14 }}>
                    No route maps yet. Upload the first one above.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {routeMaps.map((map, idx) => (
                      <div key={map.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "12px 14px" }}>
                        {/* Type badge */}
                        <div style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>
                          {map.file_type === "image" ? "🖼️" : map.file_type === "pdf" ? "📄" : "🗺️"}
                        </div>
                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{map.name}</div>
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                            {map.file_type.toUpperCase()}
                            {map.file_size ? ` · ${(map.file_size / 1024 / 1024).toFixed(1)} MB` : ""}
                            {map.version > 1 ? ` · v${map.version}` : ""}
                            {" · "}
                            <span style={{ color: map.is_active ? "#4ade80" : "#f87171" }}>{map.is_active ? "Active" : "Hidden"}</span>
                          </div>
                        </div>
                        {/* Actions */}
                        <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <a href={map.file_url} target="_blank" rel="noopener noreferrer"
                            style={{ padding: "5px 10px", borderRadius: 6, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)", fontSize: 12, textDecoration: "none", display: "inline-block" }}>
                            View
                          </a>
                          <button onClick={() => void toggleRouteMapActive(map)}
                            style={{ padding: "5px 10px", borderRadius: 6, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)", border: "none", cursor: "pointer", fontSize: 12 }}>
                            {map.is_active ? "Hide" : "Show"}
                          </button>
                          <button onClick={() => void moveRouteMap(map.id, "up")} disabled={idx === 0}
                            style={{ padding: "5px 8px", borderRadius: 6, background: "rgba(255,255,255,0.08)", color: idx === 0 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.7)", border: "none", cursor: idx === 0 ? "not-allowed" : "pointer", fontSize: 12 }}>
                            ↑
                          </button>
                          <button onClick={() => void moveRouteMap(map.id, "down")} disabled={idx === routeMaps.length - 1}
                            style={{ padding: "5px 8px", borderRadius: 6, background: "rgba(255,255,255,0.08)", color: idx === routeMaps.length - 1 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.7)", border: "none", cursor: idx === routeMaps.length - 1 ? "not-allowed" : "pointer", fontSize: 12 }}>
                            ↓
                          </button>
                          <button onClick={() => void deleteRouteMap(map.id)}
                            style={{ padding: "5px 10px", borderRadius: 6, background: "rgba(220,38,38,0.15)", color: "#f87171", border: "none", cursor: "pointer", fontSize: 12 }}>
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SectionBoundary>
          )}

          {/* ── REGISTRATION STEPS ───────────────────────────────────────── */}
          {tab === "steps" && (
            <SectionBoundary title="Registration Steps">
              <div style={{ maxWidth: 720 }}>
                <div style={{ fontSize: 13, color: "#555", marginBottom: 20 }}>
                  Configure the steps shown during registration. An empty list means a single-page form (default behaviour). Steps are shown in order; hidden steps are skipped.
                </div>
                {stepsError && <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#f87171", marginBottom: 16 }}>{stepsError}</div>}

                {/* Existing steps */}
                {stepsLoading ? <div style={{ fontSize: 13, color: "#555" }}>Loading…</div> : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                    {regSteps.length === 0 && <div style={{ fontSize: 13, color: "#444", padding: "24px 0", textAlign: "center" }}>No steps configured — using single-page default.</div>}
                    {regSteps.map((step, idx) => (
                      <div key={step.id} style={{ background: "#111", border: "1px solid #222", borderRadius: 10, padding: "12px 16px" }}>
                        {editingStep === step.id && editingStepData ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                              <input value={editingStepData.label ?? ""} onChange={e => setEditingStepData(d => ({ ...d!, label: e.target.value }))} placeholder="Step label" style={{ padding: "7px 10px", background: "#0a0a0a", border: "1px solid #333", borderRadius: 6, color: "#fff", fontFamily: "inherit", fontSize: 13 }} />
                              <select value={editingStepData.step_type ?? "standard"} onChange={e => setEditingStepData(d => ({ ...d!, step_type: e.target.value }))} style={{ padding: "7px 10px", background: "#0a0a0a", border: "1px solid #333", borderRadius: 6, color: "#fff", fontFamily: "inherit", fontSize: 13, colorScheme: "dark" }}>
                                <option value="standard">Standard</option>
                                <option value="custom">Custom</option>
                                <option value="payment">Payment</option>
                                <option value="confirmation">Confirmation</option>
                              </select>
                            </div>
                            <input value={editingStepData.description ?? ""} onChange={e => setEditingStepData(d => ({ ...d!, description: e.target.value }))} placeholder="Description (optional)" style={{ padding: "7px 10px", background: "#0a0a0a", border: "1px solid #333", borderRadius: 6, color: "#fff", fontFamily: "inherit", fontSize: 13 }} />
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#888", cursor: "pointer" }}>
                                <input type="checkbox" checked={editingStepData.is_visible ?? true} onChange={e => setEditingStepData(d => ({ ...d!, is_visible: e.target.checked }))} style={{ accentColor: "#e8620a" }} /> Visible
                              </label>
                              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#888", cursor: "pointer" }}>
                                <input type="checkbox" checked={editingStepData.is_required ?? true} onChange={e => setEditingStepData(d => ({ ...d!, is_required: e.target.checked }))} style={{ accentColor: "#e8620a" }} /> Required
                              </label>
                              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                                <button onClick={() => { setEditingStep(null); setEditingStepData(null); }} style={{ padding: "5px 12px", background: "transparent", border: "1px solid #333", borderRadius: 6, color: "#888", fontSize: 12, cursor: "pointer" }}>Cancel</button>
                                <button onClick={saveStepEdit} disabled={stepSaving} style={{ padding: "5px 14px", background: "#e8620a", border: "none", borderRadius: 6, color: "#fff", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>{stepSaving ? "Saving…" : "Save"}</button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 18, width: 28, textAlign: "center" }}>{step.icon ?? "📋"}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{idx + 1}. {step.label}</span>
                                <span style={{ fontSize: 10, padding: "1px 6px", background: "rgba(255,255,255,0.08)", borderRadius: 4, color: "#888" }}>{step.step_type}</span>
                                {!step.is_visible && <span style={{ fontSize: 10, padding: "1px 6px", background: "rgba(239,68,68,0.1)", borderRadius: 4, color: "#f87171" }}>hidden</span>}
                              </div>
                              {step.description && <div style={{ fontSize: 11, color: "#555" }}>{step.description}</div>}
                            </div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={() => { setEditingStep(step.id); setEditingStepData({ ...step }); }} style={{ padding: "4px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid #333", borderRadius: 6, color: "#aaa", fontSize: 11, cursor: "pointer" }}>Edit</button>
                              <button onClick={() => deleteRegStep(step.id, step.label)} style={{ padding: "4px 10px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, color: "#f87171", fontSize: 11, cursor: "pointer" }}>Delete</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Add step */}
                <div style={{ background: "#0d0d0d", border: "1px solid #222", borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#e8620a", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Add Step</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 160px auto", gap: 8, alignItems: "flex-end" }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>Label</div>
                      <input value={newStepLabel} onChange={e => setNewStepLabel(e.target.value)} onKeyDown={e => e.key === "Enter" && addRegStep()} placeholder="e.g. Personal Info" style={{ width: "100%", padding: "8px 10px", background: "#0a0a0a", border: "1px solid #333", borderRadius: 6, color: "#fff", fontFamily: "inherit", fontSize: 13, boxSizing: "border-box" as const }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>Type</div>
                      <select value={newStepType} onChange={e => setNewStepType(e.target.value)} style={{ width: "100%", padding: "8px 10px", background: "#0a0a0a", border: "1px solid #333", borderRadius: 6, color: "#fff", fontFamily: "inherit", fontSize: 13, colorScheme: "dark" }}>
                        <option value="standard">Standard</option>
                        <option value="custom">Custom</option>
                        <option value="payment">Payment</option>
                        <option value="confirmation">Confirmation</option>
                      </select>
                    </div>
                    <button onClick={addRegStep} disabled={stepSaving || !newStepLabel.trim()} style={{ padding: "8px 18px", background: "#e8620a", border: "none", borderRadius: 6, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" as const }}>
                      {stepSaving ? "Adding…" : "Add Step"}
                    </button>
                  </div>
                </div>
              </div>
            </SectionBoundary>
          )}

          {/* ── PRICING RULES ────────────────────────────────────────────── */}
          {tab === "pricing" && (
            <SectionBoundary title="Pricing Rules">
              <div style={{ maxWidth: 720 }}>
                <div style={{ fontSize: 13, color: "#555", marginBottom: 20 }}>
                  Configure group, corporate, tiered, or referral discount rules. Rules are applied on top of the base category price.
                </div>
                {pricingError && <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#f87171", marginBottom: 16 }}>{pricingError}</div>}

                {/* Existing rules */}
                {pricingLoading ? <div style={{ fontSize: 13, color: "#555" }}>Loading…</div> : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                    {pricingRules.length === 0 && <div style={{ fontSize: 13, color: "#444", padding: "24px 0", textAlign: "center" }}>No pricing rules configured.</div>}
                    {pricingRules.map(rule => (
                      <div key={rule.id} style={{ background: "#111", border: "1px solid #222", borderRadius: 10, padding: "12px 16px" }}>
                        {editingRule === rule.id ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                              <input value={editingRuleData.label ?? ""} onChange={e => { const v = e.target.value; setEditingRuleData(d => ({ ...d, label: v } as EditingRuleForm)); }} placeholder="Label" style={{ padding: "7px 10px", background: "#0a0a0a", border: "1px solid #333", borderRadius: 6, color: "#fff", fontFamily: "inherit", fontSize: 13 }} />
                              <select value={editingRuleData.discount_type ?? "flat"} onChange={e => { const v = e.target.value; setEditingRuleData(d => ({ ...d, discount_type: v } as EditingRuleForm)); }} style={{ padding: "7px 10px", background: "#0a0a0a", border: "1px solid #333", borderRadius: 6, color: "#fff", fontFamily: "inherit", fontSize: 13, colorScheme: "dark" }}>
                                <option value="flat">Flat (₹)</option>
                                <option value="percent">Percent (%)</option>
                              </select>
                              <input type="number" min="0" value={editingRuleData.discount_value ?? "0"} onChange={e => { const v = e.target.value; setEditingRuleData(d => ({ ...d, discount_value: v } as EditingRuleForm)); }} placeholder="Value" style={{ padding: "7px 10px", background: "#0a0a0a", border: "1px solid #333", borderRadius: 6, color: "#fff", fontFamily: "inherit", fontSize: 13 }} />
                            </div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#888", cursor: "pointer" }}>
                                <input type="checkbox" checked={editingRuleData.is_active ?? true} onChange={e => setEditingRuleData(d => ({ ...d, is_active: e.target.checked }))} style={{ accentColor: "#e8620a" }} /> Active
                              </label>
                              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                                <button onClick={() => setEditingRule(null)} style={{ padding: "5px 12px", background: "transparent", border: "1px solid #333", borderRadius: 6, color: "#888", fontSize: 12, cursor: "pointer" }}>Cancel</button>
                                <button onClick={savePricingEdit} disabled={pricingSaving} style={{ padding: "5px 14px", background: "#e8620a", border: "none", borderRadius: 6, color: "#fff", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>{pricingSaving ? "Saving…" : "Save"}</button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{rule.label}</span>
                                <span style={{ fontSize: 10, padding: "1px 6px", background: "rgba(255,255,255,0.08)", borderRadius: 4, color: "#888" }}>{rule.rule_type}</span>
                                {!rule.is_active && <span style={{ fontSize: 10, padding: "1px 6px", background: "rgba(239,68,68,0.1)", borderRadius: 4, color: "#f87171" }}>inactive</span>}
                              </div>
                              <div style={{ fontSize: 11, color: "#555" }}>
                                {rule.discount_type === "flat" ? `₹${rule.discount_value} off` : `${rule.discount_value}% off`}
                                {rule.min_participants ? ` · min ${rule.min_participants} participants` : ""}
                                {rule.max_uses ? ` · ${rule.uses_count}/${rule.max_uses} uses` : ""}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={() => { setEditingRule(rule.id); setEditingRuleData({ ...rule, discount_value: String(rule.discount_value) } as EditingRuleForm); }} style={{ padding: "4px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid #333", borderRadius: 6, color: "#aaa", fontSize: 11, cursor: "pointer" }}>Edit</button>
                              <button onClick={() => deletePricingRule(rule.id, rule.label)} style={{ padding: "4px 10px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, color: "#f87171", fontSize: 11, cursor: "pointer" }}>Delete</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Add rule */}
                <div style={{ background: "#0d0d0d", border: "1px solid #222", borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#e8620a", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Add Rule</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 120px 100px auto", gap: 8, alignItems: "flex-end" }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>Label</div>
                      <input value={newRule.label} onChange={e => setNewRule(r => ({ ...r, label: e.target.value }))} placeholder="e.g. Group of 5" style={{ width: "100%", padding: "8px 10px", background: "#0a0a0a", border: "1px solid #333", borderRadius: 6, color: "#fff", fontFamily: "inherit", fontSize: 13, boxSizing: "border-box" as const }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>Type</div>
                      <select value={newRule.rule_type} onChange={e => setNewRule(r => ({ ...r, rule_type: e.target.value }))} style={{ width: "100%", padding: "8px 10px", background: "#0a0a0a", border: "1px solid #333", borderRadius: 6, color: "#fff", fontFamily: "inherit", fontSize: 13, colorScheme: "dark" }}>
                        <option value="group">Group</option>
                        <option value="corporate">Corporate</option>
                        <option value="tiered">Tiered</option>
                        <option value="referral">Referral</option>
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>Discount</div>
                      <select value={newRule.discount_type} onChange={e => setNewRule(r => ({ ...r, discount_type: e.target.value }))} style={{ width: "100%", padding: "8px 10px", background: "#0a0a0a", border: "1px solid #333", borderRadius: 6, color: "#fff", fontFamily: "inherit", fontSize: 13, colorScheme: "dark" }}>
                        <option value="flat">Flat (₹)</option>
                        <option value="percent">Percent (%)</option>
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>Value</div>
                      <input type="number" min="0" value={newRule.discount_value} onChange={e => setNewRule(r => ({ ...r, discount_value: e.target.value }))} placeholder="0" style={{ width: "100%", padding: "8px 10px", background: "#0a0a0a", border: "1px solid #333", borderRadius: 6, color: "#fff", fontFamily: "inherit", fontSize: 13, boxSizing: "border-box" as const }} />
                    </div>
                    <button onClick={addPricingRule} disabled={pricingSaving || !newRule.label.trim()} style={{ padding: "8px 16px", background: "#e8620a", border: "none", borderRadius: 6, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" as const }}>
                      {pricingSaving ? "Adding…" : "Add Rule"}
                    </button>
                  </div>
                </div>
              </div>
            </SectionBoundary>
          )}

          {/* ── LANDING PAGE BUILDER ─────────────────────────────────── */}
          {tab === "landing" && (
            <SectionBoundary title="Landing Page Builder">
              <div style={{ maxWidth: 760 }}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, gap: 12, flexWrap: "wrap" as const }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 3 }}>Landing Page Builder</div>
                    <div style={{ fontSize: 11, color: "#555" }}>Edit what participants see on the public event page.</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    {ev.share_slug && (
                      <a href={`/events/${ev.share_slug}${ev.status !== "published" ? "?preview=1" : ""}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "rgba(232,98,10,0.1)", border: "1px solid rgba(232,98,10,0.25)", borderRadius: 8, color: "#e8620a", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                        Preview ↗
                      </a>
                    )}
                    <Link href={`/admin/events/${eventId}/edit`}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#aaa", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                      Full Edit →
                    </Link>
                  </div>
                </div>

                {lpError && <Alert variant="error" style={{ marginBottom: 16 }}>{lpError}</Alert>}

                {lpLoading ? (
                  <div style={{ textAlign: "center", padding: "3rem" }}><Spinner /></div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

                    {/* Hero Images */}
                    <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "18px 20px" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: (lpSavedSection === "cover" || lpSavedSection === "banner") ? "#4ade80" : "#555", textTransform: "uppercase" as const, letterSpacing: ".08em", marginBottom: 14 }}>
                        Hero Images {(lpSavedSection === "cover" || lpSavedSection === "banner") && "— Saved ✓"}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        {/* Cover */}
                        <div>
                          <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>Cover <span style={{ color: "#555", fontSize: 10 }}>(portrait / square)</span></div>
                          {lpCoverUrl ? (
                            <div style={{ position: "relative", marginBottom: 8 }}>
                              <img src={lpCoverUrl} alt="Cover" style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", display: "block" }} />
                              <button onClick={() => { setLpCoverUrl(""); void saveLpFields({ cover_image: null }, "cover"); }}
                                style={{ position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.75)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                                ×
                              </button>
                            </div>
                          ) : (
                            <div style={{ width: "100%", aspectRatio: "4/3", background: "rgba(255,255,255,0.03)", border: "2px dashed rgba(255,255,255,0.1)", borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 8 }}>
                              <span style={{ fontSize: 22 }}>🖼️</span>
                              <span style={{ fontSize: 11, color: "#444" }}>No cover image</span>
                            </div>
                          )}
                          <input ref={lpCoverRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) void handleLpCoverUpload(f); if (lpCoverRef.current) lpCoverRef.current.value = ""; }} />
                          <button onClick={() => lpCoverRef.current?.click()} disabled={lpCoverUpl}
                            style={{ width: "100%", padding: "7px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#aaa", fontSize: 12, cursor: lpCoverUpl ? "wait" : "pointer", fontFamily: "inherit" }}>
                            {lpCoverUpl ? "Uploading…" : lpCoverUrl ? "Replace Cover" : "Upload Cover"}
                          </button>
                        </div>
                        {/* Banner */}
                        <div>
                          <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>Banner <span style={{ color: "#555", fontSize: 10 }}>(landscape hero)</span></div>
                          {lpBannerUrl ? (
                            <div style={{ position: "relative", marginBottom: 8 }}>
                              <img src={lpBannerUrl} alt="Banner" style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", display: "block" }} />
                              <button onClick={() => { setLpBannerUrl(""); void saveLpFields({ banner_image: null }, "banner"); }}
                                style={{ position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.75)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                                ×
                              </button>
                            </div>
                          ) : (
                            <div style={{ width: "100%", aspectRatio: "4/3", background: "rgba(255,255,255,0.03)", border: "2px dashed rgba(255,255,255,0.1)", borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 8 }}>
                              <span style={{ fontSize: 22 }}>🌄</span>
                              <span style={{ fontSize: 11, color: "#444" }}>No banner image</span>
                            </div>
                          )}
                          <input ref={lpBannerRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) void handleLpBannerUpload(f); if (lpBannerRef.current) lpBannerRef.current.value = ""; }} />
                          <button onClick={() => lpBannerRef.current?.click()} disabled={lpBannerUpl}
                            style={{ width: "100%", padding: "7px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#aaa", fontSize: 12, cursor: lpBannerUpl ? "wait" : "pointer", fontFamily: "inherit" }}>
                            {lpBannerUpl ? "Uploading…" : lpBannerUrl ? "Replace Banner" : "Upload Banner"}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Event Highlights */}
                    <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "18px 20px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: lpSavedSection === "highlights" ? "#4ade80" : "#555", textTransform: "uppercase" as const, letterSpacing: ".08em" }}>
                          Event Highlights ({lpHighlights.length}) {lpSavedSection === "highlights" && "— Saved ✓"}
                        </div>
                        {lpHlEdit === null && (
                          <button onClick={() => { setLpHlEdit(-1); setLpHlForm({ icon: "", title: "", description: "" }); }}
                            style={{ padding: "5px 12px", background: "rgba(232,98,10,0.12)", border: "1px solid rgba(232,98,10,0.25)", borderRadius: 7, color: "#e8620a", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                            + Add
                          </button>
                        )}
                      </div>
                      {lpHlEdit !== null && (
                        <div style={{ background: "rgba(232,98,10,0.05)", border: "1px solid rgba(232,98,10,0.15)", borderRadius: 10, padding: 16, marginBottom: 14 }}>
                          <div style={{ display: "grid", gridTemplateColumns: "60px 1fr", gap: 10, marginBottom: 10 }}>
                            <div>
                              <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4, textTransform: "uppercase" as const, fontWeight: 700 }}>Icon</label>
                              <input value={lpHlForm.icon} onChange={e => setLpHlForm(f => ({ ...f, icon: e.target.value }))}
                                placeholder="🏃" maxLength={2}
                                style={{ width: "100%", padding: "7px 4px", background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#fff", fontSize: 18, textAlign: "center" as const, boxSizing: "border-box" as const, fontFamily: "inherit" }} />
                            </div>
                            <div>
                              <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4, textTransform: "uppercase" as const, fontWeight: 700 }}>Title *</label>
                              <input value={lpHlForm.title} onChange={e => setLpHlForm(f => ({ ...f, title: e.target.value }))}
                                placeholder="e.g. Certified Course"
                                style={{ width: "100%", padding: "7px 10px", background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#fff", fontSize: 13, boxSizing: "border-box" as const, fontFamily: "inherit" }} />
                            </div>
                          </div>
                          <div style={{ marginBottom: 12 }}>
                            <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4, textTransform: "uppercase" as const, fontWeight: 700 }}>Description</label>
                            <input value={lpHlForm.description} onChange={e => setLpHlForm(f => ({ ...f, description: e.target.value }))}
                              placeholder="Short description"
                              style={{ width: "100%", padding: "7px 10px", background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#fff", fontSize: 13, boxSizing: "border-box" as const, fontFamily: "inherit" }} />
                          </div>
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                            <button onClick={() => { setLpHlEdit(null); setLpHlForm({ icon: "", title: "", description: "" }); }}
                              style={{ padding: "6px 14px", background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#777", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                            <button onClick={saveHighlight} disabled={!lpHlForm.title.trim() || lpSaving}
                              style={{ padding: "6px 16px", background: "#e8620a", border: "none", borderRadius: 7, color: "#fff", fontSize: 12, fontWeight: 600, cursor: !lpHlForm.title.trim() || lpSaving ? "not-allowed" : "pointer", opacity: !lpHlForm.title.trim() || lpSaving ? 0.5 : 1, fontFamily: "inherit" }}>
                              {lpSaving ? "Saving…" : lpHlEdit >= 0 ? "Update" : "Add Highlight"}
                            </button>
                          </div>
                        </div>
                      )}
                      {lpHighlights.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "24px", color: "#444", fontSize: 13 }}>No highlights yet. Highlight key features of your event.</div>
                      ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
                          {lpHighlights.map((h, i) => (
                            <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "12px 14px" }}>
                              {h.icon && <div style={{ fontSize: 20, marginBottom: 6 }}>{h.icon}</div>}
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: h.description ? 4 : 0 }}>{h.title}</div>
                              {h.description && <div style={{ fontSize: 11, color: "#666", lineHeight: 1.5 }}>{h.description}</div>}
                              <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                                <button onClick={() => { setLpHlEdit(i); setLpHlForm({ ...h }); }}
                                  style={{ padding: "3px 8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, color: "#aaa", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
                                <button onClick={() => removeHighlight(i)}
                                  style={{ padding: "3px 8px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 5, color: "#f87171", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>×</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Photo Gallery */}
                    <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "18px 20px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: lpSavedSection === "gallery" ? "#4ade80" : "#555", textTransform: "uppercase" as const, letterSpacing: ".08em" }}>
                          Photo Gallery ({lpGallery.length}) {lpSavedSection === "gallery" && "— Saved ✓"}
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          {lpGalleryUpl && <span style={{ fontSize: 11, color: "#e8620a" }}>Uploading…</span>}
                          <input ref={lpGalleryRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) void handleLpGalleryUpload(f); if (lpGalleryRef.current) lpGalleryRef.current.value = ""; }} />
                          <button onClick={() => lpGalleryRef.current?.click()} disabled={lpGalleryUpl}
                            style={{ padding: "5px 12px", background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.25)", borderRadius: 7, color: "#60a5fa", fontSize: 12, fontWeight: 600, cursor: lpGalleryUpl ? "wait" : "pointer", fontFamily: "inherit" }}>
                            + Add Photo
                          </button>
                        </div>
                      </div>
                      {lpGallery.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "24px", color: "#444", fontSize: 13 }}>No gallery photos yet.</div>
                      ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8 }}>
                          {lpGallery.map((url, i) => (
                            <div key={i} style={{ position: "relative", aspectRatio: "1" }}>
                              <img src={url} alt={`Gallery ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", display: "block" }} />
                              <button onClick={() => removeLpGalleryImage(i)}
                                style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.75)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* FAQs */}
                    <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "18px 20px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: lpSavedSection === "faqs" ? "#4ade80" : "#555", textTransform: "uppercase" as const, letterSpacing: ".08em" }}>
                          FAQs ({lpFaqs.length}) {lpSavedSection === "faqs" && "— Saved ✓"}
                        </div>
                        {lpFaqEdit === null && (
                          <button onClick={() => { setLpFaqEdit(-1); setLpFaqForm({ question: "", answer: "" }); }}
                            style={{ padding: "5px 12px", background: "rgba(232,98,10,0.12)", border: "1px solid rgba(232,98,10,0.25)", borderRadius: 7, color: "#e8620a", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                            + Add FAQ
                          </button>
                        )}
                      </div>
                      {lpFaqEdit !== null && (
                        <div style={{ background: "rgba(232,98,10,0.05)", border: "1px solid rgba(232,98,10,0.15)", borderRadius: 10, padding: 16, marginBottom: 14 }}>
                          <div style={{ marginBottom: 10 }}>
                            <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4, textTransform: "uppercase" as const, fontWeight: 700 }}>Question *</label>
                            <input value={lpFaqForm.question} onChange={e => setLpFaqForm(f => ({ ...f, question: e.target.value }))}
                              placeholder="e.g. Can I transfer my registration?"
                              style={{ width: "100%", padding: "7px 10px", background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#fff", fontSize: 13, boxSizing: "border-box" as const, fontFamily: "inherit" }} />
                          </div>
                          <div style={{ marginBottom: 12 }}>
                            <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4, textTransform: "uppercase" as const, fontWeight: 700 }}>Answer</label>
                            <textarea value={lpFaqForm.answer} onChange={e => setLpFaqForm(f => ({ ...f, answer: e.target.value }))}
                              rows={3} placeholder="Provide a clear, helpful answer"
                              style={{ width: "100%", padding: "7px 10px", background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#fff", fontSize: 13, boxSizing: "border-box" as const, fontFamily: "inherit", resize: "vertical" as const }} />
                          </div>
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                            <button onClick={() => { setLpFaqEdit(null); setLpFaqForm({ question: "", answer: "" }); }}
                              style={{ padding: "6px 14px", background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#777", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                            <button onClick={saveFaq} disabled={!lpFaqForm.question.trim() || lpSaving}
                              style={{ padding: "6px 16px", background: "#e8620a", border: "none", borderRadius: 7, color: "#fff", fontSize: 12, fontWeight: 600, cursor: !lpFaqForm.question.trim() || lpSaving ? "not-allowed" : "pointer", opacity: !lpFaqForm.question.trim() || lpSaving ? 0.5 : 1, fontFamily: "inherit" }}>
                              {lpSaving ? "Saving…" : lpFaqEdit >= 0 ? "Update FAQ" : "Add FAQ"}
                            </button>
                          </div>
                        </div>
                      )}
                      {lpFaqs.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "24px", color: "#444", fontSize: 13 }}>No FAQs yet.</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {lpFaqs.map((faq, i) => (
                            <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 10 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 4 }}>{faq.question}</div>
                                {faq.answer && <div style={{ fontSize: 12, color: "#666", lineHeight: 1.6, whiteSpace: "pre-line" as const }}>{faq.answer}</div>}
                              </div>
                              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                                <button onClick={() => { setLpFaqEdit(i); setLpFaqForm({ ...faq }); }}
                                  style={{ padding: "3px 8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, color: "#aaa", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
                                <button onClick={() => removeFaq(i)}
                                  style={{ padding: "3px 8px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 5, color: "#f87171", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>×</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Terms & Conditions */}
                    <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "18px 20px" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: lpSavedSection === "terms" ? "#4ade80" : "#555", textTransform: "uppercase" as const, letterSpacing: ".08em", marginBottom: 10 }}>
                        Terms &amp; Conditions {lpSavedSection === "terms" && "— Saved ✓"}
                      </div>
                      <textarea
                        value={lpTerms}
                        onChange={e => setLpTerms(e.target.value)}
                        rows={6}
                        placeholder="Enter your event terms and conditions. Shown as a collapsible section on the event page."
                        style={{ width: "100%", padding: "9px 12px", background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", resize: "vertical" as const, boxSizing: "border-box" as const, lineHeight: 1.7 }}
                      />
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                        <button onClick={() => void saveLpFields({ terms_conditions: lpTerms || null }, "terms")} disabled={lpSaving}
                          style={{ padding: "7px 18px", background: "#e8620a", border: "none", borderRadius: 7, color: "#fff", fontSize: 12, fontWeight: 600, cursor: lpSaving ? "wait" : "pointer", fontFamily: "inherit" }}>
                          {lpSaving ? "Saving…" : "Save Terms"}
                        </button>
                      </div>
                    </div>

                    {/* WhatsApp Community */}
                    <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "18px 20px" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: lpSavedSection === "wa" ? "#4ade80" : "#555", textTransform: "uppercase" as const, letterSpacing: ".08em", marginBottom: 8 }}>
                        WhatsApp Community {lpSavedSection === "wa" && "— Saved ✓"}
                      </div>
                      <div style={{ fontSize: 12, color: "#555", marginBottom: 10 }}>A join button appears on the event page when this URL is set.</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          value={lpWa}
                          onChange={e => setLpWa(e.target.value)}
                          placeholder="https://chat.whatsapp.com/..."
                          type="url"
                          style={{ flex: 1, padding: "9px 12px", background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", minWidth: 0 }}
                        />
                        <button onClick={() => void saveLpFields({ whatsapp_community_url: lpWa || null }, "wa")} disabled={lpSaving}
                          style={{ padding: "9px 18px", background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 8, color: "#4ade80", fontSize: 12, fontWeight: 700, cursor: lpSaving ? "wait" : "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                          {lpSaving ? "…" : "Save"}
                        </button>
                      </div>
                    </div>

                    {/* Route Maps shortcut */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", background: "rgba(96,165,250,0.04)", border: "1px solid rgba(96,165,250,0.12)", borderRadius: 12 }}>
                      <span style={{ fontSize: 20 }}>🗺️</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#60a5fa", marginBottom: 2 }}>Route Maps</div>
                        <div style={{ fontSize: 11, color: "#555" }}>Upload images, PDFs, or GPX files shown on the event page.</div>
                      </div>
                      <button onClick={() => setTab("route-maps" as TabKey)}
                        style={{ padding: "7px 14px", background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 7, color: "#60a5fa", fontSize: 12, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                        Route Maps →
                      </button>
                    </div>

                    {/* Sponsors shortcut */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12 }}>
                      <span style={{ fontSize: 20 }}>🤝</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc", marginBottom: 2 }}>Sponsors &amp; Partners</div>
                        <div style={{ fontSize: 11, color: "#555" }}>Manage sponsor logos shown at the bottom of the event page.</div>
                      </div>
                      <Link href={`/admin/events/${eventId}/sponsors`}
                        style={{ padding: "7px 14px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#aaa", fontSize: 12, textDecoration: "none", flexShrink: 0 }}>
                        Manage Sponsors →
                      </Link>
                    </div>

                  </div>
                )}
              </div>
            </SectionBoundary>
          )}

          {/* ── VERSION HISTORY ──────────────────────────────────────────── */}
          {tab === "versions" && (
            <SectionBoundary title="Version History">
              <div style={{ maxWidth: 680 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, gap: 12, flexWrap: "wrap" as const }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 4 }}>Event Version History</div>
                    <div style={{ fontSize: 12, color: "#555" }}>Save checkpoints before making changes. Restoring a version overwrites event details — registrations are never affected.</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                    <input
                      value={versionLabel}
                      onChange={e => setVersionLabel(e.target.value)}
                      placeholder="Checkpoint label (optional)"
                      style={{ padding: "7px 11px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 12, fontFamily: "inherit", width: 220 }}
                    />
                    <Button size="sm" loading={versionSaving} onClick={saveVersionCheckpoint}>📌 Save Checkpoint</Button>
                  </div>
                </div>

                {versionsError && <Alert variant="error" style={{ marginBottom: 12 }}>{versionsError}</Alert>}

                {versionsLoading ? (
                  <div style={{ textAlign: "center", padding: "2rem", color: "#555" }}><Spinner /></div>
                ) : versions.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "3rem 2rem", background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, color: "#555" }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>🕐</div>
                    <div style={{ fontSize: 13, marginBottom: 4 }}>No checkpoints yet</div>
                    <div style={{ fontSize: 11 }}>Save a checkpoint before making changes to preserve a restore point.</div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {versions.map((v, idx) => (
                      <div key={v.id} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                        {/* Version badge */}
                        <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: "50%", background: idx === 0 ? "rgba(232,98,10,0.15)" : "rgba(255,255,255,0.05)", border: `1px solid ${idx === 0 ? "rgba(232,98,10,0.3)" : "rgba(255,255,255,0.08)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: idx === 0 ? "#e8620a" : "#555" }}>
                          v{v.version_number}
                        </div>
                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                            {v.label ?? `Version ${v.version_number}`}
                          </div>
                          <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                            {new Date(v.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                            {v.created_by && ` · ${v.created_by}`}
                            {idx === 0 && <span style={{ marginLeft: 8, color: "#e8620a", fontWeight: 600 }}>Latest</span>}
                          </div>
                        </div>
                        {/* Restore */}
                        <button
                          onClick={() => void restoreVersion(v.id, v.version_number)}
                          disabled={restoring === v.id}
                          style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 7, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#aaa", fontSize: 12, cursor: restoring === v.id ? "wait" : "pointer", fontFamily: "inherit" }}>
                          {restoring === v.id ? "Restoring…" : "Restore"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ fontSize: 11, color: "#333", marginTop: 14, textAlign: "center" }}>
                  Up to 50 checkpoints stored · oldest are automatically replaced when limit is reached
                </div>
              </div>
            </SectionBoundary>
          )}

          {/* ── SETTINGS ─────────────────────────────────────────────────── */}
          {tab === "settings" && (
            <SectionBoundary title="Settings">
              <div style={{ maxWidth: 520 }}>
                <SecHead title="Event Settings" />
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { icon: "✏️", label: "Edit Event Details",  desc: "Title, dates, location, media",    href: `/admin/events/${eventId}/edit` },
                    { icon: "📢", label: "Communication Hub",   desc: "Emails and push notifications",    href: `/admin/events/${eventId}/communicate` },
                    { icon: "💸", label: "Refund Policy",       desc: "Set cancellation & refund rules",  href: `/admin/events/${eventId}/refund-policy` },
                    { icon: "📈", label: "Analytics",           desc: "Registration trends",               href: `/admin/events/${eventId}/analytics` },
                    { icon: "🤝", label: "Sponsors",            desc: "Add and manage event sponsors",    href: `/admin/events/${eventId}/sponsors` },
                  ].map((item, i) => (
                    <Link key={i} href={item.href}
                      style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, textDecoration: "none" }}>
                      <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#ccc" }}>{item.label}</div>
                        <div style={{ fontSize: 11, color: "#555", marginTop: 1 }}>{item.desc}</div>
                      </div>
                      <span style={{ marginLeft: "auto", color: "#555", fontSize: 16 }}>›</span>
                    </Link>
                  ))}
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                    <Button variant="ghost" fullWidth onClick={duplicateEvent}>📋 Duplicate Event</Button>
                    <Button variant="ghost" fullWidth onClick={saveAsTemplate}>🗂️ Save as Template</Button>
                    <Button variant="secondary" fullWidth onClick={archiveEvent}>{ev.status === "archived" ? "♻️ Restore Event" : "📦 Archive Event"}</Button>
                    <Button variant={isPub ? "danger" : "primary"} fullWidth onClick={togglePublish}>{isPub ? "⛔ Unpublish" : "🚀 Publish"}</Button>
                  </div>
                </div>
              </div>
            </SectionBoundary>
          )}

        </div>
      </div>
    </div>
  );
}
