"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Button, Alert, Spinner } from "@/components/ui/ds";
import { EventFormBuilder } from "@/components/admin/EventFormBuilder";
import CreatableSelect, { type SelectOption } from "@/components/ui/CreatableSelect";

// ── TipTap (lazy-loaded) ──────────────────────────────────────────────────────

const RichTextEditor = dynamic(
  () => import("@/components/admin/RichEmailEditor"),
  {
    ssr: false,
    loading: () => (
      <div className="wiz-input" style={{ minHeight: 160, display: "flex", alignItems: "center", justifyContent: "center", color: "#333", fontSize: 12 }}>
        Loading editor…
      </div>
    ),
  }
);

// ── Types ─────────────────────────────────────────────────────────────────────

interface FaqItem { question: string; answer: string; }

interface RegConfig {
  require_gender:           boolean;
  require_dob:              boolean;
  require_blood_group:      boolean;
  require_emergency_contact: boolean;
  show_notes:               boolean;
  notes_label:              string;
  notes_placeholder:        string;
}

interface RacePerks {
  medal: boolean; bib: boolean; tshirt: boolean;
  breakfast: boolean; certificate: boolean; goodies: boolean;
}

interface RaceForm {
  id?:                string;
  name:               string;
  distance:           string;
  price:              string;
  early_bird_price:   string;
  price_type:         "per_participant" | "per_registration";
  min_participants:   string;
  max_participants:   string;
  max_slots:          string;
  reporting_time:     string;
  gun_time:           string;
  timing_chip:        boolean;
  auto_bib:           boolean;
  bib_prefix:         string;
  gender_restriction: string;
  min_age:            string;
  max_age:            string;
  description:        string;
  perks:              RacePerks;
}

interface WizardState {
  title:                  string;
  short_description:      string;
  event_category:         string;
  event_type:             string;
  description:            string;
  start_date:             string;
  end_date:               string;
  start_time:             string;
  end_time:               string;
  location:               string;
  meeting_point:          string;
  maps_url:               string;
  organizer:              string;
  organizer_email:        string;
  organizer_phone:        string;
  support_email:          string;
  cover_image:            string;
  banner_image:           string;
  website:                string;
  registration_opens_at:  string;
  registration_closes_at: string;
  early_bird_ends_at:     string;
  max_participants:       string;
  waiting_list_enabled:   boolean;
  require_login:          boolean;
  approval_required:      boolean;
  collect_tshirt:         boolean;
  refund_policy:          string;
  cancellation_policy:    string;
  terms_conditions:       string;
  visibility:             string;
  highlights:             string[];
  faqs:                   FaqItem[];
  gallery_images:         string[];
  whatsapp_community_url: string;
}

interface EventTemplate {
  id:                   string;
  name:                 string;
  event_category:       string;
  event_type:           string;
  event_description:    string | null;
  organizer:            string | null;
  organizer_email:      string | null;
  organizer_phone:      string | null;
  support_email:        string | null;
  website:              string | null;
  cover_image:          string | null;
  max_participants:     number | null;
  waiting_list_enabled: boolean;
  require_login:        boolean;
  approval_required:    boolean;
  collect_tshirt:       boolean;
  refund_policy:        string | null;
  cancellation_policy:  string | null;
  visibility:           string;
  races:                RaceForm[];
  created_at:           string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BLANK: WizardState = {
  title: "", short_description: "", event_category: "community", event_type: "running",
  description: "", start_date: "", end_date: "", start_time: "", end_time: "",
  location: "", meeting_point: "", maps_url: "",
  organizer: "Connected Steps", organizer_email: "info@connectedsteps.in",
  organizer_phone: "+91 97036 20570", support_email: "info@connectedsteps.in",
  cover_image: "", banner_image: "", website: "",
  registration_opens_at: "", registration_closes_at: "", early_bird_ends_at: "",
  max_participants: "",
  waiting_list_enabled: false, require_login: true, approval_required: false,
  collect_tshirt: false,
  refund_policy: "", cancellation_policy: "", terms_conditions: "",
  visibility: "public",
  highlights: [], faqs: [], gallery_images: [],
  whatsapp_community_url: "",
};

const BLANK_RACE: RaceForm = {
  name: "", distance: "", price: "", early_bird_price: "",
  price_type: "per_participant", min_participants: "1", max_participants: "1",
  max_slots: "", reporting_time: "", gun_time: "", timing_chip: false, auto_bib: false,
  bib_prefix: "", gender_restriction: "", min_age: "", max_age: "", description: "",
  perks: { medal: false, bib: true, tshirt: false, breakfast: false, certificate: false, goodies: false },
};

const REG_CONFIG_BLANK: RegConfig = {
  require_gender:            true,
  require_dob:               true,
  require_blood_group:       true,
  require_emergency_contact: true,
  show_notes:                true,
  notes_label:               "Notes / Special Requests",
  notes_placeholder:         "Medical conditions, dietary needs, or any questions. Enter NA if none.",
};

const STEPS = [
  { label: "Event Details",    icon: "📋" },
  { label: "Categories",       icon: "🏃" },
  { label: "Registration",     icon: "📅" },
  { label: "Content & Media",  icon: "🖼️" },
  { label: "Review & Publish", icon: "🚀" },
];

// Event types and categories are loaded from the database via /api/admin/event-config/*
// Fallback seeds match the seeded migration values for offline/slow-load resilience.
const FALLBACK_EVENT_TYPES: SelectOption[] = [
  { value: "running",   label: "Running"   },
  { value: "cycling",   label: "Cycling"   },
  { value: "training",  label: "Training"  },
  { value: "race",      label: "Race"      },
  { value: "community", label: "Community" },
  { value: "workshop",  label: "Workshop"  },
];

const FALLBACK_EVENT_CATEGORIES: SelectOption[] = [
  { value: "community", label: "Community Run"      },
  { value: "marathon",  label: "Marathon / Half"    },
  { value: "corporate", label: "Corporate Wellness" },
  { value: "virtual",   label: "Virtual Challenge"  },
  { value: "walkathon", label: "Walkathon"          },
  { value: "cycling",   label: "Cycling Event"      },
  { value: "triathlon", label: "Triathlon"          },
];

const DISTANCES = ["1K", "3K", "5K", "10K", "15K", "21.1K", "42.2K", "Custom"];

// ── Global CSS ────────────────────────────────────────────────────────────────

const GLOBAL_CSS = `
  .wiz-input, .wiz-select, .wiz-textarea {
    width: 100%; padding: 11px 14px;
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px; color: #fff; font-size: 14px; font-family: inherit;
    outline: none; box-sizing: border-box; transition: border-color 0.15s, box-shadow 0.15s;
    color-scheme: dark;
  }
  .wiz-input:focus, .wiz-select:focus, .wiz-textarea:focus {
    border-color: #e8620a; box-shadow: 0 0 0 3px rgba(232,98,10,0.18);
  }
  .wiz-input::placeholder, .wiz-textarea::placeholder { color: #3a3a3a; }
  .wiz-select { cursor: pointer; }
  .wiz-select option { background: #1a1a1a; color: #fff; }
  .wiz-textarea { resize: vertical; }
  .wiz-checkbox { accent-color: #e8620a; width: 16px; height: 16px; cursor: pointer; }
  .wiz-card { background: #111; border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 1.5rem; }
  .wiz-card-hover { transition: border-color 0.15s; }
  .wiz-card-hover:hover { border-color: rgba(255,255,255,0.14); }
  .wiz-label { display: block; font-size: 11px; font-weight: 700; color: #666; text-transform: uppercase; letter-spacing: .07em; margin-bottom: 7px; }
  .wiz-err { color: #f87171; font-size: 12px; margin-top: 5px; }
  .wiz-steps { overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
  .wiz-steps::-webkit-scrollbar { display: none; }
  .wiz-grid { display: grid; }
  @media (max-width: 600px) {
    .wiz-grid-m1 { grid-template-columns: 1fr !important; }
    .wiz-grid-m2 { grid-template-columns: 1fr 1fr !important; }
    .wiz-step-label { display: none; }
    .wiz-header-title { display: none; }
    .wiz-bottom-label { display: none; }
  }
`;

// ── Utility components ────────────────────────────────────────────────────────

function Field({ label, required, error, children, hint }: { label: string; required?: boolean; error?: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="wiz-label">
        {label}{required && <span style={{ color: "#e8620a", marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {hint  && !error && <div style={{ fontSize: 11, color: "#444", marginTop: 4 }}>{hint}</div>}
      {error && <div className="wiz-err">{error}</div>}
    </div>
  );
}

function SectionCard({ title, children, noPad }: { title?: string; children: React.ReactNode; noPad?: boolean }) {
  return (
    <div style={{ marginBottom: 20 }}>
      {title && <div style={{ fontSize: 11, fontWeight: 800, color: "#e8620a", textTransform: "uppercase" as const, letterSpacing: ".1em", marginBottom: 12 }}>{title}</div>}
      <div className="wiz-card" style={noPad ? { padding: 0 } : undefined}>{children}</div>
    </div>
  );
}

function Grid({ cols, children, gap = 16, mobile = "1" }: { cols: string; children: React.ReactNode; gap?: number; mobile?: "1" | "2" }) {
  return (
    <div
      className={`wiz-grid wiz-grid-m${mobile}`}
      style={{ gridTemplateColumns: cols, gap }}
    >
      {children}
    </div>
  );
}

function Toggle({ value, onChange, label, hint }: { value: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }} onClick={() => onChange(!value)}>
      <div style={{ width: 36, height: 20, borderRadius: 10, background: value ? "#e8620a" : "rgba(255,255,255,0.1)", position: "relative", transition: "background .2s", flexShrink: 0, marginTop: 2 }}>
        <div style={{ position: "absolute", top: 2, left: value ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
      </div>
      <div>
        <div style={{ fontSize: 13, color: "#ccc", fontWeight: 600 }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: "#444", marginTop: 1 }}>{hint}</div>}
      </div>
    </div>
  );
}

// ── Wizard Image Uploader ─────────────────────────────────────────────────────

function WizardImageUploader({
  eventId, purpose, currentUrl, onUploaded, onAutoSave, hint, height = 180,
}: {
  eventId:     string | null;
  purpose:     string;
  currentUrl:  string;
  onUploaded:  (url: string) => void;
  onAutoSave:  () => Promise<string | null>;
  hint?:       string;
  height?:     number;
}) {
  const [uploading, setUploading] = useState(false);
  const [error,     setError]     = useState("");
  const [dragOver,  setDragOver]  = useState(false);
  const [fileInfo,  setFileInfo]  = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true); setError("");
    const sz = file.size < 1024 * 1024
      ? `${Math.round(file.size / 1024)} KB`
      : `${(file.size / 1024 / 1024).toFixed(1)} MB`;
    setFileInfo(sz);
    try {
      let id = eventId;
      if (!id) {
        id = await onAutoSave();
        if (!id) { setError("Enter title, date & venue first, then try again"); setUploading(false); return; }
      }
      const fd = new FormData();
      fd.append("file", file);
      fd.append("purpose", purpose);
      const res  = await fetch(`/api/admin/events/${id}/upload`, { method: "POST", body: fd });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) { setError(data.error ?? "Upload failed"); return; }
      onUploaded(data.url);
    } catch { setError("Network error"); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onClick={() => !uploading && inputRef.current?.click()}
        style={{
          width: "100%", height, border: `2px dashed ${dragOver ? "#e8620a" : currentUrl ? "rgba(232,98,10,0.4)" : "rgba(255,255,255,0.12)"}`,
          borderRadius: 10, overflow: "hidden", position: "relative",
          cursor: uploading ? "wait" : "pointer",
          background: dragOver ? "rgba(232,98,10,0.05)" : "#0d0d0d",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "border-color 0.15s, background 0.15s",
        }}
      >
        {currentUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentUrl} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <div
              style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: 6, opacity: 0, transition: "opacity 0.2s" }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "0")}
            >
              <div style={{ fontSize: 24 }}>📷</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>Click to replace</div>
              <div style={{ fontSize: 10, color: "#ccc" }}>or drag a new image here</div>
            </div>
          </>
        ) : (
          <div style={{ textAlign: "center", color: "#555", pointerEvents: "none" }}>
            {uploading ? (
              <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 8 }}>
                <Spinner size={20} />
                <div style={{ fontSize: 11 }}>Uploading {fileInfo}…</div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Drag & drop or click to upload</div>
                <div style={{ fontSize: 11 }}>JPG, PNG, WebP · Max 10 MB</div>
              </>
            )}
          </div>
        )}
        {uploading && currentUrl && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Spinner size={20} />
            <div style={{ fontSize: 11, color: "#ccc" }}>Uploading {fileInfo}…</div>
          </div>
        )}
      </div>
      {hint && <div style={{ fontSize: 10, color: "#555", marginTop: 4 }}>{hint}</div>}
      {error && <div style={{ fontSize: 11, color: "#f87171", marginTop: 4 }}>{error}</div>}
      {currentUrl && !uploading && (
        <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
          {fileInfo && <span style={{ fontSize: 11, color: "#555" }}>{fileInfo}</span>}
          <button
            onClick={e => { e.stopPropagation(); onUploaded(""); setFileInfo(""); }}
            style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 6, padding: "3px 10px", color: "#f87171", fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}
          >Remove</button>
          <button
            onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "3px 10px", color: "#888", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
          >Replace</button>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
    </div>
  );
}

