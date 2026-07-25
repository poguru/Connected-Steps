"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Button, Badge, Label, Alert, Spinner } from "@/components/ui/ds";

const RichTextEditor = dynamic(() => import("@/components/admin/RichEmailEditor"), { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────

interface FaqItem { question: string; answer: string }

interface EventFields {
  id: string;
  title: string;
  short_description: string;
  description: string;
  event_type: string;
  event_category: string;
  cover_image: string;
  banner_image: string;
  gallery_images: string[];
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  location: string;
  meeting_point: string;
  maps_url: string;
  registration_opens_at: string;
  registration_closes_at: string;
  early_bird_ends_at: string;
  max_participants: number | null;
  waiting_list_enabled: boolean;
  require_login: boolean;
  terms_conditions: string;
  refund_policy: string;
  cancellation_policy: string;
  faqs: FaqItem[];
  highlights: string[];
  organizer: string;
  organizer_email: string;
  organizer_phone: string;
  support_email: string;
  support_phone: string;
  website: string;
  status: string;
  share_slug: string;
  visibility: string;
  participant_count: number;
}

interface Sponsor {
  id: string;
  name: string;
  tier: string;
  logo_url: string | null;
  website_url: string | null;
  description: string | null;
  display_order: number;
  visible: boolean;
}

interface ChangeEntry {
  id: string;
  changed_by: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  changed_at: string;
}

type TabKey = "general" | "schedule" | "registration" | "media" | "content" | "sponsors" | "log";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TIER_LABELS: Record<string, string> = {
  title:       "Title Sponsor",
  sports:      "Sports Partner",
  refreshment: "Refreshment Partner",
  hydration:   "Hydration Partner",
  medical:     "Medical Partner",
  photography: "Photography Partner",
  community:   "Community Partner",
  support:     "Support Partner",
  partner:     "Partner",
  organizer:   "Organizer",
  powered_by:  "Powered By",
};

const EVENT_TYPES     = ["running","cycling","training","race","community","workshop"];
const EVENT_CATS      = ["community","marathon","corporate","virtual","walkathon","cycling","triathlon"];
const VISIBILITY_OPTS = ["public","private","unlisted"];

function toLocalDatetime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return ""; }
}

function fieldLabel(field: string): string {
  const map: Record<string, string> = {
    title: "Event Name", short_description: "Short Description", description: "Full Description",
    event_type: "Event Type", event_category: "Event Category",
    cover_image: "Poster Image", banner_image: "Banner Image", gallery_images: "Gallery Images",
    start_date: "Start Date", end_date: "End Date", start_time: "Start Time", end_time: "End Time",
    location: "Venue", meeting_point: "Meeting Point", maps_url: "Google Maps URL",
    registration_opens_at: "Registration Opens", registration_closes_at: "Registration Closes",
    early_bird_ends_at: "Early Bird Ends",
    max_participants: "Total Slots", waiting_list_enabled: "Waitlist", require_login: "Login Required",
    terms_conditions: "Terms & Conditions", refund_policy: "Refund Policy",
    cancellation_policy: "Cancellation Policy", faqs: "FAQs", highlights: "Highlights",
    organizer: "Organizer", organizer_email: "Organizer Email", organizer_phone: "Organizer Phone",
    support_email: "Support Email", support_phone: "Support Phone", website: "Website",
    visibility: "Visibility",
  };
  return map[field] ?? field;
}

function formatVal(v: string | null): string {
  if (v == null) return "—";
  try {
    const parsed = JSON.parse(v);
    if (Array.isArray(parsed)) return `[${parsed.length} items]`;
    if (typeof parsed === "object") return JSON.stringify(parsed).slice(0, 80);
    return String(parsed).slice(0, 120);
  } catch { return v.slice(0, 120); }
}

// ── Shared sub-components ─────────────────────────────────────────────────────

const S = {
  page:   { minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "inherit" } as React.CSSProperties,
  header: { position: "sticky" as const, top: 0, zIndex: 40, background: "rgba(10,10,10,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 1.5rem", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  input:  { width: "100%", padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const },
  select: { width: "100%", padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const },
  card:   { background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "20px 20px" },
  row:    { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 } as React.CSSProperties,
};

function SectionHead({ title, desc }: { title: string; desc?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: "#fff" }}>{title}</div>
      {desc && <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>{desc}</div>}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {hint && <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>{hint}</div>}
      {children}
    </div>
  );
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => onChange(!value)}>
      <div style={{ width: 36, height: 20, borderRadius: 10, background: value ? "#e8620a" : "rgba(255,255,255,0.1)", position: "relative", transition: "background .2s", flexShrink: 0 }}>
        <div style={{ position: "absolute", top: 2, left: value ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
      </div>
      <span style={{ fontSize: 13, color: "#ccc" }}>{label}</span>
    </div>
  );
}

// ── Image uploader ────────────────────────────────────────────────────────────

