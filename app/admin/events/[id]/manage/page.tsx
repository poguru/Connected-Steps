"use client";

import { useState, useEffect, useCallback, useRef, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getLifecycle } from "@/lib/event-lifecycle";
import { Button, Alert, Badge, Card, EmptyState, Spinner } from "@/components/ui/ds";

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
    registration_config: Record<string, unknown> | null;
  } | null;
  registrations: { total: number; confirmed: number; pending: number; cancelled: number; paid: number; free: number; checked_in: number; active: number };
  capacity:  { max: number | null; filled: number; remaining: number | null };
  revenue:   { collected: number; pending: number };
  emails:    { campaigns: number; confirmation_sent: number; confirmation_failed: number; campaign_delivered: number; campaign_failed: number; campaign_queued: number };
  races:     Array<{ id: string; name: string; distance: string; price: number; max_slots: number | null; status: string; gun_time: string | null; flag_off_time: string | null; report_time: string | null }>;
  recent_comms: Array<{ sent: number; failed: number; status: string; sent_at: string; subject: string; channel: string | null; recipients: number }>;
}

// ── Nav definition ─────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { key: "overview",      icon: "⚡", label: "Overview",       inline: true  },
  { key: "registrations", icon: "👥", label: "Registrations",  inline: false, href: "registrations" },
  { key: "participants",  icon: "🪪", label: "Participants",   inline: false, href: "participants"  },
  { key: "races",         icon: "🏁", label: "Races",          inline: true  },
  { key: "form",          icon: "📋", label: "Form Builder",   inline: true  },
  { key: "registration",  icon: "🧾", label: "Registration",   inline: true  },
  { key: "cat-changes",   icon: "🔄", label: "Cat. Changes",   inline: true  },
  { key: "route-maps",    icon: "🗺️", label: "Route Maps",     inline: true  },
  { key: "communicate",   icon: "📢", label: "Communicate",    inline: false, href: "communicate"   },
  { key: "announce",      icon: "📣", label: "Announce",       inline: true  },
  { key: "race-day",      icon: "🏃", label: "Race Day",       inline: false, href: "race-day"      },
  { key: "bib",           icon: "📦", label: "BIB Collection", inline: false, href: "bib"           },
  { key: "results",       icon: "🏅", label: "Results",        inline: false, href: "results"       },
  { key: "analytics",     icon: "📈", label: "Analytics",      inline: false, href: "analytics"     },
  { key: "sponsors",      icon: "🤝", label: "Sponsors",       inline: false, href: "sponsors"      },
  { key: "volunteers",    icon: "🙋", label: "Volunteers",     inline: false, href: "volunteers"    },
  { key: "services",      icon: "🔧", label: "Services",       inline: false, href: "services"      },
  { key: "cancellations", icon: "↩️", label: "Cancellations",  inline: false, href: "cancellations" },
  { key: "finance",       icon: "💰", label: "Finance",        inline: true  },
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
  const [annDelivered, setAnnDelivered] = useState(0);
  const [annPolling,   setAnnPolling]   = useState(false);
  const [annPollTotal, setAnnPollTotal] = useState(0);

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
    setAnnSending(true); setAnnError(""); setAnnResult(null); setAnnDelivered(0);
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

  useEffect(() => {
    if (!annPolling || !annResult?.batch_id) return;
    const batchId = annResult.batch_id;
    const interval = setInterval(async () => {
      try {
        const res  = await fetch(`/api/admin/events/${eventId}/communicate/status?batch_id=${batchId}`);
        const data = await res.json() as { queued: number; sending: number; delivered: number };
        setAnnDelivered(data.delivered ?? 0);
        if (data.queued === 0 && data.sending === 0) {
          setAnnPolling(false);
        }
      } catch { /* non-critical */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [annPolling, annResult?.batch_id, eventId]);

  // ── Form Builder state ───────────────────────────────────────────────────────

  interface FormField {
    id: string; field_key: string; field_type: string; label: string;
    placeholder: string | null; help_text: string | null; required: boolean;
    options: string[]; display_order: number; is_active: boolean;
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

  useEffect(() => {
    if (tab === "registration" && !regConfigLoaded && data) {
      const saved = data.event?.registration_config as Partial<RegConfig> | null | undefined;
      if (saved) setRegConfig({ ...REG_DEFAULTS, ...saved });
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
        body: JSON.stringify({ registration_config: next }),
      });
      if (res.ok) { setRegConfigSaved(true); setTimeout(() => setRegConfigSaved(false), 2000); }
    } finally { setRegConfigSaving(false); }
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
                              <span style={{ color: "#eab308" }}>Delivering… {annDelivered}/{annPollTotal}</span>
                            ) : (
                              <strong style={{ color: "#4ade80" }}>{annDelivered} delivered</strong>
                            )}
                          </div>
                        )}
                        <button onClick={() => { setAnnResult(null); setAnnPreview(null); setAnnDelivered(0); setAnnSubject(""); setAnnBody(""); }}
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
              <div style={{ maxWidth: 700 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Registration Form Fields</div>
                    <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>Custom fields appear after the standard fields in the registration form.</div>
                  </div>
                  <Button size="sm" onClick={() => { setShowAddField(s => !s); setFormError(""); }}>+ Add Field</Button>
                </div>

                {formError && <Alert variant="error" style={{ marginBottom: 12 }}>{formError}</Alert>}

                {/* Add field form */}
                {showAddField && (
                  <div style={{ background: "#111", border: "1px solid rgba(232,98,10,0.25)", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#e8620a", textTransform: "uppercase" as const, letterSpacing: ".07em", marginBottom: 12 }}>New Field</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                      <div>
                        <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4, textTransform: "uppercase" as const, fontWeight: 700 }}>Label *</label>
                        <input value={newField.label} onChange={e => setNewField(f => ({ ...f, label: e.target.value }))}
                          placeholder="e.g. Running Club" style={{ width: "100%", background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", padding: "7px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" as const }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4, textTransform: "uppercase" as const, fontWeight: 700 }}>Type</label>
                        <select value={newField.field_type} onChange={e => setNewField(f => ({ ...f, field_type: e.target.value }))}
                          style={{ width: "100%", background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", padding: "7px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" as const }}>
                          <option value="text">Text (single line)</option>
                          <option value="textarea">Text (multi-line)</option>
                          <option value="select">Dropdown (select)</option>
                          <option value="number">Number</option>
                          <option value="date">Date</option>
                          <option value="checkbox">Checkbox (yes/no)</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4, textTransform: "uppercase" as const, fontWeight: 700 }}>Placeholder</label>
                        <input value={newField.placeholder} onChange={e => setNewField(f => ({ ...f, placeholder: e.target.value }))}
                          placeholder="Hint shown in empty field" style={{ width: "100%", background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", padding: "7px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" as const }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4, textTransform: "uppercase" as const, fontWeight: 700 }}>Help Text</label>
                        <input value={newField.help_text} onChange={e => setNewField(f => ({ ...f, help_text: e.target.value }))}
                          placeholder="Shown below the field" style={{ width: "100%", background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", padding: "7px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" as const }} />
                      </div>
                    </div>
                    {(newField.field_type === "select") && (
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4, textTransform: "uppercase" as const, fontWeight: 700 }}>Options (comma-separated) *</label>
                        <input value={newField.options} onChange={e => setNewField(f => ({ ...f, options: e.target.value }))}
                          placeholder="Option A, Option B, Option C" style={{ width: "100%", background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", padding: "7px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" as const }} />
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#aaa", cursor: "pointer" }}>
                        <input type="checkbox" checked={newField.required} onChange={e => setNewField(f => ({ ...f, required: e.target.checked }))} /> Required
                      </label>
                      <div style={{ flex: 1 }} />
                      <Button size="sm" variant="ghost" onClick={() => { setShowAddField(false); setFormError(""); }}>Cancel</Button>
                      <Button size="sm" loading={formSaving} onClick={saveNewField}>Save Field</Button>
                    </div>
                  </div>
                )}

                {/* Field list */}
                {formLoading ? (
                  <div style={{ textAlign: "center", padding: "2rem", color: "#555" }}><Spinner /></div>
                ) : formFields.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "3rem 2rem", background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, color: "#555" }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
                    <div style={{ fontSize: 13, marginBottom: 4 }}>No custom fields yet</div>
                    <div style={{ fontSize: 11 }}>Add fields to collect extra info at registration time.</div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {formFields.map((field, idx) => {
                      const typeIcon: Record<string, string> = { text: "📝", textarea: "📄", select: "📋", number: "#️⃣", date: "📅", checkbox: "☑️" };
                      return (
                        <div key={field.id} style={{ background: "#111", border: `1px solid ${field.is_active ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.03)"}`, borderRadius: 10, padding: "10px 14px", opacity: field.is_active ? 1 : 0.5 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 16, flexShrink: 0 }}>{typeIcon[field.field_type] ?? "📝"}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{field.label}</span>
                                {field.required && <span style={{ fontSize: 10, background: "rgba(248,113,113,0.12)", color: "#f87171", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>Required</span>}
                                {!field.is_active && <span style={{ fontSize: 10, color: "#555", fontWeight: 600 }}>Hidden</span>}
                              </div>
                              <div style={{ fontSize: 11, color: "#555", marginTop: 1 }}>
                                key: <code style={{ color: "#666" }}>{field.field_key}</code>
                                {field.options?.length > 0 && ` · ${field.options.length} options`}
                                {field.placeholder && ` · "${field.placeholder}"`}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                              <button onClick={() => moveField(field.id, "up")}   disabled={idx === 0}                    title="Move up"   style={{ padding: "3px 7px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, color: idx === 0 ? "#333" : "#aaa", cursor: idx === 0 ? "default" : "pointer", fontSize: 11 }}>↑</button>
                              <button onClick={() => moveField(field.id, "down")} disabled={idx === formFields.length-1} title="Move down" style={{ padding: "3px 7px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, color: idx === formFields.length-1 ? "#333" : "#aaa", cursor: idx === formFields.length-1 ? "default" : "pointer", fontSize: 11 }}>↓</button>
                              <button onClick={() => toggleFieldActive(field)} title={field.is_active ? "Hide" : "Show"} style={{ padding: "3px 7px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, color: "#aaa", cursor: "pointer", fontSize: 11 }}>{field.is_active ? "Hide" : "Show"}</button>
                              <button onClick={() => deleteField(field.id)} title="Delete" style={{ padding: "3px 7px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 5, color: "#f87171", cursor: "pointer", fontSize: 11 }}>Del</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {formFields.length > 0 && (
                  <div style={{ fontSize: 11, color: "#444", marginTop: 14, textAlign: "center" }}>
                    {formFields.filter(f => f.is_active).length} active field{formFields.filter(f => f.is_active).length !== 1 ? "s" : ""} · registrants will see these after the standard form
                  </div>
                )}
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