// ── FAQ Editor ────────────────────────────────────────────────────────────────

function FaqEditor({ faqs, onChange }: { faqs: FaqItem[]; onChange: (f: FaqItem[]) => void }) {
  function update(i: number, key: keyof FaqItem, v: string) {
    onChange(faqs.map((f, idx) => idx === i ? { ...f, [key]: v } : f));
  }
  return (
    <div>
      {faqs.map((faq, i) => (
        <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "12px 14px", marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase" as const, letterSpacing: ".06em" }}>FAQ #{i + 1}</span>
            <button onClick={() => onChange(faqs.filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 2px", fontFamily: "inherit" }}>×</button>
          </div>
          <div style={{ marginBottom: 8 }}>
            <div className="wiz-label">Question</div>
            <input className="wiz-input" value={faq.question} onChange={e => update(i, "question", e.target.value)} placeholder="What is included in the registration fee?" />
          </div>
          <div>
            <div className="wiz-label">Answer</div>
            <textarea className="wiz-textarea" style={{ minHeight: 70 }} value={faq.answer} onChange={e => update(i, "answer", e.target.value)} placeholder="Your answer here…" />
          </div>
        </div>
      ))}
      <button onClick={() => onChange([...faqs, { question: "", answer: "" }])} style={{ padding: "8px 16px", background: "rgba(232,98,10,0.1)", border: "1px solid rgba(232,98,10,0.25)", borderRadius: 8, color: "#e8620a", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
        + Add FAQ
      </button>
    </div>
  );
}

// ── Highlights Editor ─────────────────────────────────────────────────────────

function HighlightsEditor({ items, onChange }: { items: string[]; onChange: (v: string[]) => void }) {
  return (
    <div>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
          <span style={{ color: "#e8620a", fontSize: 14, flexShrink: 0 }}>•</span>
          <input className="wiz-input" style={{ flex: 1 }} value={item} onChange={e => onChange(items.map((x, idx) => idx === i ? e.target.value : x))} placeholder="Event highlight, perk, or feature…" />
          <button onClick={() => onChange(items.filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 4px", flexShrink: 0, fontFamily: "inherit" }}>×</button>
        </div>
      ))}
      <button onClick={() => onChange([...items, ""])} style={{ padding: "7px 14px", background: "rgba(232,98,10,0.1)", border: "1px solid rgba(232,98,10,0.25)", borderRadius: 8, color: "#e8620a", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
        + Add Highlight
      </button>
    </div>
  );
}

// ── Publish Success Modal ─────────────────────────────────────────────────────

function PublishModal({ eventId, shareSlug, eventTitle, onClose }: { eventId: string; shareSlug: string; eventTitle: string; onClose: () => void }) {
  const router    = useRouter();
  const publicUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/events/${shareSlug}`;
  const [copied, setCopied] = useState(false);

  function copyLink() {
    navigator.clipboard.writeText(publicUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.87)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 20, width: "100%", maxWidth: 460, padding: "2rem" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>🎉</div>
          <div style={{ fontWeight: 800, fontSize: 20, color: "#4ade80", marginBottom: 6 }}>Event Published!</div>
          <div style={{ fontSize: 14, color: "#666" }}>{eventTitle}</div>
        </div>

        <div style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "10px 14px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: "#555", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{publicUrl}</span>
          <button
            onClick={copyLink}
            style={{ background: copied ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.07)", border: `1px solid ${copied ? "rgba(74,222,128,0.3)" : "rgba(255,255,255,0.12)"}`, borderRadius: 7, padding: "5px 12px", color: copied ? "#4ade80" : "#ccc", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0, transition: "all 0.2s" }}
          >{copied ? "✓ Copied" : "Copy"}</button>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#555", textTransform: "uppercase" as const, letterSpacing: ".08em", marginBottom: 10 }}>What&apos;s Next</div>
          {["Test a registration on the public page", "Manage registrations from the Event Hub", "Customise the confirmation email", "Add route maps and results after the event"].map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 10, fontSize: 13, color: "#777", marginBottom: 7 }}>
              <span style={{ color: "#e8620a", flexShrink: 0 }}>→</span>{item}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
          <Button onClick={() => router.push(`/admin/events/${eventId}/manage`)} style={{ flex: 1 }}>Go to Event Hub</Button>
          <a href={publicUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
            <Button variant="secondary">View Live ↗</Button>
          </a>
          <a href={`https://wa.me/?text=${encodeURIComponent(`Register for ${eventTitle}: ${publicUrl}`)}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
            <Button variant="ghost">WhatsApp</Button>
          </a>
        </div>

        <button onClick={onClose} style={{ marginTop: 14, width: "100%", background: "none", border: "none", color: "#444", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          Close and stay here
        </button>
      </div>
    </div>
  );
}

// ── Main Wizard Component ─────────────────────────────────────────────────────

export default function NewEventWizard() {
  const router = useRouter();

  const [step,              setStep]              = useState(0);
  const [form,              setForm]              = useState<WizardState>(BLANK);
  const [regConfig,         setRegConfig]         = useState<RegConfig>(REG_CONFIG_BLANK);
  const [races,             setRaces]             = useState<RaceForm[]>([]);
  const [raceForm,          setRaceForm]          = useState<RaceForm>(BLANK_RACE);
  const [editIdx,           setEditIdx]           = useState<number | null>(null);
  const [eventId,           setEventId]           = useState<string | null>(null);
  const [shareSlug,         setShareSlug]         = useState<string | null>(null);
  const [saving,            setSaving]            = useState(false);
  const [errors,            setErrors]            = useState<Record<string, string>>({});
  const [savedAt,           setSavedAt]           = useState("");
  const [toast,             setToast]             = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [hasDraft,          setHasDraft]          = useState(false);
  const [skipRaces,         setSkipRaces]         = useState(false);
  const [showPublishModal,  setShowPublishModal]  = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [templates,         setTemplates]         = useState<EventTemplate[]>([]);
  const [templatesLoading,  setTemplatesLoading]  = useState(false);
  const [eventTypes,        setEventTypes]        = useState<SelectOption[]>(FALLBACK_EVENT_TYPES);
  const [eventCategories,   setEventCategories]   = useState<SelectOption[]>(FALLBACK_EVENT_CATEGORIES);
  const [creatingType,      setCreatingType]      = useState(false);
  const [creatingCategory,  setCreatingCategory]  = useState(false);

  const autoRef  = useRef<ReturnType<typeof setTimeout>>(null);
  const isMounted = useRef(true);

  // ── CSS injection ─────────────────────────────────────────────────────────
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = GLOBAL_CSS;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); isMounted.current = false; };
  }, []);

  // ── Load event types & categories from DB ─────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch("/api/admin/event-config/types").then(r => r.json()),
      fetch("/api/admin/event-config/categories").then(r => r.json()),
    ]).then(([typesData, catsData]) => {
      if (typesData.types?.length)      setEventTypes(typesData.types.map((t: { slug: string; name: string }) => ({ value: t.slug, label: t.name })));
      if (catsData.categories?.length)  setEventCategories(catsData.categories.map((c: { slug: string; name: string }) => ({ value: c.slug, label: c.name })));
    }).catch(() => { /* keep fallbacks */ });
  }, []);

  // ── Draft recovery ────────────────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem("cs_new_event_draft");
    if (saved) {
      try {
        const d = JSON.parse(saved) as { form: WizardState; step?: number };
        if (d.form?.title) setHasDraft(true);
      } catch { /* ignore */ }
    }
  }, []);

  function restoreDraft() {
    const saved = localStorage.getItem("cs_new_event_draft");
    if (!saved) return;
    try {
      const d = JSON.parse(saved) as {
        form: WizardState; races: RaceForm[]; step: number;
        eventId: string | null; shareSlug: string | null; skipRaces?: boolean;
        regConfig?: RegConfig;
      };
      setForm({ ...BLANK, ...d.form });
      setRaces(d.races ?? []);
      setStep(d.step ?? 0);
      setEventId(d.eventId ?? null);
      setShareSlug(d.shareSlug ?? null);
      setSkipRaces(d.skipRaces ?? false);
      if (d.regConfig) setRegConfig(d.regConfig);
      setHasDraft(false);
    } catch { /* ignore */ }
  }

  function discardDraft() { localStorage.removeItem("cs_new_event_draft"); setHasDraft(false); }

  // ── Auto-save draft to localStorage ──────────────────────────────────────
  const saveDraft = useCallback(() => {
    localStorage.setItem("cs_new_event_draft", JSON.stringify({ form, races, step, eventId, shareSlug, skipRaces, regConfig }));
  }, [form, races, step, eventId, shareSlug, skipRaces, regConfig]);

  useEffect(() => {
    if (autoRef.current) clearTimeout(autoRef.current);
    autoRef.current = setTimeout(saveDraft, 600);
  }, [form, races, regConfig, saveDraft]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const set   = (k: keyof WizardState, v: unknown) => setForm(p => ({ ...p, [k]: v }));
  const setRF = (k: keyof RaceForm, v: unknown)    => setRaceForm(p => ({ ...p, [k]: v }));
  const setRC = (k: keyof RegConfig, v: unknown)   => setRegConfig(p => ({ ...p, [k]: v }));

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => { if (isMounted.current) setToast(null); }, 3200);
  };

  // ── Validation ────────────────────────────────────────────────────────────
  function validate(): boolean {
    const e: Record<string, string> = {};
    if (step === 0) {
      if (!form.title.trim())     e.title      = "Event name is required";
      if (!form.start_date)       e.start_date = "Start date is required";
      if (!form.location.trim())  e.location   = "Venue is required";
      const descText = form.description.replace(/<[^>]*>/g, "").trim();
      if (!descText)              e.description = "Description is required";
    }
    if (step === 1 && !skipRaces && races.length === 0) {
      e.races = 'Add at least one race/category, or click "Skip — No Categories" below';
    }
    if (step === 2) {
      if (!form.registration_closes_at) e.registration_closes_at = "Registration close date is required";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Save to server ────────────────────────────────────────────────────────
  async function saveToServer(publish = false): Promise<string | null> {
    setSaving(true);
    try {
      const body = {
        title:                  form.title.trim(),
        short_description:      form.short_description || null,
        description:            form.description || null,
        event_type:             form.event_type,
        event_category:         form.event_category,
        cover_image:            form.cover_image || null,
        banner_image:           form.banner_image || null,
        start_date:             form.start_date,
        start_time:             form.start_time || null,
        end_date:               form.end_date || form.start_date,
        end_time:               form.end_time || null,
        location:               form.location.trim(),
        meeting_point:          form.meeting_point || null,
        maps_url:               form.maps_url || null,
        organizer:              form.organizer,
        organizer_email:        form.organizer_email || null,
        organizer_phone:        form.organizer_phone || null,
        support_email:          form.support_email || null,
        website:                form.website || null,
        registration_opens_at:  form.registration_opens_at ? `${form.registration_opens_at}:00+05:30` : null,
        registration_closes_at: form.registration_closes_at ? `${form.registration_closes_at}:00+05:30` : null,
        early_bird_ends_at:     form.early_bird_ends_at ? `${form.early_bird_ends_at}:00+05:30` : null,
        max_participants:       form.max_participants ? Number(form.max_participants) : null,
        waiting_list_enabled:   form.waiting_list_enabled,
        require_login:          form.require_login,
        approval_required:      form.approval_required,
        collect_tshirt:         form.collect_tshirt,
        refund_policy:          form.refund_policy || null,
        cancellation_policy:    form.cancellation_policy || null,
        terms_conditions:       form.terms_conditions || null,
        visibility:             form.visibility,
        highlights:             form.highlights,
        faqs:                   form.faqs,
        gallery_images:         form.gallery_images,
        whatsapp_community_url: form.whatsapp_community_url || null,
        registration_config:    regConfig,
        status:                 publish ? "published" : "draft",
        price:                  races[0] ? Number(races[0].price) || 0 : 0,
        registration_required:  true,
        distance_categories:    races.map(r => r.distance).filter(Boolean),
      };

      const method  = eventId ? "PATCH" : "POST";
      const reqBody = eventId ? { id: eventId, ...body } : body;
      const res     = await fetch("/api/admin/events", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(reqBody) });
      const data    = await res.json();

      if (!res.ok) { showToast(data.error ?? "Save failed", "err"); return null; }

      const id   = data.data?.id   ?? eventId;
      const slug = data.data?.share_slug ?? shareSlug;
      if (id   && isMounted.current) setEventId(id);
      if (slug && isMounted.current) setShareSlug(slug);

      // Sync races
      if (id && !skipRaces) {
        const existing = await fetch(`/api/admin/events/${id}/races`).then(r => r.ok ? r.json() : { races: [] }) as { races: { id: string }[] };
        await Promise.all((existing.races ?? []).map(r =>
          fetch(`/api/admin/events/${id}/races`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id }) })
        ));
        for (let i = 0; i < races.length; i++) {
          const race = races[i];
          await fetch(`/api/admin/events/${id}/races`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...race,
              display_order:    i,
              price:            Number(race.price) || 0,
              early_bird_price: race.early_bird_price ? Number(race.early_bird_price) : null,
              min_participants: Math.max(1, Number(race.min_participants) || 1),
              max_participants: Math.max(1, Number(race.max_participants) || 1),
              max_slots:        race.max_slots ? Number(race.max_slots) : null,
              min_age:          race.min_age ? Number(race.min_age) : null,
              max_age:          race.max_age ? Number(race.max_age) : null,
            }),
          });
        }
      }

      if (isMounted.current) setSavedAt(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }));
      return id ?? null;
    } catch (e) {
      showToast(String(e), "err");
      return null;
    } finally {
      if (isMounted.current) setSaving(false);
    }
  }

  // ── Auto-save for uploads (returns eventId, saving first if needed) ───────
  async function autoSaveForUpload(): Promise<string | null> {
    if (eventId) return eventId;
    if (!form.title.trim() || !form.start_date || !form.location.trim()) return null;
    return saveToServer(false);
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  async function handleNext() {
    if (!validate()) return;
    if (form.title.trim() && form.start_date && form.location.trim()) {
      await saveToServer(false);
    }
    if (step < STEPS.length - 1) setStep(s => s + 1);
  }

  function handleBack() { setErrors({}); setStep(s => Math.max(0, s - 1)); }

  async function handleSaveDraft() {
    if (!form.title.trim()) { showToast("Enter an event name first", "err"); return; }
    const id = await saveToServer(false);
    if (id) showToast("Draft saved ✓");
  }

  async function handlePublish() {
    if (!validate()) return;
    const id = await saveToServer(true);
    if (id) {
      localStorage.removeItem("cs_new_event_draft");
      setShowPublishModal(true);
    }
  }

  async function handlePreview() {
    if (!shareSlug) return;
    await saveToServer(false);
    window.open(`/events/${shareSlug}?preview=1`, "_blank");
  }

  // ── Templates ─────────────────────────────────────────────────────────────
  async function loadAndShowTemplates() {
    setShowTemplatePicker(true);
    if (templates.length > 0) return;
    setTemplatesLoading(true);
    try {
      const res  = await fetch("/api/admin/event-templates");
      const data = await res.json() as { templates?: EventTemplate[] };
      if (isMounted.current) setTemplates(data.templates ?? []);
    } catch { /* non-critical */ }
    finally { if (isMounted.current) setTemplatesLoading(false); }
  }

  function applyTemplate(t: EventTemplate) {
    setForm(prev => ({
      ...prev,
      event_category:      t.event_category,
      event_type:          t.event_type,
      description:         t.event_description ?? prev.description,
      organizer:           t.organizer ?? prev.organizer,
      organizer_email:     t.organizer_email ?? prev.organizer_email,
      organizer_phone:     t.organizer_phone ?? prev.organizer_phone,
      support_email:       t.support_email ?? prev.support_email,
      website:             t.website ?? prev.website,
      cover_image:         t.cover_image ?? prev.cover_image,
      max_participants:    t.max_participants != null ? String(t.max_participants) : prev.max_participants,
      waiting_list_enabled: t.waiting_list_enabled,
      require_login:       t.require_login,
      approval_required:   t.approval_required,
      collect_tshirt:      t.collect_tshirt,
      refund_policy:       t.refund_policy ?? prev.refund_policy,
      cancellation_policy: t.cancellation_policy ?? prev.cancellation_policy,
      visibility:          t.visibility,
    }));
    if (t.races.length > 0) setRaces(t.races.map(r => ({ ...r })));
    setSkipRaces(t.races.length === 0);
    setShowTemplatePicker(false);
    showToast(`Template "${t.name}" applied ✓`);
  }

  async function deleteTemplate(id: string) {
    await fetch(`/api/admin/event-templates/${id}`, { method: "DELETE" });
    setTemplates(prev => prev.filter(t => t.id !== id));
  }

  // ── Race management ───────────────────────────────────────────────────────
  function addOrUpdateRace() {
    if (!raceForm.name.trim()) { setErrors(e => ({ ...e, race_name: "Race name is required" })); return; }
    if (!raceForm.distance.trim()) { setErrors(e => ({ ...e, race_dist: "Distance is required" })); return; }
    setErrors(e => { const n = { ...e }; delete n.race_name; delete n.race_dist; delete n.races; return n; });
    if (editIdx !== null) {
      setRaces(rs => rs.map((r, i) => i === editIdx ? { ...raceForm } : r));
      setEditIdx(null);
    } else {
      setRaces(rs => [...rs, { ...raceForm }]);
    }
    setRaceForm(BLANK_RACE);
  }

  function editRace(i: number) { setRaceForm({ ...races[i] }); setEditIdx(i); }

  function deleteRace(i: number) {
    setRaces(rs => rs.filter((_, idx) => idx !== i));
    if (editIdx === i) { setEditIdx(null); setRaceForm(BLANK_RACE); }
  }

  function duplicateRace(i: number) {
    setRaces(rs => [...rs, { ...rs[i], name: `${rs[i].name} (Copy)` }]);
  }

  function reorderRace(from: number, to: number) {
    setRaces(rs => {
      const next = [...rs];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const isReady = Boolean(form.title && form.start_date && form.location && form.registration_closes_at);

  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#fff", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(8,8,8,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 1.5rem", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <Link href="/admin/events" style={{ display: "flex", alignItems: "center", textDecoration: "none", opacity: 0.7, flexShrink: 0 }}>
            <Image src="/logo.png" alt="" width={26} height={26} style={{ borderRadius: "50%" }} />
          </Link>
          <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.1)", flexShrink: 0 }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: "#fff", whiteSpace: "nowrap" as const }}>New Event</span>
          {form.title && <span className="wiz-header-title" style={{ fontSize: 12, color: "#444", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>— {form.title}</span>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {savedAt && <span style={{ fontSize: 11, color: "#333", whiteSpace: "nowrap" as const }}>Saved {savedAt}</span>}
          <Button size="sm" variant="ghost" onClick={loadAndShowTemplates}>🗂️ Template</Button>
          <Button size="sm" variant="secondary" loading={saving} onClick={handleSaveDraft}>Save Draft</Button>
          <Link href="/admin/events" style={{ textDecoration: "none" }}>
            <Button size="sm" variant="ghost">Cancel</Button>
          </Link>
        </div>
      </header>

      {/* Draft restore banner */}
      {hasDraft && (
        <Alert variant="warning" style={{ margin: 0, borderRadius: 0, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const, gap: 8 }}>
          <span>You have an unsaved draft. Continue where you left off?</span>
          <div style={{ display: "flex", gap: 8 }}>
            <Button size="xs" onClick={restoreDraft}>Restore Draft</Button>
            <Button size="xs" variant="ghost" onClick={discardDraft}>Start Fresh</Button>
          </div>
        </Alert>
      )}

      {/* Step progress */}
      <div style={{ background: "#0c0c0c", borderBottom: "1px solid rgba(255,255,255,0.05)", padding: "0 1.5rem" }}>
        <div className="wiz-steps" style={{ maxWidth: 860, margin: "0 auto", display: "flex", alignItems: "stretch" }}>
          {STEPS.map((s, i) => (
            <button
              key={s.label}
              onClick={() => i < step ? setStep(i) : undefined}
              disabled={i > step}
              style={{ flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: 4, padding: "14px 6px", background: "none", border: "none", borderBottom: i === step ? "2px solid #e8620a" : "2px solid transparent", cursor: i < step ? "pointer" : "default", transition: "all 0.15s", minWidth: 48 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: i < step ? "#4ade80" : i === step ? "#e8620a" : "rgba(255,255,255,0.07)", fontSize: 11, fontWeight: 800, color: i <= step ? "#fff" : "#444", flexShrink: 0 }}>
                  {i < step ? "✓" : i + 1}
                </div>
                <span className="wiz-step-label" style={{ fontSize: 12, fontWeight: i === step ? 700 : 400, color: i === step ? "#fff" : i < step ? "#4ade80" : "#3a3a3a", whiteSpace: "nowrap" as const }}>
                  {s.label}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "2rem 1.5rem 6rem" }}>

        {step === 0 && (
          <StepDetails
            form={form} set={set} errors={errors}
            eventId={eventId} onAutoSave={autoSaveForUpload}
            eventTypes={eventTypes} eventCategories={eventCategories}
            onCreateType={async (name) => {
              setCreatingType(true);
              try {
                const res  = await fetch("/api/admin/event-config/types", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
                const data = await res.json();
                if (!res.ok) { alert(data.error ?? "Failed to create type"); return null; }
                const opt: SelectOption = { value: data.type.slug, label: data.type.name };
                setEventTypes(prev => [...prev, opt]);
                return opt;
              } finally { setCreatingType(false); }
            }}
            onCreateCategory={async (name) => {
              setCreatingCategory(true);
              try {
                const res  = await fetch("/api/admin/event-config/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
                const data = await res.json();
                if (!res.ok) { alert(data.error ?? "Failed to create category"); return null; }
                const opt: SelectOption = { value: data.category.slug, label: data.category.name };
                setEventCategories(prev => [...prev, opt]);
                return opt;
              } finally { setCreatingCategory(false); }
            }}
            creatingType={creatingType}
            creatingCategory={creatingCategory}
          />
        )}

        {step === 1 && (
          <StepCategories
            races={races} raceForm={raceForm} setRF={setRF}
            editIdx={editIdx} errors={errors} skipRaces={skipRaces}
            onSkipToggle={() => { setSkipRaces(s => !s); setErrors(e => { const n = { ...e }; delete n.races; return n; }); }}
            onAdd={addOrUpdateRace} onEdit={editRace} onDelete={deleteRace}
            onDuplicate={duplicateRace} onReorder={reorderRace}
            onCancel={() => { setEditIdx(null); setRaceForm(BLANK_RACE); }}
          />
        )}

        {step === 2 && (
          <StepRegistration
            form={form} set={set} errors={errors}
            regConfig={regConfig} setRC={setRC}
            eventId={eventId} races={races}
          />
        )}

        {step === 3 && (
          <StepContent
            form={form} set={set}
            eventId={eventId} onAutoSave={autoSaveForUpload}
          />
        )}

        {step === 4 && (
          <StepReview
            form={form} races={races} skipRaces={skipRaces} isReady={isReady}
            eventId={eventId} shareSlug={shareSlug}
            onPublish={handlePublish} onPreview={handlePreview} saving={saving}
          />
        )}

        {/* Bottom nav bar */}
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(8,8,8,0.96)", backdropFilter: "blur(12px)", borderTop: "1px solid rgba(255,255,255,0.06)", padding: "14px 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 40, gap: 12 }}>
          <Button variant="secondary" disabled={step === 0 || saving} onClick={handleBack}>← Back</Button>
          <span className="wiz-bottom-label" style={{ fontSize: 12, color: "#2a2a2a" }}>Step {step + 1} of {STEPS.length}</span>
          {step < STEPS.length - 1 ? (
            <Button loading={saving} onClick={handleNext}>Continue →</Button>
          ) : (
            <Button loading={saving} onClick={handlePublish} disabled={!isReady}>🚀 Publish Now</Button>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", background: toast.type === "err" ? "#3b0a0a" : "#0f1a0f", border: `1px solid ${toast.type === "err" ? "rgba(239,68,68,0.3)" : "rgba(74,222,128,0.3)"}`, borderRadius: 24, padding: "10px 22px", fontSize: 13, fontWeight: 600, color: toast.type === "err" ? "#f87171" : "#4ade80", zIndex: 9999, whiteSpace: "nowrap" as const, boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}>
          {toast.msg}
        </div>
      )}

      {/* Publish success modal */}
      {showPublishModal && eventId && shareSlug && (
        <PublishModal
          eventId={eventId}
          shareSlug={shareSlug}
          eventTitle={form.title}
          onClose={() => setShowPublishModal(false)}
        />
      )}

      {/* Template picker */}
      {showTemplatePicker && (
        <TemplatePicker
          templates={templates}
          loading={templatesLoading}
          onSelect={applyTemplate}
          onDelete={deleteTemplate}
          onClose={() => setShowTemplatePicker(false)}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Step 0: Event Details ─────────────────────────────────────────────────────

function StepDetails({
  form, set, errors, eventId, onAutoSave,
  eventTypes, eventCategories, onCreateType, onCreateCategory,
  creatingType, creatingCategory,
}: {
  form: WizardState;
  set: (k: keyof WizardState, v: unknown) => void;
  errors: Record<string, string>;
  eventId: string | null;
  onAutoSave: () => Promise<string | null>;
  eventTypes:       SelectOption[];
  eventCategories:  SelectOption[];
  onCreateType:     (name: string) => Promise<SelectOption | null>;
  onCreateCategory: (name: string) => Promise<SelectOption | null>;
  creatingType:     boolean;
  creatingCategory: boolean;
}) {
  return (
    <div>
      <SectionCard title="Basic Information">
        <div style={{ marginBottom: 14 }}>
          <Grid cols="2fr 1fr" gap={16} mobile="1">
            <Field label="Event Name" required error={errors.title}>
              <input className="wiz-input" value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. Connected Steps 5K Community Run" />
            </Field>
            <Field label="Category" required>
              <CreatableSelect
                value={form.event_category}
                onChange={v => set("event_category", v)}
                options={eventCategories}
                onCreateOption={onCreateCategory}
                creating={creatingCategory}
                padding="11px 14px"
                style={{ borderRadius: 10, fontSize: 14, background: "rgba(255,255,255,0.04)" }}
                placeholder="Select or create category…"
              />
            </Field>
          </Grid>
        </div>

        <div style={{ marginBottom: 14 }}>
          <Field label="Tagline / Short Description" hint="One sentence shown in event listings and share cards (max 160 chars)">
            <input className="wiz-input" value={form.short_description} onChange={e => set("short_description", e.target.value)} placeholder="Join us for a fun community 5K run through the park!" maxLength={160} />
          </Field>
        </div>

        <div style={{ marginBottom: 14 }}>
          <Grid cols="1fr 1fr" gap={16} mobile="1">
            <Field label="Event Type">
              <CreatableSelect
                value={form.event_type}
                onChange={v => set("event_type", v)}
                options={eventTypes}
                onCreateOption={onCreateType}
                creating={creatingType}
                padding="11px 14px"
                style={{ borderRadius: 10, fontSize: 14, background: "rgba(255,255,255,0.04)" }}
                placeholder="Select or create type…"
              />
            </Field>
            <Field label="Visibility">
              <select className="wiz-select" value={form.visibility} onChange={e => set("visibility", e.target.value)}>
                <option value="public">🌐 Public — shown in all listings</option>
                <option value="private">🔒 Private — link only</option>
                <option value="unlisted">🔗 Unlisted</option>
              </select>
            </Field>
          </Grid>
        </div>

        <Field label="Description" required error={errors.description} hint="Tell participants what makes this event special. Rich text supported.">
          <div style={{ borderRadius: 10, overflow: "hidden", border: errors.description ? "1px solid rgba(248,113,113,0.4)" : "1px solid rgba(255,255,255,0.1)", marginTop: 2 }}>
            <RichTextEditor
              content={form.description}
              onChange={(html) => set("description", html)}
              placeholder="Describe the event, route, what to expect, and why participants should join…"
              minHeight={160}
            />
          </div>
        </Field>
      </SectionCard>

      <SectionCard title="Cover Image">
        <WizardImageUploader
          eventId={eventId}
          purpose="poster"
          currentUrl={form.cover_image}
          onUploaded={url => set("cover_image", url)}
          onAutoSave={onAutoSave}
          height={200}
          hint="Recommended: 1200 × 630 px (1.9:1 ratio). Shown in listings and share previews."
        />
      </SectionCard>

      <SectionCard title="Date & Time">
        <Grid cols="1fr 1fr 1fr 1fr" gap={14} mobile="2">
          <Field label="Start Date" required error={errors.start_date}>
            <input type="date" className="wiz-input" value={form.start_date} onChange={e => set("start_date", e.target.value)} />
          </Field>
          <Field label="End Date">
            <input type="date" className="wiz-input" value={form.end_date} onChange={e => set("end_date", e.target.value)} min={form.start_date} />
          </Field>
          <Field label="Start Time">
            <input type="time" className="wiz-input" value={form.start_time} onChange={e => set("start_time", e.target.value)} />
          </Field>
          <Field label="End Time">
            <input type="time" className="wiz-input" value={form.end_time} onChange={e => set("end_time", e.target.value)} />
          </Field>
        </Grid>
      </SectionCard>

      <SectionCard title="Location">
        <Field label="Venue / Address" required error={errors.location}>
          <input className="wiz-input" value={form.location} onChange={e => set("location", e.target.value)} placeholder="Botanical Garden Gate-1, Kondapur, Hyderabad" />
        </Field>
        <div style={{ height: 14 }} />
        <Grid cols="1fr 1fr" gap={14} mobile="1">
          <Field label="Meeting Point" hint="Where participants gather before the event starts">
            <input className="wiz-input" value={form.meeting_point} onChange={e => set("meeting_point", e.target.value)} placeholder="Gate 1 Parking Area" />
          </Field>
          <Field label="Google Maps URL">
            <input className="wiz-input" value={form.maps_url} onChange={e => set("maps_url", e.target.value)} placeholder="https://maps.google.com/…" />
          </Field>
        </Grid>
      </SectionCard>

      <SectionCard title="Organizer Details">
        <div style={{ marginBottom: 14 }}>
          <Grid cols="1fr 1fr" gap={14} mobile="1">
            <Field label="Organizer Name">
              <input className="wiz-input" value={form.organizer} onChange={e => set("organizer", e.target.value)} />
            </Field>
            <Field label="Website">
              <input className="wiz-input" value={form.website} onChange={e => set("website", e.target.value)} placeholder="https://connectedsteps.in" />
            </Field>
          </Grid>
        </div>
        <Grid cols="1fr 1fr 1fr" gap={14} mobile="1">
          <Field label="Contact Email">
            <input type="email" className="wiz-input" value={form.organizer_email} onChange={e => set("organizer_email", e.target.value)} />
          </Field>
          <Field label="Contact Phone">
            <input className="wiz-input" value={form.organizer_phone} onChange={e => set("organizer_phone", e.target.value)} />
          </Field>
          <Field label="Support Email">
            <input type="email" className="wiz-input" value={form.support_email} onChange={e => set("support_email", e.target.value)} />
          </Field>
        </Grid>
      </SectionCard>
    </div>
  );
}

// ── Step 1: Categories / Races ────────────────────────────────────────────────

function StepCategories({
  races, raceForm, setRF, editIdx, errors, skipRaces,
  onSkipToggle, onAdd, onEdit, onDelete, onDuplicate, onReorder, onCancel,
}: {
  races:       RaceForm[];
  raceForm:    RaceForm;
  setRF:       (k: keyof RaceForm, v: unknown) => void;
  editIdx:     number | null;
  errors:      Record<string, string>;
  skipRaces:   boolean;
  onSkipToggle: () => void;
  onAdd:       () => void;
  onEdit:      (i: number) => void;
  onDelete:    (i: number) => void;
  onDuplicate: (i: number) => void;
  onReorder:   (from: number, to: number) => void;
  onCancel:    () => void;
}) {
  const [dragIdx,    setDragIdx]    = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const customDist = !["1K","3K","5K","10K","15K","21.1K","42.2K",""].includes(raceForm.distance);

  return (
    <div>
      {/* Race list */}
      {races.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#e8620a", textTransform: "uppercase" as const, letterSpacing: ".1em", marginBottom: 12 }}>
            Races / Categories ({races.length}) — drag to reorder
          </div>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
            {races.map((r, i) => (
              <div
                key={i}
                draggable
                onDragStart={() => setDragIdx(i)}
                onDragOver={e => { e.preventDefault(); setDragOverIdx(i); }}
                onDrop={() => { if (dragIdx !== null && dragIdx !== i) onReorder(dragIdx, i); setDragIdx(null); setDragOverIdx(null); }}
                onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                className="wiz-card wiz-card-hover"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px",
                  cursor: "grab",
                  opacity: dragIdx === i ? 0.4 : 1,
                  borderColor: dragOverIdx === i ? "rgba(232,98,10,0.5)" : undefined,
                  transition: "opacity 0.15s, border-color 0.15s",
                  flexWrap: "wrap" as const,
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: "#333", fontSize: 18, flexShrink: 0, cursor: "grab" }}>⋮⋮</span>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(232,98,10,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🏃</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#fff" }}>{r.name}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" as const }}>
                      {r.distance && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.07)", color: "#888" }}>{r.distance}</span>}
                      {r.price ? <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(232,98,10,0.12)", color: "#e8620a" }}>₹{r.price}</span> : <span style={{ fontSize: 11, color: "#555" }}>Free</span>}
                      {r.max_slots && <span style={{ fontSize: 11, color: "#666" }}>{r.max_slots} slots</span>}
                      {r.gun_time && <span style={{ fontSize: 11, color: "#555" }}>🏁 {r.gun_time}</span>}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <Button size="xs" variant="ghost" onClick={() => onEdit(i)}>Edit</Button>
                  <Button size="xs" variant="ghost" onClick={() => onDuplicate(i)}>Copy</Button>
                  <Button size="xs" variant="danger" onClick={() => onDelete(i)}>Remove</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {errors.races && <Alert variant="error" style={{ marginBottom: 14 }}>{errors.races}</Alert>}

      {/* Add / Edit form */}
      {!skipRaces && (
        <SectionCard title={editIdx !== null ? "Edit Race" : "Add a Race / Category"}>
          <div style={{ marginBottom: 14 }}>
            <Grid cols="1fr 1fr 1fr" gap={14} mobile="1">
              <Field label="Race Name" required error={errors.race_name}>
                <input className="wiz-input" value={raceForm.name} onChange={e => setRF("name", e.target.value)} placeholder="5K Open" />
              </Field>
              <Field label="Distance" required error={errors.race_dist}>
                <select className="wiz-select" value={customDist ? "Custom" : (raceForm.distance || "")} onChange={e => {
                  if (e.target.value !== "Custom") setRF("distance", e.target.value);
                  else setRF("distance", "");
                }}>
                  <option value="">Select distance</option>
                  {DISTANCES.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                {(customDist || (raceForm.distance === "" && !["1K","3K","5K","10K","15K","21.1K","42.2K"].includes(raceForm.distance))) && (
                  <input className="wiz-input" style={{ marginTop: 8 }} value={raceForm.distance} onChange={e => setRF("distance", e.target.value)} placeholder="e.g. 3K, 100M, 2.5K" />
                )}
              </Field>
              <Field label="Entry Fee (₹)" hint="0 = Free">
                <input type="number" className="wiz-input" value={raceForm.price} onChange={e => setRF("price", e.target.value)} placeholder="0" min="0" />
              </Field>
            </Grid>
          </div>

          <div style={{ marginBottom: 14 }}>
            <Grid cols="1fr 1fr 1fr" gap={14} mobile="1">
              <Field label="Early Bird Price (₹)" hint="Blank = no early bird">
                <input type="number" className="wiz-input" value={raceForm.early_bird_price} onChange={e => setRF("early_bird_price", e.target.value)} placeholder="Same as entry fee" min="0" />
              </Field>
              <Field label="Pricing Model">
                <select className="wiz-select" value={raceForm.price_type} onChange={e => setRF("price_type", e.target.value)}>
                  <option value="per_participant">Per Participant</option>
                  <option value="per_registration">Per Registration (flat fee)</option>
                </select>
              </Field>
              <Field label="BIB Prefix" hint="e.g. 5K, HR, CS">
                <input className="wiz-input" value={raceForm.bib_prefix} onChange={e => setRF("bib_prefix", e.target.value)} placeholder="Optional" maxLength={6} />
              </Field>
            </Grid>
          </div>

          <div style={{ marginBottom: 14 }}>
            <Field label="Participation Type" hint="Individual = one person per booking; Group = 2+ people share one registration">
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 24, paddingTop: 6 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 13, color: raceForm.min_participants === "1" && raceForm.max_participants === "1" ? "#e8620a" : "inherit" }}>
                  <input type="radio" name="participation-type"
                    checked={raceForm.min_participants === "1" && raceForm.max_participants === "1"}
                    onChange={() => { setRF("min_participants", "1"); setRF("max_participants", "1"); }} />
                  Individual (1 per registration)
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 13, color: (raceForm.min_participants !== "1" || raceForm.max_participants !== "1") ? "#e8620a" : "inherit" }}>
                  <input type="radio" name="participation-type"
                    checked={raceForm.min_participants !== "1" || raceForm.max_participants !== "1"}
                    onChange={() => { setRF("min_participants", "2"); setRF("max_participants", "2"); }} />
                  Group (2+ participants)
                </label>
              </div>
            </Field>
          </div>
          {(raceForm.min_participants !== "1" || raceForm.max_participants !== "1") && (
            <div style={{ marginBottom: 14 }}>
              <Grid cols="1fr 1fr" gap={14} mobile="1">
                <Field label="Min Participants" hint="e.g. 2 for Duo, 4 for Relay, 5 for team">
                  <input type="number" className="wiz-input" value={raceForm.min_participants} onChange={e => setRF("min_participants", e.target.value)} min="2" />
                </Field>
                <Field label="Max Participants" hint="Same as Min for fixed groups (e.g. 2/2 = Duo; 5/20 = open team)">
                  <input type="number" className="wiz-input" value={raceForm.max_participants} onChange={e => setRF("max_participants", e.target.value)} min="2" />
                </Field>
              </Grid>
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <Grid cols="1fr 1fr 1fr" gap={14} mobile="1">
              <Field label="Max Slots" hint="Blank = unlimited">
                <input type="number" className="wiz-input" value={raceForm.max_slots} onChange={e => setRF("max_slots", e.target.value)} placeholder="Unlimited" min="1" />
              </Field>
              <Field label="Reporting Time">
                <input type="time" className="wiz-input" value={raceForm.reporting_time} onChange={e => setRF("reporting_time", e.target.value)} />
              </Field>
              <Field label="Gun / Flag-off Time">
                <input type="time" className="wiz-input" value={raceForm.gun_time} onChange={e => setRF("gun_time", e.target.value)} />
              </Field>
            </Grid>
          </div>

          <div style={{ marginBottom: 14 }}>
            <Grid cols="1fr 1fr 1fr" gap={14} mobile="1">
              <Field label="Gender Restriction">
                <select className="wiz-select" value={raceForm.gender_restriction} onChange={e => setRF("gender_restriction", e.target.value)}>
                  <option value="">All Genders</option>
                  <option value="male">Men Only</option>
                  <option value="female">Women Only</option>
                </select>
              </Field>
              <Field label="Min Age">
                <input type="number" className="wiz-input" value={raceForm.min_age} onChange={e => setRF("min_age", e.target.value)} placeholder="No minimum" min="0" />
              </Field>
              <Field label="Max Age">
                <input type="number" className="wiz-input" value={raceForm.max_age} onChange={e => setRF("max_age", e.target.value)} placeholder="No maximum" min="0" />
              </Field>
            </Grid>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase" as const, letterSpacing: ".08em", marginBottom: 10 }}>What&apos;s Included</div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" as const }}>
              {([ ["medal","🏅","Medal"], ["bib","📋","BIB"], ["tshirt","👕","T-Shirt"], ["breakfast","🍌","Breakfast"], ["certificate","📜","Certificate"], ["goodies","🎁","Goodies"] ] as [keyof RacePerks, string, string][]).map(([key, icon, label]) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: raceForm.perks[key] ? "#e8620a" : "#666" }}>
                  <input type="checkbox" className="wiz-checkbox" checked={raceForm.perks[key]} onChange={e => setRF("perks", { ...raceForm.perks, [key]: e.target.checked })} />
                  {icon} {label}
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 20, marginBottom: 16, flexWrap: "wrap" as const }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#bbb" }}>
              <input type="checkbox" className="wiz-checkbox" checked={raceForm.timing_chip} onChange={e => setRF("timing_chip", e.target.checked)} />
              Timing Chip
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#bbb" }}>
              <input type="checkbox" className="wiz-checkbox" checked={raceForm.auto_bib} onChange={e => setRF("auto_bib", e.target.checked)} />
              Auto-assign BIB Numbers
            </label>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
            <Button onClick={onAdd}>{editIdx !== null ? "Update Race" : "+ Add Race"}</Button>
            {editIdx !== null && <Button variant="secondary" onClick={onCancel}>Cancel</Button>}
          </div>
        </SectionCard>
      )}

      {/* Skip option */}
      <div style={{ marginTop: 20, padding: "14px 18px", background: skipRaces ? "rgba(74,222,128,0.07)" : "rgba(255,255,255,0.02)", border: `1px solid ${skipRaces ? "rgba(74,222,128,0.2)" : "rgba(255,255,255,0.07)"}`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" as const }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: skipRaces ? "#4ade80" : "#555" }}>
            {skipRaces ? "✓ No races — participants register directly" : "This event has no race categories"}
          </div>
          <div style={{ fontSize: 11, color: "#444", marginTop: 2 }}>Walkathon, workshop, or any event with a single entry</div>
        </div>
        <Button size="sm" variant={skipRaces ? "ghost" : "secondary"} onClick={onSkipToggle}>{skipRaces ? "Add Races" : "Skip — No Categories"}</Button>
      </div>
    </div>
  );
}

// ── Form Builder ─────────────────────────────────────────────────────────────

interface BuiltField {
  id:           string;
  field_key:    string;
  field_type:   string;
  label:        string;
  placeholder:  string | null;
  help_text:    string | null;
  required:     boolean;
  options:      string[];
  section:      string | null;
  race_ids:     string[];
  display_order: number;
  is_active:    boolean;
}

const FIELD_TYPES = [
  { value: "text",         label: "Short Text" },
  { value: "textarea",     label: "Long Text" },
  { value: "select",       label: "Dropdown" },
  { value: "radio",        label: "Radio Buttons" },
  { value: "multi_select", label: "Multi-Select" },
  { value: "checkbox",     label: "Checkbox" },
  { value: "number",       label: "Number" },
  { value: "date",         label: "Date" },
  { value: "email",        label: "Email" },
  { value: "phone",        label: "Phone" },
  { value: "file",         label: "File Upload" },
  { value: "waiver",       label: "Waiver / Consent" },
];

const HAS_OPTIONS = new Set(["select", "radio", "multi_select"]);

function FormBuilder({ eventId, races }: { eventId: string | null; races: RaceForm[] }) {
  const [fields,     setFields]     = useState<BuiltField[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [err,        setErr]        = useState("");
  const [editId,     setEditId]     = useState<string | null>(null);

  // Form state for add/edit
  const [fLabel,     setFLabel]     = useState("");
  const [fType,      setFType]      = useState("text");
  const [fRequired,  setFRequired]  = useState(false);
  const [fPlaceholder, setFPlaceholder] = useState("");
  const [fHelp,      setFHelp]      = useState("");
  const [fSection,   setFSection]   = useState("");
  const [fOptions,   setFOptions]   = useState("");  // comma-separated
  const [fRaceIds,   setFRaceIds]   = useState<string[]>([]);

  // Drag state
  const [dragIdx,    setDragIdx]    = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!eventId) return;
    setLoading(true);
    fetch(`/api/admin/events/${eventId}/form-fields`)
      .then(r => r.json())
      .then(d => setFields(d.fields ?? []))
      .catch(() => setErr("Could not load fields"))
      .finally(() => setLoading(false));
  }, [eventId]);

  function resetForm() {
    setEditId(null); setFLabel(""); setFType("text"); setFRequired(false);
    setFPlaceholder(""); setFHelp(""); setFSection(""); setFOptions(""); setFRaceIds([]);
    setErr("");
  }

  function startEdit(f: BuiltField) {
    setEditId(f.id); setFLabel(f.label); setFType(f.field_type);
    setFRequired(f.required); setFPlaceholder(f.placeholder ?? "");
    setFHelp(f.help_text ?? ""); setFSection(f.section ?? "");
    setFOptions(f.options.join(", ")); setFRaceIds(f.race_ids ?? []);
    setErr("");
  }

  async function saveField() {
    if (!eventId || !fLabel.trim()) { setErr("Label is required."); return; }
    setSaving(true); setErr("");
    const options = HAS_OPTIONS.has(fType)
      ? fOptions.split(",").map(s => s.trim()).filter(Boolean)
      : [];
    const body = {
      label: fLabel.trim(), field_type: fType, required: fRequired,
      placeholder: fPlaceholder.trim() || null, help_text: fHelp.trim() || null,
      section: fSection.trim() || null, options, race_ids: fRaceIds,
    };
    try {
      if (editId) {
        const res  = await fetch(`/api/admin/events/${eventId}/form-fields`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editId, ...body }) });
        const data = await res.json();
        if (!res.ok) { setErr(data.error ?? "Save failed"); return; }
        setFields(fs => fs.map(f => f.id === editId ? { ...f, ...data.field } : f));
      } else {
        const res  = await fetch(`/api/admin/events/${eventId}/form-fields`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const data = await res.json();
        if (!res.ok) { setErr(data.error ?? "Save failed"); return; }
        setFields(fs => [...fs, data.field]);
      }
      resetForm();
    } catch { setErr("Network error."); }
    finally { setSaving(false); }
  }

  async function deleteField(id: string) {
    if (!eventId) return;
    await fetch(`/api/admin/events/${eventId}/form-fields`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setFields(fs => fs.filter(f => f.id !== id));
    if (editId === id) resetForm();
  }

  async function reorderField(from: number, to: number) {
    if (!eventId || from === to) return;
    const next = [...fields];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setFields(next);
    await fetch(`/api/admin/events/${eventId}/form-fields/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: next.map(f => f.id) }),
    });
  }

  function toggleRaceId(id: string) {
    setFRaceIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  const raceOptions = races.filter(r => r.name.trim());

  if (!eventId) {
    return (
      <div style={{ padding: "24px 20px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.08)", textAlign: "center" as const }}>
        <div style={{ fontSize: 13, color: "#444", marginBottom: 6 }}>Save the event first to add custom registration fields</div>
        <div style={{ fontSize: 11, color: "#333" }}>Click "Save Draft" above, then come back to this step.</div>
      </div>
    );
  }

  return (
    <div>
      {/* Field list */}
      {loading ? (
        <div style={{ fontSize: 12, color: "#444", padding: "12px 0" }}>Loading fields…</div>
      ) : fields.length > 0 ? (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase" as const, letterSpacing: ".08em", marginBottom: 10 }}>
            Custom Fields ({fields.length}) — drag to reorder
          </div>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
            {fields.map((f, i) => {
              const scopedTo = (f.race_ids ?? []).length > 0
                ? races.filter(r => (f.race_ids ?? []).includes(r.id ?? "")).map(r => r.name || r.distance).join(", ")
                : null;
              return (
                <div
                  key={f.id}
                  draggable
                  onDragStart={() => setDragIdx(i)}
                  onDragOver={e => { e.preventDefault(); setDragOverIdx(i); }}
                  onDrop={() => { if (dragIdx !== null && dragIdx !== i) reorderField(dragIdx, i); setDragIdx(null); setDragOverIdx(null); }}
                  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                  className="wiz-card"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px",
                    cursor: "grab", opacity: dragIdx === i ? 0.4 : 1,
                    borderColor: dragOverIdx === i ? "rgba(232,98,10,0.5)" : editId === f.id ? "rgba(232,98,10,0.4)" : undefined,
                    gap: 10, flexWrap: "wrap" as const,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span style={{ color: "#333", fontSize: 16, cursor: "grab", flexShrink: 0 }}>⋮⋮</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#ddd" }}>{f.label}</span>
                        {f.required && <span style={{ fontSize: 10, color: "#e8620a", fontWeight: 700 }}>Required</span>}
                        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(255,255,255,0.06)", color: "#666" }}>{f.field_type}</span>
                        {scopedTo && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(99,102,241,0.12)", color: "#818cf8" }}>🎯 {scopedTo}</span>}
                        {!f.is_active && <span style={{ fontSize: 10, color: "#444" }}>Hidden</span>}
                      </div>
                      {f.section && <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>§ {f.section}</div>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <Button size="xs" variant="ghost" onClick={() => startEdit(f)}>Edit</Button>
                    <Button size="xs" variant="danger" onClick={() => deleteField(f.id)}>Remove</Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "#444", padding: "8px 0 16px", fontStyle: "italic" as const }}>No custom fields yet.</div>
      )}

      {/* Add / Edit form */}
      <SectionCard title={editId ? "Edit Field" : "Add Custom Field"}>
        {err && <Alert variant="error" style={{ marginBottom: 12 }}>{err}</Alert>}
        <Grid cols="1fr 1fr" gap={14} mobile="1">
          <Field label="Field Label" required>
            <input className="wiz-input" value={fLabel} onChange={e => setFLabel(e.target.value)} placeholder="e.g. T-shirt message" />
          </Field>
          <Field label="Field Type">
            <select className="wiz-select" value={fType} onChange={e => setFType(e.target.value)}>
              {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
        </Grid>

        {HAS_OPTIONS.has(fType) && (
          <div style={{ marginTop: 10 }}>
            <Field label="Options" hint="Comma-separated, e.g. Option A, Option B, Option C">
              <input className="wiz-input" value={fOptions} onChange={e => setFOptions(e.target.value)} placeholder="Option A, Option B, Option C" />
            </Field>
          </div>
        )}

        <div style={{ marginTop: 10 }}>
          <Grid cols="1fr 1fr" gap={14} mobile="1">
            <Field label="Placeholder Text" hint="Shown inside the input">
              <input className="wiz-input" value={fPlaceholder} onChange={e => setFPlaceholder(e.target.value)} placeholder="Optional hint text" />
            </Field>
            <Field label="Section Heading" hint="Groups fields under a heading">
              <input className="wiz-input" value={fSection} onChange={e => setFSection(e.target.value)} placeholder="e.g. Medical Information" />
            </Field>
          </Grid>
        </div>

        <div style={{ marginTop: 10 }}>
          <Field label="Help Text" hint="Appears below the field">
            <input className="wiz-input" value={fHelp} onChange={e => setFHelp(e.target.value)} placeholder="Additional instructions for participants" />
          </Field>
        </div>

        {raceOptions.length > 1 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase" as const, letterSpacing: ".08em", marginBottom: 8 }}>
              Show only for these categories (leave blank = all)
            </div>
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
              {raceOptions.map(r => {
                const sel = r.id ? fRaceIds.includes(r.id) : false;
                return (
                  <label key={r.id ?? r.name} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "5px 10px", borderRadius: 6, background: sel ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${sel ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.08)"}`, fontSize: 12, color: sel ? "#818cf8" : "#666" }}>
                    <input type="checkbox" checked={sel} onChange={() => r.id && toggleRaceId(r.id)} style={{ accentColor: "#818cf8" }} />
                    {r.name || r.distance}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 14 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#bbb" }}>
            <input type="checkbox" className="wiz-checkbox" checked={fRequired} onChange={e => setFRequired(e.target.checked)} />
            Required field
          </label>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" as const }}>
          <Button onClick={saveField} loading={saving}>{editId ? "Update Field" : "+ Add Field"}</Button>
          {editId && <Button variant="secondary" onClick={resetForm}>Cancel</Button>}
        </div>
      </SectionCard>
    </div>
  );
}

// ── Step 2: Registration ──────────────────────────────────────────────────────

function StepRegistration({
  form, set, errors, regConfig, setRC, eventId, races,
}: {
  form:      WizardState;
  set:       (k: keyof WizardState, v: unknown) => void;
  errors:    Record<string, string>;
  regConfig: RegConfig;
  setRC:     (k: keyof RegConfig, v: unknown) => void;
  eventId:   string | null;
  races:     RaceForm[];
}) {
  return (
    <div>
      <SectionCard title="Registration Window">
        <div style={{ marginBottom: 14 }}>
          <Grid cols="1fr 1fr" gap={16} mobile="1">
            <Field label="Registration Opens" hint="Leave blank to open immediately on publish">
              <input type="datetime-local" className="wiz-input" value={form.registration_opens_at} onChange={e => set("registration_opens_at", e.target.value)} />
            </Field>
            <Field label="Registration Closes *" required error={errors.registration_closes_at} hint="After this date/time, new registrations are blocked">
              <input type="datetime-local" className="wiz-input" value={form.registration_closes_at} onChange={e => set("registration_closes_at", e.target.value)} />
            </Field>
          </Grid>
        </div>
        <div style={{ marginBottom: 14 }}>
          <Grid cols="1fr 1fr" gap={16} mobile="1">
            <Field label="Early Bird Ends" hint="Optional — for tiered pricing">
              <input type="datetime-local" className="wiz-input" value={form.early_bird_ends_at} onChange={e => set("early_bird_ends_at", e.target.value)} />
            </Field>
            <Field label="Total Capacity" hint="Across all races. Blank = unlimited.">
              <input type="number" className="wiz-input" value={form.max_participants} onChange={e => set("max_participants", e.target.value)} placeholder="Unlimited" min="1" />
            </Field>
          </Grid>
        </div>
      </SectionCard>

      <SectionCard title="Registration Options">
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 16, marginBottom: 20 }}>
          <Toggle value={form.require_login}        onChange={v => set("require_login", v)}        label="Require Login"        hint="Participants must be logged in to register" />
          <Toggle value={form.waiting_list_enabled} onChange={v => set("waiting_list_enabled", v)} label="Enable Waiting List"  hint="Accept registrations after capacity is full" />
          <Toggle value={form.approval_required}    onChange={v => set("approval_required", v)}    label="Manual Approval"      hint="Admin must approve each registration before it's confirmed" />
          <Toggle value={form.collect_tshirt}       onChange={v => set("collect_tshirt", v)}       label="Collect T-Shirt Size" hint="Participants choose a size (XS–XXXL) during registration" />
        </div>
      </SectionCard>

      <SectionCard title="Legacy Built-in Fields">
        <div style={{ fontSize: 12, color: "#555", marginBottom: 14 }}>
          Quick toggles for standard fields. For new events, use the Form Builder below — it provides
          these same fields as pre-built templates with full customisation options.
        </div>
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 14 }}>
          <Toggle value={regConfig.require_gender}            onChange={v => setRC("require_gender", v)}            label="Require Gender" />
          <Toggle value={regConfig.require_dob}               onChange={v => setRC("require_dob", v)}               label="Require Date of Birth" />
          <Toggle value={regConfig.require_blood_group}       onChange={v => setRC("require_blood_group", v)}       label="Require Blood Group" />
          <Toggle value={regConfig.require_emergency_contact} onChange={v => setRC("require_emergency_contact", v)} label="Require Emergency Contact" />
          <Toggle value={regConfig.show_notes}                onChange={v => setRC("show_notes", v)}                label="Show Notes / Special Requests Field" />
        </div>
        {regConfig.show_notes && (
          <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
            <Grid cols="1fr 1fr" gap={14} mobile="1">
              <Field label="Notes Field Label">
                <input className="wiz-input" value={regConfig.notes_label} onChange={e => setRC("notes_label", e.target.value)} placeholder="Notes / Special Requests" />
              </Field>
              <Field label="Notes Placeholder Text">
                <input className="wiz-input" value={regConfig.notes_placeholder} onChange={e => setRC("notes_placeholder", e.target.value)} placeholder="Medical conditions, dietary needs…" />
              </Field>
            </Grid>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Policies">
        <Grid cols="1fr 1fr" gap={16} mobile="1">
          <Field label="Refund Policy">
            <textarea className="wiz-textarea" style={{ minHeight: 80 }} value={form.refund_policy} onChange={e => set("refund_policy", e.target.value)} placeholder="e.g. No refunds after registration is confirmed." />
          </Field>
          <Field label="Cancellation Policy">
            <textarea className="wiz-textarea" style={{ minHeight: 80 }} value={form.cancellation_policy} onChange={e => set("cancellation_policy", e.target.value)} placeholder="e.g. Cancellations accepted up to 48 hours before the event." />
          </Field>
        </Grid>
      </SectionCard>

      <SectionCard title="Registration Form Builder">
        <div style={{ fontSize: 12, color: "#555", marginBottom: 16 }}>
          Build the complete registration form. Use pre-built templates (Gender, Blood Group, T-Shirt Size,
          Emergency Contact, Notes) or create custom fields. Drag to reorder. Set conditional logic and
          category filters per field. Save the event first to unlock this builder.
        </div>
        <EventFormBuilder
          eventId={eventId}
          races={races.filter(r => r.name.trim() || r.distance.trim()).map(r => ({ id: r.id ?? "", name: r.name, distance: r.distance }))}
        />
      </SectionCard>
    </div>
  );
}

// ── Step 3: Content & Media ───────────────────────────────────────────────────

function StepContent({
  form, set, eventId, onAutoSave,
}: {
  form:       WizardState;
  set:        (k: keyof WizardState, v: unknown) => void;
  eventId:    string | null;
  onAutoSave: () => Promise<string | null>;
}) {
  const [galUploading, setGalUploading] = useState(false);
  const [galError,     setGalError]     = useState("");
  const galInputRef = useRef<HTMLInputElement>(null);

  async function addGalleryImage(file: File) {
    setGalUploading(true); setGalError("");
    try {
      let id = eventId;
      if (!id) { id = await onAutoSave(); if (!id) { setGalError("Enter title, date & venue first"); setGalUploading(false); return; } }
      const fd = new FormData();
      fd.append("file", file); fd.append("purpose", "gallery");
      const res  = await fetch(`/api/admin/events/${id}/upload`, { method: "POST", body: fd });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) { setGalError(data.error ?? "Upload failed"); return; }
      set("gallery_images", [...form.gallery_images, data.url]);
    } catch { setGalError("Network error"); }
    finally { setGalUploading(false); if (galInputRef.current) galInputRef.current.value = ""; }
  }

  return (
    <div>
      <SectionCard title="Event Highlights">
        <div style={{ fontSize: 12, color: "#555", marginBottom: 12 }}>Key selling points shown prominently on the event page (4–6 is ideal)</div>
        <HighlightsEditor items={form.highlights} onChange={items => set("highlights", items)} />
      </SectionCard>

      <SectionCard title="FAQs">
        <div style={{ fontSize: 12, color: "#555", marginBottom: 12 }}>Common questions answered for participants</div>
        <FaqEditor faqs={form.faqs} onChange={faqs => set("faqs", faqs)} />
      </SectionCard>

      <SectionCard title="Terms & Conditions">
        <div style={{ fontSize: 12, color: "#555", marginBottom: 10 }}>Participants must agree to these before completing registration</div>
        <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
          <RichTextEditor
            content={form.terms_conditions}
            onChange={(html) => set("terms_conditions", html)}
            placeholder="Participation waivers, event rules, indemnity clause…"
            minHeight={120}
          />
        </div>
      </SectionCard>

      <SectionCard title="Banner Image">
        <WizardImageUploader
          eventId={eventId}
          purpose="banner"
          currentUrl={form.banner_image}
          onUploaded={url => set("banner_image", url)}
          onAutoSave={onAutoSave}
          height={180}
          hint="Wide banner (16:9 ratio) displayed at the top of the event page. Optional — cover image is used as fallback."
        />
      </SectionCard>

      <SectionCard title={`Gallery (${form.gallery_images.length} image${form.gallery_images.length !== 1 ? "s" : ""})`}>
        <div style={{ fontSize: 12, color: "#555", marginBottom: 12 }}>Additional photos shown in the event gallery</div>

        {form.gallery_images.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10, marginBottom: 14 }}>
            {form.gallery_images.map((url, i) => (
              <div key={i} style={{ position: "relative", borderRadius: 8, overflow: "hidden", aspectRatio: "4/3" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <button
                  onClick={() => set("gallery_images", form.gallery_images.filter((_, idx) => idx !== i))}
                  style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.7)", border: "none", borderRadius: "50%", width: 22, height: 22, color: "#f87171", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit", lineHeight: 1 }}
                >×</button>
              </div>
            ))}
          </div>
        )}

        <div
          onClick={() => !galUploading && galInputRef.current?.click()}
          style={{ border: "2px dashed rgba(255,255,255,0.12)", borderRadius: 10, padding: "20px", textAlign: "center", cursor: galUploading ? "wait" : "pointer", color: "#555", transition: "border-color 0.15s" }}
          onMouseEnter={e => { if (!galUploading) (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(232,98,10,0.4)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.12)"; }}
        >
          {galUploading
            ? <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Spinner size={16} /><span style={{ fontSize: 12 }}>Uploading…</span></div>
            : <><div style={{ fontSize: 28, marginBottom: 4 }}>+</div><div style={{ fontSize: 12 }}>Click to add photos to the gallery</div></>
          }
        </div>
        {galError && <div style={{ fontSize: 11, color: "#f87171", marginTop: 6 }}>{galError}</div>}
        <input ref={galInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) addGalleryImage(f); }} />
      </SectionCard>

      <SectionCard title="Community Links">
        <Field label="WhatsApp Community URL" hint="Invite link shown to participants after registration so they can join the event group">
          <input
            className="wiz-input"
            value={form.whatsapp_community_url}
            onChange={e => set("whatsapp_community_url", e.target.value)}
            placeholder="https://chat.whatsapp.com/…"
          />
        </Field>
      </SectionCard>
    </div>
  );
}

// ── Step 4: Review & Publish ──────────────────────────────────────────────────

function StepReview({
  form, races, skipRaces, isReady, eventId, shareSlug, onPublish, onPreview, saving,
}: {
  form:      WizardState;
  races:     RaceForm[];
  skipRaces: boolean;
  isReady:   boolean;
  eventId:   string | null;
  shareSlug: string | null;
  onPublish: () => void;
  onPreview: () => void;
  saving:    boolean;
}) {
  const Row = ({ label, value }: { label: string; value: string | undefined | null }) =>
    value ? (
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <span style={{ width: 140, flexShrink: 0, fontSize: 11, color: "#444", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".05em", paddingTop: 1 }}>{label}</span>
        <span style={{ fontSize: 13, color: "#ccc", lineHeight: 1.5 }}>{value}</span>
      </div>
    ) : null;

  const descText = form.description.replace(/<[^>]*>/g, "").trim().slice(0, 120);

  return (
    <div>
      {/* Preview button */}
      {shareSlug && (
        <div style={{ marginBottom: 20, padding: "14px 18px", background: "rgba(232,98,10,0.06)", border: "1px solid rgba(232,98,10,0.2)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" as const }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: "#e8620a" }}>Preview your event</div>
            <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>Opens the participant view in a new tab — only you can see it until published</div>
          </div>
          <Button size="sm" variant="secondary" onClick={onPreview} loading={saving}>👁 Preview</Button>
        </div>
      )}

      <SectionCard title="Event Summary">
        <Row label="Event Name"    value={form.title} />
        <Row label="Tagline"       value={form.short_description} />
        <Row label="Category"      value={form.event_category ? form.event_category.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase()) : undefined} />
        <Row label="Date"          value={form.start_date + (form.end_date && form.end_date !== form.start_date ? ` → ${form.end_date}` : "")} />
        <Row label="Time"          value={[form.start_time, form.end_time].filter(Boolean).join(" – ")} />
        <Row label="Venue"         value={form.location} />
        <Row label="Meeting Point" value={form.meeting_point} />
        <Row label="Organizer"     value={form.organizer} />
        <Row label="Reg. Closes"   value={form.registration_closes_at?.replace("T", " at ").slice(0, 16)} />
        <Row label="Capacity"      value={form.max_participants ? `${form.max_participants} participants` : "Unlimited"} />
        <Row label="Visibility"    value={form.visibility.charAt(0).toUpperCase() + form.visibility.slice(1)} />
        <Row label="Description"   value={descText ? `${descText}…` : null} />
        {form.highlights.length > 0 && <Row label="Highlights"  value={`${form.highlights.length} added`} />}
        {form.faqs.length > 0 && <Row label="FAQs"         value={`${form.faqs.length} added`} />}
        {form.gallery_images.length > 0 && <Row label="Gallery" value={`${form.gallery_images.length} photo${form.gallery_images.length !== 1 ? "s" : ""}`} />}
      </SectionCard>

      {!skipRaces && races.length > 0 && (
        <SectionCard title={`Races / Categories (${races.length})`}>
          {races.map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < races.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", flexWrap: "wrap" as const, gap: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontWeight: 700, color: "#fff" }}>{r.name}</span>
                {r.distance && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.07)", color: "#666" }}>{r.distance}</span>}
              </div>
              <div style={{ display: "flex", gap: 10, fontSize: 12, color: "#555", alignItems: "center" }}>
                {r.price ? <span style={{ color: "#e8620a", fontWeight: 700 }}>₹{r.price}</span> : <span>Free</span>}
                {r.max_slots && <span>{r.max_slots} slots</span>}
                {r.gun_time && <span>🏁 {r.gun_time}</span>}
              </div>
            </div>
          ))}
        </SectionCard>
      )}

      {skipRaces && (
        <div style={{ padding: "12px 16px", background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)", marginBottom: 20, fontSize: 13, color: "#555" }}>
          No race categories — participants register directly
        </div>
      )}

      {/* Missing fields warning */}
      {!isReady && (
        <div style={{ padding: "14px 18px", background: "rgba(251,191,36,0.07)", borderRadius: 10, border: "1px solid rgba(251,191,36,0.2)", marginBottom: 20 }}>
          <div style={{ fontWeight: 700, color: "#fbbf24", marginBottom: 6, fontSize: 13 }}>⚠️ Some required fields are missing</div>
          <div style={{ fontSize: 12, color: "#666", lineHeight: 1.8 }}>
            {!form.title && "• Event name  "}
            {!form.start_date && "• Start date  "}
            {!form.location && "• Venue  "}
            {!form.registration_closes_at && "• Registration close date"}
          </div>
        </div>
      )}

      {/* Publish card */}
      <div style={{ background: isReady ? "rgba(22,163,74,0.08)" : "rgba(255,255,255,0.02)", border: `1px solid ${isReady ? "rgba(22,163,74,0.2)" : "rgba(255,255,255,0.07)"}`, borderRadius: 14, padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" as const }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: isReady ? "#4ade80" : "#555", marginBottom: 4 }}>
            {isReady ? "Ready to publish!" : "Complete the form to publish"}
          </div>
          <div style={{ fontSize: 13, color: "#444", lineHeight: 1.5 }}>
            {isReady ? "The event goes live immediately and appears on the website." : "Go back and fill in the required fields."}
          </div>
          {!eventId && <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>This event hasn&apos;t been saved to the server yet — we&apos;ll save it on publish.</div>}
          {eventId && <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>Event ID: {eventId}</div>}
        </div>
        <Button loading={saving} disabled={!isReady} onClick={onPublish}>🚀 Publish Now</Button>
      </div>
    </div>
  );
}

// ── Template Picker Modal ─────────────────────────────────────────────────────

const CATEGORY_EMOJI: Record<string, string> = {
  community: "🤝", marathon: "🏆", corporate: "🏢", virtual: "💻",
  walkathon: "🚶", cycling: "🚴", triathlon: "🔱",
};

function TemplatePicker({
  templates, loading, onSelect, onDelete, onClose,
}: {
  templates: EventTemplate[];
  loading:   boolean;
  onSelect:  (t: EventTemplate) => void;
  onDelete:  (id: string) => void;
  onClose:   () => void;
}) {
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.82)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "80vh", display: "flex", flexDirection: "column" as const, overflow: "hidden" }}>

        <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#fff" }}>Start from Template</div>
            <div style={{ fontSize: 11, color: "#555", marginTop: 3, lineHeight: 1.5 }}>
              Pre-fills category, races, organizer, and policies.<br />
              You still fill in: title, dates, venue, and registration window.
            </div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.07)", border: "none", borderRadius: 8, width: 30, height: 30, cursor: "pointer", color: "#888", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit", flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "12px 14px" }}>
          {loading && <div style={{ textAlign: "center", padding: "2.5rem", color: "#555", fontSize: 13 }}>Loading templates…</div>}

          {!loading && templates.length === 0 && (
            <div style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🗂️</div>
              <div style={{ fontWeight: 700, color: "#555", fontSize: 14, marginBottom: 8 }}>No templates yet</div>
              <div style={{ fontSize: 12, color: "#333", lineHeight: 1.6 }}>
                Open any event → <strong style={{ color: "#555" }}>Settings</strong> → <strong style={{ color: "#555" }}>Save as Template</strong><br />
                to save a reusable configuration.
              </div>
            </div>
          )}

          {!loading && templates.map(t => (
            <div
              key={t.id}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, marginBottom: 8, cursor: "pointer", transition: "border-color 0.15s" }}
              onClick={() => onSelect(t)}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(232,98,10,0.4)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.07)"; }}
            >
              <div style={{ width: 42, height: 42, borderRadius: 10, background: "rgba(232,98,10,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                {CATEGORY_EMOJI[t.event_category] ?? "📋"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{t.name}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 3, fontSize: 11, color: "#555", flexWrap: "wrap" as const }}>
                  <span>{t.event_category}</span>
                  {t.races.length > 0 && <span>· {t.races.length} race{t.races.length !== 1 ? "s" : ""}</span>}
                  <span>· {new Date(t.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                <button onClick={() => onSelect(t)} style={{ background: "#e8620a", border: "none", borderRadius: 7, padding: "5px 12px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Apply</button>
                <button onClick={() => { if (confirm(`Delete template "${t.name}"?`)) onDelete(t.id); }} style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 7, padding: "5px 8px", color: "#f87171", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