function ImageUploader({
  eventId, purpose, currentUrl, onUploaded,
  hint, width = "100%", height = 160,
}: {
  eventId: string;
  purpose: string;
  currentUrl: string;
  onUploaded: (url: string) => void;
  hint?: string;
  width?: string | number;
  height?: number;
}) {
  const [uploading, setUploading] = useState(false);
  const [error,     setError]     = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("purpose", purpose);
      const res  = await fetch(`/api/admin/events/${eventId}/upload`, { method: "POST", body: fd });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) { setError(data.error ?? "Upload failed"); return; }
      onUploaded(data.url);
    } catch { setError("Network error"); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  return (
    <div style={{ width }}>
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        style={{ width: "100%", height, border: `2px dashed ${currentUrl ? "rgba(232,98,10,0.4)" : "rgba(255,255,255,0.12)"}`, borderRadius: 10, overflow: "hidden", position: "relative", cursor: uploading ? "wait" : "pointer", background: "#0d0d0d", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {currentUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentUrl} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity .2s" }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "0")}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>Click to replace</span>
            </div>
          </>
        ) : (
          <div style={{ textAlign: "center", color: "#555" }}>
            {uploading ? <Spinner size={16} /> : <><div style={{ fontSize: 28, marginBottom: 6 }}>📷</div><div style={{ fontSize: 12 }}>Click to upload</div></>}
          </div>
        )}
        {uploading && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Spinner size={16} />
          </div>
        )}
      </div>
      {hint && <div style={{ fontSize: 10, color: "#555", marginTop: 4 }}>{hint}</div>}
      {error && <div style={{ fontSize: 11, color: "#f87171", marginTop: 4 }}>{error}</div>}
      {currentUrl && (
        <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
          <input value={currentUrl} readOnly style={{ ...S.input, fontSize: 10, color: "#555", flex: 1 }} />
          <button onClick={() => onUploaded("")} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 18, padding: "0 4px", lineHeight: 1 }} title="Remove image">×</button>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/svg+xml" style={{ display: "none" }} onChange={handleFile} />
    </div>
  );
}

// ── FAQ editor ────────────────────────────────────────────────────────────────

function FaqEditor({ faqs, onChange }: { faqs: FaqItem[]; onChange: (f: FaqItem[]) => void }) {
  function update(i: number, key: keyof FaqItem, v: string) {
    const next = faqs.map((f, idx) => idx === i ? { ...f, [key]: v } : f);
    onChange(next);
  }
  function remove(i: number) { onChange(faqs.filter((_, idx) => idx !== i)); }
  function add() { onChange([...faqs, { question: "", answer: "" }]); }

  return (
    <div>
      {faqs.map((faq, i) => (
        <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "12px 14px", marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: ".06em" }}>FAQ #{i + 1}</span>
            <button onClick={() => remove(i)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 2px" }}>×</button>
          </div>
          <div style={{ marginBottom: 8 }}>
            <Label>Question</Label>
            <input style={S.input} value={faq.question} onChange={e => update(i, "question", e.target.value)} placeholder="What is…?" />
          </div>
          <div>
            <Label>Answer</Label>
            <textarea style={{ ...S.input, resize: "vertical", minHeight: 70 }} value={faq.answer} onChange={e => update(i, "answer", e.target.value)} placeholder="Answer…" />
          </div>
        </div>
      ))}
      <button onClick={add} style={{ padding: "8px 16px", background: "rgba(232,98,10,0.1)", border: "1px solid rgba(232,98,10,0.25)", borderRadius: 8, color: "#e8620a", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
        + Add FAQ
      </button>
    </div>
  );
}

// ── Highlights editor ─────────────────────────────────────────────────────────

function HighlightsEditor({ items, onChange }: { items: string[]; onChange: (v: string[]) => void }) {
  function update(i: number, v: string) { onChange(items.map((x, idx) => idx === i ? v : x)); }
  function remove(i: number) { onChange(items.filter((_, idx) => idx !== i)); }
  function add() { onChange([...items, ""]); }
  return (
    <div>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
          <span style={{ color: "#e8620a", fontSize: 14, flexShrink: 0 }}>•</span>
          <input style={{ ...S.input, flex: 1 }} value={item} onChange={e => update(i, e.target.value)} placeholder="Event highlight…" />
          <button onClick={() => remove(i)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 4px", flexShrink: 0 }}>×</button>
        </div>
      ))}
      <button onClick={add} style={{ padding: "7px 14px", background: "rgba(232,98,10,0.1)", border: "1px solid rgba(232,98,10,0.25)", borderRadius: 8, color: "#e8620a", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
        + Add Highlight
      </button>
    </div>
  );
}

// ── Save-section button row ───────────────────────────────────────────────────

function SaveRow({
  eventId, fields, reason, onSaved, saving, setSaving, setToast,
}: {
  eventId: string;
  fields: Record<string, unknown>;
  reason: string;
  onSaved: (updated: EventFields) => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
  setToast: (m: string) => void;
}) {
  async function save() {
    setSaving(true);
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields, reason: reason.trim() || undefined }),
      });
      const data = await res.json() as { event?: EventFields; changes?: number; error?: string; confirmed_count?: number };
      if (!res.ok) {
        setToast(`❌ ${data.error ?? "Save failed"}`);
      } else {
        setToast(`✅ Saved ${data.changes ?? 0} change${data.changes !== 1 ? "s" : ""}`);
        if (data.event) onSaved(data.event as EventFields);
      }
    } catch {
      setToast("❌ Network error — please try again");
    } finally { setSaving(false); }
  }

  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
      <Button onClick={save} loading={saving} size="sm">Save Changes</Button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EditEventPage() {
  const params  = useParams();
  const eventId = params.id as string;

  const [ev,             setEv]             = useState<EventFields | null>(null);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [sponsors,       setSponsors]       = useState<Sponsor[]>([]);
  const [changeLog,      setChangeLog]      = useState<ChangeEntry[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [tab,            setTab]            = useState<TabKey>("general");
  const [saving,         setSaving]         = useState(false);
  const [toast,          setToastState]     = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Per-tab form state
  const [general,      setGeneral]      = useState<Partial<EventFields>>({});
  const [schedule,     setSchedule]     = useState<Partial<EventFields>>({});
  const [registration, setRegistration] = useState<Partial<EventFields>>({});
  const [content,      setContent]      = useState<Partial<EventFields>>({});

  // Reason for change (shared)
  const [reason, setReason] = useState("");

  // Sponsor state
  const [sponsorAdding,      setSponsorAdding]      = useState(false);
  const [newSponsor,         setNewSponsor]         = useState({ name: "", tier: "community", website_url: "" });
  const [sponsorUploading,   setSponsorUploading]   = useState<string | null>(null);
  const [sponsorUploadTarget, setSponsorUploadTarget] = useState<string | null>(null);
  const sponsorLogoInputRef = useRef<HTMLInputElement>(null);

  function setToast(msg: string) {
    setToastState(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastState(""), 3500);
  }

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    const [evRes, spRes, logRes] = await Promise.all([
      fetch(`/api/admin/events/${eventId}/edit`),
      fetch(`/api/admin/events/${eventId}/sponsors`),
      fetch(`/api/admin/events/${eventId}/change-log?limit=50`),
    ]);
    const evData  = await evRes.json()  as { event?: EventFields; confirmed_count?: number };
    const spData  = await spRes.json()  as { sponsors?: Sponsor[] };
    const logData = await logRes.json() as { log?: ChangeEntry[] };

    if (evData.event) {
      const e = evData.event;
      setEv(e);
      setConfirmedCount(evData.confirmed_count ?? 0);
      // Seed per-tab form state
      setGeneral({
        title: e.title, short_description: e.short_description ?? "",
        description: e.description ?? "", event_type: e.event_type,
        event_category: e.event_category, visibility: e.visibility,
        organizer: e.organizer ?? "", organizer_email: e.organizer_email ?? "",
        organizer_phone: e.organizer_phone ?? "", support_email: e.support_email ?? "",
        support_phone: e.support_phone ?? "", website: e.website ?? "",
      });
      setSchedule({
        start_date: e.start_date ?? "", end_date: e.end_date ?? "",
        start_time: e.start_time ?? "", end_time: e.end_time ?? "",
        location: e.location ?? "", meeting_point: e.meeting_point ?? "",
        maps_url: e.maps_url ?? "",
        registration_opens_at:  toLocalDatetime(e.registration_opens_at),
        registration_closes_at: toLocalDatetime(e.registration_closes_at),
        early_bird_ends_at:     toLocalDatetime(e.early_bird_ends_at),
      });
      setRegistration({
        max_participants:     e.max_participants,
        waiting_list_enabled: e.waiting_list_enabled,
        require_login:        e.require_login,
      });
      setContent({
        terms_conditions:    e.terms_conditions ?? "",
        refund_policy:       e.refund_policy ?? "",
        cancellation_policy: e.cancellation_policy ?? "",
        faqs:       Array.isArray(e.faqs) ? e.faqs : [],
        highlights: Array.isArray(e.highlights) ? e.highlights : [],
      });
    }
    setSponsors(spData.sponsors ?? []);
    setChangeLog(logData.log ?? []);
    setLoading(false);
  }, [eventId]);

  useEffect(() => { void load(); }, [load]);

  // ── Immediate-save image upload helpers ─────────────────────────────────────

  async function saveField(field: string, value: unknown) {
    const res  = await fetch(`/api/admin/events/${eventId}/edit`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { [field]: value }, reason: `${fieldLabel(field)} updated` }),
    });
    const data = await res.json() as { event?: EventFields; error?: string };
    if (!res.ok) { setToast(`❌ ${data.error ?? "Save failed"}`); return; }
    if (data.event) setEv(data.event as EventFields);
    setToast(`✅ ${fieldLabel(field)} updated`);
    void fetch(`/api/admin/events/${eventId}/change-log?limit=50`)
      .then(r => r.json())
      .then((d: { log?: ChangeEntry[] }) => setChangeLog(d.log ?? []));
  }

  async function addGalleryImage(url: string) {
    const current = ev?.gallery_images ?? [];
    await saveField("gallery_images", [...current, url]);
  }
  async function removeGalleryImage(url: string) {
    const current = (ev?.gallery_images ?? []).filter(u => u !== url);
    await saveField("gallery_images", current);
  }

  // ── Sponsor CRUD ─────────────────────────────────────────────────────────────

  async function addSponsor() {
    if (!newSponsor.name.trim()) { setToast("❌ Sponsor name required"); return; }
    const res  = await fetch(`/api/admin/events/${eventId}/sponsors`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newSponsor.name, tier: newSponsor.tier, website_url: newSponsor.website_url || null, display_order: sponsors.length }),
    });
    const data = await res.json() as { sponsor?: Sponsor };
    if (data.sponsor) { setSponsors(s => [...s, data.sponsor!]); setNewSponsor({ name: "", tier: "community", website_url: "" }); setSponsorAdding(false); setToast("✅ Sponsor added"); }
    else setToast("❌ Failed to add sponsor");
  }

  async function deleteSponsor(sid: string) {
    if (!confirm("Remove this sponsor?")) return;
    const res = await fetch(`/api/admin/events/${eventId}/sponsors`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sponsor_id: sid }),
    });
    if (res.ok) { setSponsors(s => s.filter(x => x.id !== sid)); setToast("✅ Sponsor removed"); }
    else setToast("❌ Failed to remove sponsor");
  }

  async function uploadSponsorLogo(sid: string, file: File) {
    setSponsorUploading(sid);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("purpose", "sponsor-logo");
      const res  = await fetch(`/api/admin/events/${eventId}/upload`, { method: "POST", body: fd });
      const data = await res.json() as { url?: string; error?: string };
      if (!data.url) { setToast(`❌ ${data.error ?? "Upload failed"}`); return; }
      // Update the sponsor record with the new logo URL
      const patchRes  = await fetch(`/api/admin/events/${eventId}/sponsors`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sponsor_id: sid, logo_url: data.url }),
      });
      const patchData = await patchRes.json() as { sponsor?: Sponsor };
      if (patchData.sponsor) { setSponsors(s => s.map(x => x.id === sid ? patchData.sponsor! : x)); setToast("✅ Logo uploaded"); }
    } catch { setToast("❌ Network error"); }
    finally { setSponsorUploading(null); }
  }

  async function toggleSponsorVisible(sid: string, visible: boolean) {
    const res  = await fetch(`/api/admin/events/${eventId}/sponsors`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sponsor_id: sid, visible }),
    });
    const data = await res.json() as { sponsor?: Sponsor };
    if (data.sponsor) setSponsors(s => s.map(x => x.id === sid ? data.sponsor! : x));
  }

  async function moveSponsor(sid: string, dir: -1 | 1) {
    const idx  = sponsors.findIndex(s => s.id === sid);
    const next = idx + dir;
    if (next < 0 || next >= sponsors.length) return;
    const reordered = [...sponsors];
    [reordered[idx], reordered[next]] = [reordered[next], reordered[idx]];
    // Persist display_order for both swapped items
    setSponsors(reordered);
    await Promise.all([
      fetch(`/api/admin/events/${eventId}/sponsors`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sponsor_id: reordered[idx].id,  display_order: idx }),
      }),
      fetch(`/api/admin/events/${eventId}/sponsors`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sponsor_id: reordered[next].id, display_order: next }),
      }),
    ]);
  }

  // ── onSaved callback ─────────────────────────────────────────────────────────

  function onSaved(updated: EventFields) {
    setEv(updated);
    void fetch(`/api/admin/events/${eventId}/change-log?limit=50`)
      .then(r => r.json())
      .then((d: { log?: ChangeEntry[] }) => setChangeLog(d.log ?? []));
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const TABS: { key: TabKey; label: string }[] = [
    { key: "general",      label: "✏️ General"      },
    { key: "schedule",     label: "📅 Schedule"     },
    { key: "registration", label: "🎫 Registration" },
    { key: "media",        label: "🖼 Media"         },
    { key: "content",      label: "📄 Content"      },
    { key: "sponsors",     label: "🤝 Sponsors"     },
    { key: "log",          label: `📋 Log (${changeLog.length})` },
  ];

  if (loading) {
    return (
      <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <Spinner />
      </div>
    );
  }

  if (!ev) {
    return (
      <div style={{ ...S.page, padding: "2rem" }}>
        <Alert variant="error">Event not found or you do not have access.</Alert>
        <Link href="/admin/events" style={{ color: "#e8620a", textDecoration: "none", fontSize: 13, marginTop: 16, display: "block" }}>← Back to Events</Link>
      </div>
    );
  }

  return (
    <div style={S.page}>
      {/* Sticky header */}
      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <Link href={`/admin/events/${eventId}/manage`} style={{ color: "#555", fontSize: 13, textDecoration: "none", flexShrink: 0 }}>← Event Hub</Link>
          <span style={{ color: "#333" }}>/</span>
          <span style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#fff" }}>
            Edit: {ev.title}
          </span>
          <Badge color={ev.status === "published" ? "green" : "yellow"}>{ev.status}</Badge>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {ev.share_slug && (
            <Link href={`/events/${ev.share_slug}`} target="_blank" style={{ textDecoration: "none" }}>
              <Button size="sm" variant="ghost">↗ View Live</Button>
            </Link>
          )}
        </div>
      </header>

      {/* Reason for change (optional, applies to all saves in this session) */}
      <div style={{ background: "rgba(232,98,10,0.05)", borderBottom: "1px solid rgba(232,98,10,0.1)", padding: "10px 1.5rem", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 11, color: "#666", flexShrink: 0, fontWeight: 700 }}>Reason for edits (optional):</span>
        <input
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="e.g. Venue change, corrected start time…"
          style={{ ...S.input, flex: 1, maxWidth: 440, fontSize: 11, padding: "6px 10px" }}
        />
        <span style={{ fontSize: 10, color: "#444" }}>Saved in the Change Log for audit</span>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", overflowX: "auto", whiteSpace: "nowrap" }}>
        <div style={{ display: "inline-flex", padding: "0 1.5rem" }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ padding: "12px 14px", background: "none", border: "none", borderBottom: `2px solid ${tab === t.key ? "#e8620a" : "transparent"}`, color: tab === t.key ? "#e8620a" : "#555", fontSize: 12, fontWeight: tab === t.key ? 700 : 400, cursor: "pointer", fontFamily: "inherit", transition: "color .15s", whiteSpace: "nowrap" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "1.5rem" }}>

        {/* ── GENERAL ─────────────────────────────────────────────────────────── */}
        {tab === "general" && (
          <div style={S.card}>
            <SectionHead title="General Information" desc="Core event details visible to participants" />
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Field label="Event Name *">
                <input style={S.input} value={general.title ?? ""} onChange={e => setGeneral(g => ({ ...g, title: e.target.value }))} placeholder="Event name" />
              </Field>

              <Field label="Short Description" hint="One-line summary for event listings (max 200 chars)">
                <input style={S.input} value={general.short_description ?? ""} onChange={e => setGeneral(g => ({ ...g, short_description: e.target.value }))} placeholder="Brief description for event cards" maxLength={200} />
                <div style={{ fontSize: 10, color: "#555", marginTop: 3 }}>{(general.short_description ?? "").length}/200</div>
              </Field>

              <Field label="Full Description" hint="Shown on the event landing page. Supports rich formatting.">
                <div style={{ minHeight: 260, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, overflow: "hidden" }}>
                  <RichTextEditor
                    content={general.description ?? ""}
                    onChange={(html) => setGeneral(g => ({ ...g, description: html }))}
                    minHeight={240}
                  />
                </div>
              </Field>

              <div style={S.row}>
                <Field label="Event Type">
                  <select style={S.select} value={general.event_type ?? "running"} onChange={e => setGeneral(g => ({ ...g, event_type: e.target.value }))}>
                    {EVENT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </Field>
                <Field label="Event Category">
                  <select style={S.select} value={general.event_category ?? "community"} onChange={e => setGeneral(g => ({ ...g, event_category: e.target.value }))}>
                    {EVENT_CATS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="Visibility">
                <select style={S.select} value={general.visibility ?? "public"} onChange={e => setGeneral(g => ({ ...g, visibility: e.target.value }))}>
                  {VISIBILITY_OPTS.map(v => <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>)}
                </select>
              </Field>

              <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 16 }}>
                <SectionHead title="Contact Details" />
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={S.row}>
                    <Field label="Organizer Name">
                      <input style={S.input} value={general.organizer ?? ""} onChange={e => setGeneral(g => ({ ...g, organizer: e.target.value }))} placeholder="Organizer / Club name" />
                    </Field>
                    <Field label="Website">
                      <input style={S.input} value={general.website ?? ""} onChange={e => setGeneral(g => ({ ...g, website: e.target.value }))} placeholder="https://…" type="url" />
                    </Field>
                  </div>
                  <div style={S.row}>
                    <Field label="Organizer Email">
                      <input style={S.input} value={general.organizer_email ?? ""} onChange={e => setGeneral(g => ({ ...g, organizer_email: e.target.value }))} placeholder="organizer@example.com" type="email" />
                    </Field>
                    <Field label="Organizer Phone">
                      <input style={S.input} value={general.organizer_phone ?? ""} onChange={e => setGeneral(g => ({ ...g, organizer_phone: e.target.value }))} placeholder="+91…" />
                    </Field>
                  </div>
                  <div style={S.row}>
                    <Field label="Support Email">
                      <input style={S.input} value={general.support_email ?? ""} onChange={e => setGeneral(g => ({ ...g, support_email: e.target.value }))} placeholder="support@example.com" type="email" />
                    </Field>
                    <Field label="Support Phone">
                      <input style={S.input} value={general.support_phone ?? ""} onChange={e => setGeneral(g => ({ ...g, support_phone: e.target.value }))} placeholder="+91…" />
                    </Field>
                  </div>
                </div>
              </div>
            </div>
            <SaveRow eventId={eventId} fields={general} reason={reason} onSaved={onSaved} saving={saving} setSaving={setSaving} setToast={setToast} />
          </div>
        )}

        {/* ── SCHEDULE ────────────────────────────────────────────────────────── */}
        {tab === "schedule" && (
          <div style={S.card}>
            <SectionHead title="Schedule & Location" desc="Event dates, times, and venue" />
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={S.row}>
                <Field label="Start Date *">
                  <input style={S.input} type="date" value={schedule.start_date ?? ""} onChange={e => setSchedule(s => ({ ...s, start_date: e.target.value }))} />
                </Field>
                <Field label="End Date">
                  <input style={S.input} type="date" value={schedule.end_date ?? ""} onChange={e => setSchedule(s => ({ ...s, end_date: e.target.value }))} />
                </Field>
              </div>
              <div style={S.row}>
                <Field label="Start Time">
                  <input style={S.input} type="time" value={schedule.start_time ?? ""} onChange={e => setSchedule(s => ({ ...s, start_time: e.target.value }))} />
                </Field>
                <Field label="End Time">
                  <input style={S.input} type="time" value={schedule.end_time ?? ""} onChange={e => setSchedule(s => ({ ...s, end_time: e.target.value }))} />
                </Field>
              </div>
              <Field label="Venue / Location *">
                <input style={S.input} value={schedule.location ?? ""} onChange={e => setSchedule(s => ({ ...s, location: e.target.value }))} placeholder="Event venue name and address" />
              </Field>
              <Field label="Meeting Point" hint="Where participants should assemble before the race">
                <input style={S.input} value={schedule.meeting_point ?? ""} onChange={e => setSchedule(s => ({ ...s, meeting_point: e.target.value }))} placeholder="E.g. Main gate, parking lot A…" />
              </Field>
              <Field label="Google Maps URL">
                <input style={S.input} value={schedule.maps_url ?? ""} onChange={e => setSchedule(s => ({ ...s, maps_url: e.target.value }))} placeholder="https://maps.google.com/…" type="url" />
              </Field>
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 16 }}>
                <SectionHead title="Registration Schedule" />
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={S.row}>
                    <Field label="Registration Opens" hint="Leave blank to open immediately on publish">
                      <input style={S.input} type="datetime-local" value={schedule.registration_opens_at ?? ""} onChange={e => setSchedule(s => ({ ...s, registration_opens_at: e.target.value }))} />
                    </Field>
                    <Field label="Registration Closes">
                      <input style={S.input} type="datetime-local" value={schedule.registration_closes_at ?? ""} onChange={e => setSchedule(s => ({ ...s, registration_closes_at: e.target.value }))} />
                    </Field>
                  </div>
                  <Field label="Early Bird Ends" hint="Price increases after this date if early-bird pricing is configured">
                    <input style={S.input} type="datetime-local" value={schedule.early_bird_ends_at ?? ""} onChange={e => setSchedule(s => ({ ...s, early_bird_ends_at: e.target.value }))} />
                  </Field>
                </div>
              </div>
            </div>
            <SaveRow eventId={eventId} fields={schedule} reason={reason} onSaved={onSaved} saving={saving} setSaving={setSaving} setToast={setToast} />
          </div>
        )}

        {/* ── REGISTRATION ─────────────────────────────────────────────────────── */}
        {tab === "registration" && (
          <div style={S.card}>
            <SectionHead title="Registration Settings" />
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <Field label="Total Slots" hint="Maximum number of confirmed registrations allowed">
                <input
                  style={S.input}
                  type="number"
                  min={confirmedCount}
                  value={registration.max_participants ?? ""}
                  onChange={e => setRegistration(r => ({ ...r, max_participants: e.target.value ? parseInt(e.target.value) : null }))}
                  placeholder="Unlimited"
                />
                <div style={{ marginTop: 8, padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, fontSize: 12 }}>
                  <div style={{ display: "flex", gap: 24 }}>
                    <div>
                      <div style={{ color: "#4ade80", fontWeight: 700, fontSize: 16 }}>{confirmedCount}</div>
                      <div style={{ color: "#555", fontSize: 10, textTransform: "uppercase" }}>Confirmed</div>
                    </div>
                    <div>
                      <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{ev.participant_count}</div>
                      <div style={{ color: "#555", fontSize: 10, textTransform: "uppercase" }}>Registered</div>
                    </div>
                    <div>
                      <div style={{ color: "#60a5fa", fontWeight: 700, fontSize: 16 }}>{registration.max_participants ?? "∞"}</div>
                      <div style={{ color: "#555", fontSize: 10, textTransform: "uppercase" }}>New Limit</div>
                    </div>
                  </div>
                  {registration.max_participants !== null && registration.max_participants !== undefined && (registration.max_participants as number) < confirmedCount && (
                    <div style={{ marginTop: 8, color: "#f87171", fontSize: 11, fontWeight: 700 }}>
                      ⚠️ Cannot set slots below {confirmedCount} — {confirmedCount} confirmed registrations already exist.
                    </div>
                  )}
                </div>
              </Field>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Toggle
                  value={!!registration.waiting_list_enabled}
                  onChange={v => setRegistration(r => ({ ...r, waiting_list_enabled: v }))}
                  label="Enable waiting list (accept registrations beyond capacity)"
                />
                <Toggle
                  value={!!registration.require_login}
                  onChange={v => setRegistration(r => ({ ...r, require_login: v }))}
                  label="Require participants to be logged in to register"
                />
              </div>

              <div style={{ padding: "12px 14px", background: "rgba(96,165,250,0.05)", border: "1px solid rgba(96,165,250,0.15)", borderRadius: 8, fontSize: 11, color: "#60a5fa", lineHeight: 1.7 }}>
                <strong>Note:</strong> Changing slots does not affect existing registrations, payments, or QR codes.
                Decreasing slots below the current confirmed count is not allowed.
              </div>
            </div>
            <SaveRow eventId={eventId} fields={registration} reason={reason} onSaved={onSaved} saving={saving} setSaving={setSaving} setToast={setToast} />
          </div>
        )}

        {/* ── MEDIA ───────────────────────────────────────────────────────────── */}
        {tab === "media" && (
          <div style={S.card}>
            <SectionHead title="Event Media" desc="Images are saved immediately when uploaded." />
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

              <div style={S.row}>
                <Field label="Event Poster / Cover Image" hint="Shown on event listing cards. 600×400px recommended.">
                  <ImageUploader
                    eventId={eventId}
                    purpose="poster"
                    currentUrl={ev.cover_image ?? ""}
                    height={200}
                    hint="JPEG, PNG, WEBP or SVG — max 10 MB"
                    onUploaded={async url => { await saveField("cover_image", url || null); }}
                  />
                </Field>
                <Field label="Banner Image" hint="Wide header image on the event landing page. 1200×400px recommended.">
                  <ImageUploader
                    eventId={eventId}
                    purpose="banner"
                    currentUrl={ev.banner_image ?? ""}
                    height={200}
                    hint="JPEG, PNG, WEBP or SVG — max 10 MB"
                    onUploaded={async url => { await saveField("banner_image", url || null); }}
                  />
                </Field>
              </div>

              <div>
                <Label>Gallery Images</Label>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 10 }}>Displayed in the photo gallery on the event page. Each image is saved immediately on upload.</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
                  {(ev.gallery_images ?? []).map((url, i) => (
                    <div key={i} style={{ position: "relative", height: 120, borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Gallery ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <button
                        onClick={() => removeGalleryImage(url)}
                        style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.7)", border: "none", color: "#f87171", borderRadius: "50%", width: 22, height: 22, cursor: "pointer", fontSize: 14, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        ×
                      </button>
                    </div>
                  ))}
                  {/* Add gallery image slot */}
                  <ImageUploader
                    eventId={eventId}
                    purpose="gallery"
                    currentUrl=""
                    height={120}
                    onUploaded={addGalleryImage}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── CONTENT ─────────────────────────────────────────────────────────── */}
        {tab === "content" && (
          <div style={S.card}>
            <SectionHead title="Event Content" desc="FAQs, highlights, terms, and policies" />
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

              <Field label="Highlights" hint="Key bullet points shown on the event page">
                <HighlightsEditor
                  items={Array.isArray(content.highlights) ? (content.highlights as string[]) : []}
                  onChange={v => setContent(c => ({ ...c, highlights: v }))}
                />
              </Field>

              <Field label="FAQs" hint="Frequently asked questions shown on the event landing page">
                <FaqEditor
                  faqs={Array.isArray(content.faqs) ? (content.faqs as FaqItem[]) : []}
                  onChange={v => setContent(c => ({ ...c, faqs: v }))}
                />
              </Field>

              <Field label="Terms & Conditions">
                <textarea
                  style={{ ...S.input, resize: "vertical", minHeight: 120 }}
                  value={content.terms_conditions ?? ""}
                  onChange={e => setContent(c => ({ ...c, terms_conditions: e.target.value }))}
                  placeholder="Participation terms, waivers, and conditions…"
                />
              </Field>

              <div style={S.row}>
                <Field label="Refund Policy">
                  <textarea
                    style={{ ...S.input, resize: "vertical", minHeight: 80 }}
                    value={content.refund_policy ?? ""}
                    onChange={e => setContent(c => ({ ...c, refund_policy: e.target.value }))}
                    placeholder="Refund terms…"
                  />
                </Field>
                <Field label="Cancellation Policy">
                  <textarea
                    style={{ ...S.input, resize: "vertical", minHeight: 80 }}
                    value={content.cancellation_policy ?? ""}
                    onChange={e => setContent(c => ({ ...c, cancellation_policy: e.target.value }))}
                    placeholder="Cancellation terms…"
                  />
                </Field>
              </div>
            </div>
            <SaveRow eventId={eventId} fields={content} reason={reason} onSaved={onSaved} saving={saving} setSaving={setSaving} setToast={setToast} />
          </div>
        )}

        {/* ── SPONSORS ─────────────────────────────────────────────────────────── */}
        {tab === "sponsors" && (
          <div style={S.card}>
            <SectionHead title="Sponsors & Partners" desc="Logos are saved immediately when uploaded. Changes appear live on the event page." />

            {sponsors.length === 0 && !sponsorAdding && (
              <div style={{ textAlign: "center", padding: "32px 0", color: "#555" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🤝</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No sponsors yet</div>
                <div style={{ fontSize: 11, marginBottom: 16 }}>Add your first sponsor to display their logo on the event page.</div>
              </div>
            )}

            {/* Shared file input for all sponsor logo uploads */}
            <input
              ref={sponsorLogoInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp,image/svg+xml"
              style={{ display: "none" }}
              onChange={async e => {
                const file = e.target.files?.[0];
                if (file && sponsorUploadTarget) await uploadSponsorLogo(sponsorUploadTarget, file);
                e.target.value = "";
                setSponsorUploadTarget(null);
              }}
            />

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              {sponsors.map((sp, idx) => (
                  <div key={sp.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", background: sp.visible ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.01)", border: `1px solid rgba(255,255,255,${sp.visible ? "0.08" : "0.04"})`, borderRadius: 10, opacity: sp.visible ? 1 : 0.5 }}>

                    {/* Logo */}
                    <div
                      style={{ width: 56, height: 56, borderRadius: 8, border: "1px dashed rgba(255,255,255,0.12)", background: "#0d0d0d", overflow: "hidden", flexShrink: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                      onClick={() => { if (!sponsorUploading) { setSponsorUploadTarget(sp.id); sponsorLogoInputRef.current?.click(); } }}
                      title="Click to upload logo">
                      {sponsorUploading === sp.id ? (
                        <Spinner size={16} />
                      ) : sp.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={sp.logo_url} alt={sp.name} style={{ width: "100%", height: "100%", objectFit: "contain", padding: 4 }} />
                      ) : (
                        <span style={{ fontSize: 22 }}>🏷</span>
                      )}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#fff" }}>{sp.name}</div>
                      <div style={{ fontSize: 11, color: "#555" }}>{TIER_LABELS[sp.tier] ?? sp.tier}{sp.website_url ? ` · ${sp.website_url}` : ""}</div>
                      <div style={{ fontSize: 10, color: "#444", marginTop: 2 }}>Click logo to upload/replace image</div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <button onClick={() => moveSponsor(sp.id, -1)} disabled={idx === 0}
                        style={{ padding: "5px 8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "#888", fontSize: 12, cursor: idx === 0 ? "default" : "pointer", opacity: idx === 0 ? 0.3 : 1, fontFamily: "inherit" }}>↑</button>
                      <button onClick={() => moveSponsor(sp.id, 1)} disabled={idx === sponsors.length - 1}
                        style={{ padding: "5px 8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "#888", fontSize: 12, cursor: idx === sponsors.length - 1 ? "default" : "pointer", opacity: idx === sponsors.length - 1 ? 0.3 : 1, fontFamily: "inherit" }}>↓</button>
                      <button onClick={() => toggleSponsorVisible(sp.id, !sp.visible)}
                        style={{ padding: "5px 8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: sp.visible ? "#4ade80" : "#555", fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>
                        {sp.visible ? "Shown" : "Hidden"}
                      </button>
                      <button onClick={() => deleteSponsor(sp.id)}
                        style={{ padding: "5px 8px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 6, color: "#f87171", fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>
                        Remove
                      </button>
                    </div>
                  </div>
              ))}
            </div>

            {/* Add sponsor form */}
            {sponsorAdding ? (
              <div style={{ padding: "14px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={S.row}>
                    <Field label="Sponsor / Partner Name *">
                      <input style={S.input} value={newSponsor.name} onChange={e => setNewSponsor(s => ({ ...s, name: e.target.value }))} placeholder="Company or organisation name" />
                    </Field>
                    <Field label="Category">
                      <select style={S.select} value={newSponsor.tier} onChange={e => setNewSponsor(s => ({ ...s, tier: e.target.value }))}>
                        {Object.entries(TIER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label="Website (optional)">
                    <input style={S.input} value={newSponsor.website_url} onChange={e => setNewSponsor(s => ({ ...s, website_url: e.target.value }))} placeholder="https://…" type="url" />
                  </Field>
                  <div style={{ fontSize: 11, color: "#555" }}>After adding, click the logo placeholder to upload an image.</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button size="sm" onClick={addSponsor}>Add Sponsor</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setSponsorAdding(false); setNewSponsor({ name: "", tier: "community", website_url: "" }); }}>Cancel</Button>
                  </div>
                </div>
              </div>
            ) : (
              <button onClick={() => setSponsorAdding(true)}
                style={{ width: "100%", padding: "12px", background: "rgba(232,98,10,0.06)", border: "1px dashed rgba(232,98,10,0.25)", borderRadius: 10, color: "#e8620a", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                + Add Sponsor / Partner
              </button>
            )}
          </div>
        )}

        {/* ── CHANGE LOG ─────────────────────────────────────────────────────── */}
        {tab === "log" && (
          <div style={S.card}>
            <SectionHead title="Change Log" desc="Full audit history of all edits to this event" />
            {changeLog.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0", color: "#555" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>No changes recorded yet</div>
                <div style={{ fontSize: 11, marginTop: 4 }}>All future edits will appear here.</div>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                      {["Date & Time", "Changed By", "Field", "Previous Value", "New Value", "Reason"].map(h => (
                        <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {changeLog.map(entry => (
                      <tr key={entry.id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ padding: "8px 10px", color: "#888", whiteSpace: "nowrap", fontSize: 11 }}>
                          {new Date(entry.changed_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td style={{ padding: "8px 10px", color: "#aaa", fontWeight: 600 }}>{entry.changed_by}</td>
                        <td style={{ padding: "8px 10px" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#e8620a" }}>{fieldLabel(entry.field_name)}</span>
                        </td>
                        <td style={{ padding: "8px 10px", color: "#666", fontFamily: "monospace", fontSize: 10, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {formatVal(entry.old_value)}
                        </td>
                        <td style={{ padding: "8px 10px", color: "#ccc", fontFamily: "monospace", fontSize: 10, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {formatVal(entry.new_value)}
                        </td>
                        <td style={{ padding: "8px 10px", color: "#555", fontSize: 11, maxWidth: 200 }}>{entry.reason ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 24, padding: "10px 20px", fontSize: 13, fontWeight: 600, color: "#fff", zIndex: 9999, whiteSpace: "nowrap", pointerEvents: "none" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
