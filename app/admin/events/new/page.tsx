"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RaceForm {
  id?:                string;
  name:               string;
  distance:           string;
  price:              string;
  max_slots:          string;
  reporting_time:     string;
  gun_time:           string;
  timing_chip:        boolean;
  auto_bib:           boolean;
  gender_restriction: string;
  min_age:            string;
  max_age:            string;
  description:        string;
}

interface WizardState {
  // Step 1 — Event Details
  title:              string;
  event_category:     string;
  event_type:         string;
  description:        string;
  start_date:         string;
  end_date:           string;
  start_time:         string;
  end_time:           string;
  location:           string;
  meeting_point:      string;
  maps_url:           string;
  organizer:          string;
  organizer_email:    string;
  organizer_phone:    string;
  support_email:      string;
  cover_image:        string;
  website:            string;
  // Step 2 — Races (stored separately via API)
  // Step 3 — Registration Settings
  registration_closes_at:  string;
  early_bird_ends_at:      string;
  max_participants:        string;
  waiting_list_enabled:    boolean;
  require_login:           boolean;
  approval_required:       boolean;
  refund_policy:           string;
  cancellation_policy:     string;
  // Step 4 — Publish
  visibility:         string;
}

const BLANK: WizardState = {
  title: "", event_category: "community", event_type: "running",
  description: "", start_date: "", end_date: "", start_time: "", end_time: "",
  location: "", meeting_point: "", maps_url: "", organizer: "Connected Steps",
  organizer_email: "info@connectedsteps.in", organizer_phone: "+91 97036 20570",
  support_email: "info@connectedsteps.in", cover_image: "", website: "",
  registration_closes_at: "", early_bird_ends_at: "", max_participants: "",
  waiting_list_enabled: false, require_login: true, approval_required: false,
  refund_policy: "", cancellation_policy: "",
  visibility: "public",
};

const BLANK_RACE: RaceForm = {
  name: "", distance: "", price: "", max_slots: "",
  reporting_time: "", gun_time: "", timing_chip: false, auto_bib: false,
  gender_restriction: "", min_age: "", max_age: "", description: "",
};

const STEPS = ["Event Details", "Race Setup", "Registration", "Review & Publish"];

const EVENT_CATEGORIES = [
  { value: "community",  label: "Community Run" },
  { value: "marathon",   label: "Marathon / Half Marathon" },
  { value: "corporate",  label: "Corporate Wellness" },
  { value: "virtual",    label: "Virtual Challenge" },
  { value: "walkathon",  label: "Walkathon" },
  { value: "cycling",    label: "Cycling Event" },
  { value: "triathlon",  label: "Triathlon" },
];

const EVENT_TYPES = [
  { value: "running",   label: "Running" },
  { value: "cycling",   label: "Cycling" },
  { value: "training",  label: "Training" },
  { value: "race",      label: "Race" },
  { value: "community", label: "Community" },
  { value: "workshop",  label: "Workshop" },
];

const DISTANCES = ["5K", "10K", "15K", "21.1K", "42.2K", "Custom"];

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  page:    { minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "inherit" } as React.CSSProperties,
  header:  { position: "sticky" as const, top: 0, zIndex: 40, background: "rgba(10,10,10,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 2rem", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" } as React.CSSProperties,
  main:    { maxWidth: 900, margin: "0 auto", padding: "2rem 1.5rem" } as React.CSSProperties,
  card:    { background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "1.75rem" } as React.CSSProperties,
  label:   { display: "block", fontSize: 11, fontWeight: 700, color: "#666", textTransform: "uppercase" as const, letterSpacing: ".07em", marginBottom: 6 } as React.CSSProperties,
  input:   { width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const } as React.CSSProperties,
  textarea:{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const, resize: "vertical" as const, minHeight: 100 } as React.CSSProperties,
  select:  { width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const, cursor: "pointer" } as React.CSSProperties,
  btn:     (primary = true): React.CSSProperties => ({ padding: "10px 22px", background: primary ? "#e8620a" : "rgba(255,255,255,0.06)", border: primary ? "none" : "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: primary ? "#fff" : "#aaa", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }),
  row:     { display: "grid", gap: 16 } as React.CSSProperties,
  section: { marginBottom: 28 } as React.CSSProperties,
  h2:      { fontSize: 13, fontWeight: 700, color: "#e8620a", textTransform: "uppercase" as const, letterSpacing: ".08em", marginBottom: 16 } as React.CSSProperties,
  err:     { color: "#f87171", fontSize: 13, marginTop: 4 } as React.CSSProperties,
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function NewEventWizard() {
  const router                            = useRouter();
  const [step,     setStep]               = useState(0);
  const [form,     setForm]               = useState<WizardState>(BLANK);
  const [races,    setRaces]              = useState<RaceForm[]>([]);
  const [raceForm, setRaceForm]           = useState<RaceForm>(BLANK_RACE);
  const [editIdx,  setEditIdx]            = useState<number | null>(null);
  const [eventId,  setEventId]            = useState<string | null>(null);
  const [saving,   setSaving]             = useState(false);
  const [errors,   setErrors]             = useState<Record<string, string>>({});
  const [toast,    setToast]              = useState("");
  const autoSaveRef                       = useRef<ReturnType<typeof setTimeout>>(null);

  // ── Local draft recovery ──────────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem("cs_new_event_draft");
    if (saved) {
      try {
        const d = JSON.parse(saved) as { form: WizardState; races: RaceForm[]; step: number; eventId: string | null };
        setForm(d.form); setRaces(d.races ?? []); setStep(d.step ?? 0); setEventId(d.eventId ?? null);
      } catch { /* ignore */ }
    }
  }, []);

  const saveDraft = useCallback(() => {
    localStorage.setItem("cs_new_event_draft", JSON.stringify({ form, races, step, eventId }));
  }, [form, races, step, eventId]);

  useEffect(() => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(saveDraft, 800);
  }, [form, races, saveDraft]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  // ── Field helpers ─────────────────────────────────────────────────────────
  const set = (k: keyof WizardState, v: unknown) =>
    setForm(p => ({ ...p, [k]: v }));

  const setRaceField = (k: keyof RaceForm, v: unknown) =>
    setRaceForm(p => ({ ...p, [k]: v }));

  // ── Validation ────────────────────────────────────────────────────────────
  function validate(): boolean {
    const e: Record<string, string> = {};
    if (step === 0) {
      if (!form.title.trim())       e.title       = "Event name is required";
      if (!form.start_date)         e.start_date  = "Start date is required";
      if (!form.location.trim())    e.location    = "Location is required";
      if (!form.description.trim()) e.description = "Description is required";
    }
    if (step === 1 && races.length === 0) {
      e.races = "Add at least one race";
    }
    if (step === 2) {
      if (!form.registration_closes_at) e.registration_closes_at = "Registration close date is required";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Save event to server ──────────────────────────────────────────────────
  async function saveEventToServer(publish = false): Promise<string | null> {
    setSaving(true);
    try {
      const body = {
        title:                  form.title.trim(),
        description:            form.description,
        event_type:             form.event_type,
        event_category:         form.event_category,
        cover_image:            form.cover_image || null,
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
        registration_closes_at: form.registration_closes_at || null,
        early_bird_ends_at:     form.early_bird_ends_at || null,
        max_participants:       form.max_participants ? Number(form.max_participants) : null,
        waiting_list_enabled:   form.waiting_list_enabled,
        require_login:          form.require_login,
        approval_required:      form.approval_required,
        refund_policy:          form.refund_policy || null,
        cancellation_policy:    form.cancellation_policy || null,
        visibility:             form.visibility,
        status:                 publish ? "published" : "draft",
        price:                  races[0] ? Number(races[0].price) || 0 : 0,
        registration_required:  true,
      };

      const method = eventId ? "PATCH" : "POST";
      const url    = eventId ? `/api/admin/events` : `/api/admin/events`;
      const patchBody = eventId ? { id: eventId, ...body } : body;

      const res  = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(patchBody) });
      const data = await res.json();

      if (!res.ok) { showToast(data.error ?? "Save failed"); return null; }

      const id = data.data?.id ?? eventId;
      if (id) setEventId(id);

      // Save races to server if event exists
      if (id && races.length > 0) {
        // First delete existing races, then re-create (simple approach for wizard)
        const existing = await fetch(`/api/admin/events/${id}/races`).then(r => r.json()) as { races: { id: string }[] };
        for (const r of existing.races ?? []) {
          await fetch(`/api/admin/events/${id}/races`, {
            method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id }),
          });
        }
        for (let i = 0; i < races.length; i++) {
          const race = races[i];
          await fetch(`/api/admin/events/${id}/races`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...race, display_order: i,
              price:    Number(race.price) || 0,
              max_slots: race.max_slots ? Number(race.max_slots) : null,
              min_age:   race.min_age ? Number(race.min_age) : null,
              max_age:   race.max_age ? Number(race.max_age) : null,
            }),
          });
        }
      }

      return id ?? null;
    } catch (e) {
      showToast(String(e));
      return null;
    } finally {
      setSaving(false);
    }
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  async function handleNext() {
    if (!validate()) return;
    if (step < STEPS.length - 1) {
      if (step === 0 || step === 2) await saveEventToServer(false);
      setStep(s => s + 1);
    }
  }

  function handleBack() { setStep(s => Math.max(0, s - 1)); }

  async function handleSaveDraft() {
    const id = await saveEventToServer(false);
    if (id) showToast("Draft saved");
  }

  async function handlePublish() {
    if (!validate()) return;
    const id = await saveEventToServer(true);
    if (id) {
      localStorage.removeItem("cs_new_event_draft");
      showToast("Event published!");
      setTimeout(() => router.push(`/admin/events/${id}/manage`), 1200);
    }
  }

  // ── Race management ───────────────────────────────────────────────────────
  function addOrUpdateRace() {
    if (!raceForm.name.trim() || !raceForm.distance.trim()) {
      setErrors(e => ({ ...e, race_name: "Race name and distance are required" }));
      return;
    }
    setErrors(e => { const n = { ...e }; delete n.race_name; delete n.races; return n; });
    if (editIdx !== null) {
      setRaces(rs => rs.map((r, i) => i === editIdx ? { ...raceForm } : r));
      setEditIdx(null);
    } else {
      setRaces(rs => [...rs, { ...raceForm }]);
    }
    setRaceForm(BLANK_RACE);
  }

  function editRace(i: number)   { setRaceForm({ ...races[i] }); setEditIdx(i); }
  function deleteRace(i: number) { setRaces(rs => rs.filter((_, idx) => idx !== i)); if (editIdx === i) { setEditIdx(null); setRaceForm(BLANK_RACE); } }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      {/* Header */}
      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/admin/events" style={{ textDecoration: "none" }}>
            <Image src="/logo.png" alt="" width={28} height={28} style={{ borderRadius: "50%" }} />
          </Link>
          <span style={{ fontWeight: 700, fontSize: 15 }}>New Event</span>
          <span style={{ fontSize: 12, color: "#555", marginLeft: 4 }}>
            {form.title || "Untitled Event"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={handleSaveDraft} disabled={saving} style={S.btn(false)}>
            {saving ? "Saving…" : "Save Draft"}
          </button>
          <Link href="/admin/events" style={{ ...S.btn(false), textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
            Cancel
          </Link>
        </div>
      </header>

      {/* Progress Steps */}
      <div style={{ background: "#0f0f0f", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "1rem 2rem" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", gap: 0, alignItems: "center" }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ display: "flex", alignItems: "center", flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: i < step ? "pointer" : "default" }}
                   onClick={() => i < step && setStep(i)}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                  background: i < step ? "#4ade80" : i === step ? "#e8620a" : "rgba(255,255,255,0.08)",
                  fontSize: 12, fontWeight: 700, flexShrink: 0,
                  color: i <= step ? "#fff" : "#555",
                }}>
                  {i < step ? "✓" : i + 1}
                </div>
                <span style={{ fontSize: 13, fontWeight: i === step ? 700 : 400, color: i === step ? "#fff" : i < step ? "#4ade80" : "#555", whiteSpace: "nowrap" }}>
                  {s}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{ flex: 1, height: 1, background: i < step ? "#4ade80" : "rgba(255,255,255,0.07)", margin: "0 12px" }} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={S.main}>
        {/* Step 1 — Event Details */}
        {step === 0 && <StepDetails form={form} set={set} errors={errors} />}

        {/* Step 2 — Race Setup */}
        {step === 1 && (
          <StepRaces
            races={races} raceForm={raceForm} setRaceField={setRaceField}
            editIdx={editIdx} errors={errors}
            onAdd={addOrUpdateRace} onEdit={editRace} onDelete={deleteRace}
            onCancel={() => { setEditIdx(null); setRaceForm(BLANK_RACE); }}
          />
        )}

        {/* Step 3 — Registration Settings */}
        {step === 2 && <StepRegistration form={form} set={set} errors={errors} />}

        {/* Step 4 — Review & Publish */}
        {step === 3 && <StepReview form={form} races={races} onPublish={handlePublish} saving={saving} />}

        {/* Navigation */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28 }}>
          <button onClick={handleBack} disabled={step === 0} style={{ ...S.btn(false), opacity: step === 0 ? 0.4 : 1 }}>
            ← Back
          </button>
          {step < STEPS.length - 1 ? (
            <button onClick={handleNext} disabled={saving} style={S.btn()}>
              {saving ? "Saving…" : "Continue →"}
            </button>
          ) : (
            <button onClick={handlePublish} disabled={saving} style={{ ...S.btn(), background: "#16a34a" }}>
              {saving ? "Publishing…" : "🚀 Publish Event"}
            </button>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 24, padding: "10px 20px", fontSize: 13, fontWeight: 600, color: "#fff", zIndex: 9999, whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Step 1: Event Details ─────────────────────────────────────────────────────

function StepDetails({ form, set, errors }: { form: WizardState; set: (k: keyof WizardState, v: unknown) => void; errors: Record<string, string> }) {
  return (
    <div>
      <div style={S.section}>
        <div style={S.h2}>Event Details</div>
        <div style={{ ...S.card }}>
          <div style={{ ...S.row, gridTemplateColumns: "1fr 1fr", marginBottom: 16 }}>
            <div>
              <label style={S.label}>Event Name *</label>
              <input style={S.input} value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. Connected Steps 5K Community Run" />
              {errors.title && <div style={S.err}>{errors.title}</div>}
            </div>
            <div>
              <label style={S.label}>Event Category *</label>
              <select style={S.select} value={form.event_category} onChange={e => set("event_category", e.target.value)}>
                {EVENT_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ ...S.row, gridTemplateColumns: "1fr 1fr", marginBottom: 16 }}>
            <div>
              <label style={S.label}>Event Type</label>
              <select style={S.select} value={form.event_type} onChange={e => set("event_type", e.target.value)}>
                {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Visibility</label>
              <select style={S.select} value={form.visibility} onChange={e => set("visibility", e.target.value)}>
                <option value="public">Public</option>
                <option value="private">Private (link only)</option>
                <option value="unlisted">Unlisted</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={S.label}>Description *</label>
            <textarea style={S.textarea} value={form.description} onChange={e => set("description", e.target.value)} placeholder="Tell participants about the event…" rows={4} />
            {errors.description && <div style={S.err}>{errors.description}</div>}
          </div>

          <div style={{ marginBottom: 0 }}>
            <label style={S.label}>Cover Image URL</label>
            <input style={S.input} value={form.cover_image} onChange={e => set("cover_image", e.target.value)} placeholder="https://…" />
          </div>
        </div>
      </div>

      <div style={S.section}>
        <div style={S.h2}>Date & Time</div>
        <div style={S.card}>
          <div style={{ ...S.row, gridTemplateColumns: "1fr 1fr 1fr 1fr", marginBottom: 0 }}>
            <div>
              <label style={S.label}>Start Date *</label>
              <input type="date" style={S.input} value={form.start_date} onChange={e => set("start_date", e.target.value)} />
              {errors.start_date && <div style={S.err}>{errors.start_date}</div>}
            </div>
            <div>
              <label style={S.label}>End Date</label>
              <input type="date" style={S.input} value={form.end_date} onChange={e => set("end_date", e.target.value)} />
            </div>
            <div>
              <label style={S.label}>Start Time</label>
              <input type="time" style={S.input} value={form.start_time} onChange={e => set("start_time", e.target.value)} />
            </div>
            <div>
              <label style={S.label}>End Time</label>
              <input type="time" style={S.input} value={form.end_time} onChange={e => set("end_time", e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      <div style={S.section}>
        <div style={S.h2}>Location</div>
        <div style={S.card}>
          <div style={{ ...S.row, gridTemplateColumns: "1fr", marginBottom: 16 }}>
            <div>
              <label style={S.label}>Venue / Address *</label>
              <input style={S.input} value={form.location} onChange={e => set("location", e.target.value)} placeholder="Botanical Garden, Kondapur, Hyderabad" />
              {errors.location && <div style={S.err}>{errors.location}</div>}
            </div>
          </div>
          <div style={{ ...S.row, gridTemplateColumns: "1fr 1fr", marginBottom: 0 }}>
            <div>
              <label style={S.label}>Meeting Point</label>
              <input style={S.input} value={form.meeting_point} onChange={e => set("meeting_point", e.target.value)} placeholder="Gate 1, Parking lot" />
            </div>
            <div>
              <label style={S.label}>Google Maps URL</label>
              <input style={S.input} value={form.maps_url} onChange={e => set("maps_url", e.target.value)} placeholder="https://maps.google.com/…" />
            </div>
          </div>
        </div>
      </div>

      <div style={S.section}>
        <div style={S.h2}>Organizer</div>
        <div style={S.card}>
          <div style={{ ...S.row, gridTemplateColumns: "1fr 1fr", marginBottom: 16 }}>
            <div>
              <label style={S.label}>Organizer Name</label>
              <input style={S.input} value={form.organizer} onChange={e => set("organizer", e.target.value)} />
            </div>
            <div>
              <label style={S.label}>Website</label>
              <input style={S.input} value={form.website} onChange={e => set("website", e.target.value)} placeholder="https://connectedsteps.in" />
            </div>
          </div>
          <div style={{ ...S.row, gridTemplateColumns: "1fr 1fr 1fr" }}>
            <div>
              <label style={S.label}>Organizer Email</label>
              <input type="email" style={S.input} value={form.organizer_email} onChange={e => set("organizer_email", e.target.value)} />
            </div>
            <div>
              <label style={S.label}>Organizer Phone</label>
              <input style={S.input} value={form.organizer_phone} onChange={e => set("organizer_phone", e.target.value)} />
            </div>
            <div>
              <label style={S.label}>Support Email</label>
              <input type="email" style={S.input} value={form.support_email} onChange={e => set("support_email", e.target.value)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Step 2: Race Setup ────────────────────────────────────────────────────────

function StepRaces({
  races, raceForm, setRaceField, editIdx, errors,
  onAdd, onEdit, onDelete, onCancel,
}: {
  races:        RaceForm[];
  raceForm:     RaceForm;
  setRaceField: (k: keyof RaceForm, v: unknown) => void;
  editIdx:      number | null;
  errors:       Record<string, string>;
  onAdd:        () => void;
  onEdit:       (i: number) => void;
  onDelete:     (i: number) => void;
  onCancel:     () => void;
}) {
  return (
    <div>
      <div style={S.section}>
        <div style={S.h2}>Race Configuration</div>
        <p style={{ fontSize: 13, color: "#555", marginBottom: 16, marginTop: -8 }}>
          Add one or more races. Each race has its own distance, price, and slot limit.
        </p>

        {/* Existing races */}
        {races.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            {races.map((r, i) => (
              <div key={i} style={{ ...S.card, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem" }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{r.name}</span>
                  <span style={{ fontSize: 12, color: "#555", marginLeft: 8 }}>{r.distance}</span>
                  {r.price && <span style={{ fontSize: 12, color: "#e8620a", marginLeft: 8, fontWeight: 600 }}>₹{r.price}</span>}
                  {r.max_slots && <span style={{ fontSize: 12, color: "#888", marginLeft: 8 }}>{r.max_slots} slots</span>}
                  {r.reporting_time && <span style={{ fontSize: 12, color: "#666", marginLeft: 8 }}>Report: {r.reporting_time}</span>}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => onEdit(i)} style={{ ...S.btn(false), padding: "5px 12px", fontSize: 12 }}>Edit</button>
                  <button onClick={() => onDelete(i)} style={{ ...S.btn(false), padding: "5px 12px", fontSize: 12, color: "#f87171", borderColor: "rgba(239,68,68,0.3)" }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {errors.races && <div style={{ ...S.err, marginBottom: 12 }}>{errors.races}</div>}

        {/* Add/Edit race form */}
        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#e8620a", marginBottom: 16 }}>
            {editIdx !== null ? "Edit Race" : "+ Add Race"}
          </div>

          <div style={{ ...S.row, gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 14 }}>
            <div>
              <label style={S.label}>Race Name *</label>
              <input style={S.input} value={raceForm.name} onChange={e => setRaceField("name", e.target.value)} placeholder="5K Open" />
              {errors.race_name && <div style={S.err}>{errors.race_name}</div>}
            </div>
            <div>
              <label style={S.label}>Distance *</label>
              <select style={S.select} value={DISTANCES.includes(raceForm.distance) ? raceForm.distance : "Custom"} onChange={e => {
                if (e.target.value !== "Custom") setRaceField("distance", e.target.value);
                else setRaceField("distance", "");
              }}>
                {DISTANCES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              {(!DISTANCES.slice(0, -1).includes(raceForm.distance)) && (
                <input style={{ ...S.input, marginTop: 6 }} value={raceForm.distance} onChange={e => setRaceField("distance", e.target.value)} placeholder="Custom distance (e.g. 3K)" />
              )}
            </div>
            <div>
              <label style={S.label}>Entry Fee (₹)</label>
              <input type="number" style={S.input} value={raceForm.price} onChange={e => setRaceField("price", e.target.value)} placeholder="0 for free" />
            </div>
          </div>

          <div style={{ ...S.row, gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 14 }}>
            <div>
              <label style={S.label}>Max Slots</label>
              <input type="number" style={S.input} value={raceForm.max_slots} onChange={e => setRaceField("max_slots", e.target.value)} placeholder="Unlimited" />
            </div>
            <div>
              <label style={S.label}>Reporting Time</label>
              <input type="time" style={S.input} value={raceForm.reporting_time} onChange={e => setRaceField("reporting_time", e.target.value)} />
            </div>
            <div>
              <label style={S.label}>Gun Time</label>
              <input type="time" style={S.input} value={raceForm.gun_time} onChange={e => setRaceField("gun_time", e.target.value)} />
            </div>
          </div>

          <div style={{ ...S.row, gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 16 }}>
            <div>
              <label style={S.label}>Gender</label>
              <select style={S.select} value={raceForm.gender_restriction} onChange={e => setRaceField("gender_restriction", e.target.value)}>
                <option value="">All Genders</option>
                <option value="male">Men Only</option>
                <option value="female">Women Only</option>
              </select>
            </div>
            <div>
              <label style={S.label}>Min Age</label>
              <input type="number" style={S.input} value={raceForm.min_age} onChange={e => setRaceField("min_age", e.target.value)} placeholder="No min" />
            </div>
            <div>
              <label style={S.label}>Max Age</label>
              <input type="number" style={S.input} value={raceForm.max_age} onChange={e => setRaceField("max_age", e.target.value)} placeholder="No max" />
            </div>
          </div>

          <div style={{ ...S.row, gridTemplateColumns: "auto auto 1fr", alignItems: "center", gap: 24, marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#ccc" }}>
              <input type="checkbox" checked={raceForm.timing_chip} onChange={e => setRaceField("timing_chip", e.target.checked)} />
              Timing Chip
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#ccc" }}>
              <input type="checkbox" checked={raceForm.auto_bib} onChange={e => setRaceField("auto_bib", e.target.checked)} />
              Auto-assign BIB
            </label>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onAdd} style={S.btn()}>
              {editIdx !== null ? "Update Race" : "Add Race"}
            </button>
            {editIdx !== null && (
              <button onClick={onCancel} style={S.btn(false)}>Cancel</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Step 3: Registration Settings ────────────────────────────────────────────

function StepRegistration({ form, set, errors }: { form: WizardState; set: (k: keyof WizardState, v: unknown) => void; errors: Record<string, string> }) {
  return (
    <div>
      <div style={S.section}>
        <div style={S.h2}>Registration Window</div>
        <div style={S.card}>
          <div style={{ ...S.row, gridTemplateColumns: "1fr 1fr", marginBottom: 16 }}>
            <div>
              <label style={S.label}>Registration Closes *</label>
              <input type="datetime-local" style={S.input} value={form.registration_closes_at} onChange={e => set("registration_closes_at", e.target.value)} />
              {errors.registration_closes_at && <div style={S.err}>{errors.registration_closes_at}</div>}
            </div>
            <div>
              <label style={S.label}>Early Bird Ends</label>
              <input type="datetime-local" style={S.input} value={form.early_bird_ends_at} onChange={e => set("early_bird_ends_at", e.target.value)} />
            </div>
          </div>
          <div style={{ ...S.row, gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <label style={S.label}>Max Participants</label>
              <input type="number" style={S.input} value={form.max_participants} onChange={e => set("max_participants", e.target.value)} placeholder="Unlimited" />
            </div>
          </div>
        </div>
      </div>

      <div style={S.section}>
        <div style={S.h2}>Policies</div>
        <div style={S.card}>
          <div style={{ ...S.row, gridTemplateColumns: "auto auto auto", gap: 32, marginBottom: 20, alignItems: "center" }}>
            {[
              { key: "require_login",       label: "Require Login" },
              { key: "waiting_list_enabled", label: "Enable Waiting List" },
              { key: "approval_required",   label: "Approval Required" },
            ].map(({ key, label }) => (
              <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#ccc" }}>
                <input type="checkbox" checked={Boolean(form[key as keyof WizardState])} onChange={e => set(key as keyof WizardState, e.target.checked)} />
                {label}
              </label>
            ))}
          </div>
          <div style={{ ...S.row, gridTemplateColumns: "1fr 1fr", marginBottom: 0 }}>
            <div>
              <label style={S.label}>Refund Policy</label>
              <textarea style={{ ...S.textarea, minHeight: 80 }} value={form.refund_policy} onChange={e => set("refund_policy", e.target.value)} placeholder="No refunds after registration…" />
            </div>
            <div>
              <label style={S.label}>Cancellation Policy</label>
              <textarea style={{ ...S.textarea, minHeight: 80 }} value={form.cancellation_policy} onChange={e => set("cancellation_policy", e.target.value)} placeholder="Cancellations accepted up to 48 hours before…" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Step 4: Review & Publish ──────────────────────────────────────────────────

function StepReview({ form, races, onPublish, saving }: { form: WizardState; races: RaceForm[]; onPublish: () => void; saving: boolean }) {
  const row = (label: string, value: string | undefined | null) =>
    value ? (
      <div style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <span style={{ width: 160, flexShrink: 0, fontSize: 12, color: "#555", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</span>
        <span style={{ fontSize: 13, color: "#ccc" }}>{value}</span>
      </div>
    ) : null;

  return (
    <div>
      <div style={S.section}>
        <div style={S.h2}>Review Before Publishing</div>
        <div style={S.card}>
          {row("Event Name",   form.title)}
          {row("Category",     EVENT_CATEGORIES.find(c => c.value === form.event_category)?.label)}
          {row("Type",         EVENT_TYPES.find(t => t.value === form.event_type)?.label)}
          {row("Date",         form.start_date + (form.end_date && form.end_date !== form.start_date ? ` – ${form.end_date}` : ""))}
          {row("Start Time",   form.start_time)}
          {row("Venue",        form.location)}
          {row("Meeting Point",form.meeting_point)}
          {row("Organizer",    form.organizer)}
          {row("Reg. Closes",  form.registration_closes_at)}
          {row("Max Slots",    form.max_participants || "Unlimited")}
          {row("Visibility",   form.visibility)}
        </div>
      </div>

      {races.length > 0 && (
        <div style={S.section}>
          <div style={S.h2}>Races ({races.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {races.map((r, i) => (
              <div key={i} style={{ ...S.card, padding: "1rem 1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontWeight: 700 }}>{r.name}</span>
                  <span style={{ color: "#555", marginLeft: 8, fontSize: 13 }}>{r.distance}</span>
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 13, color: "#888" }}>
                  {r.price ? <span style={{ color: "#e8620a", fontWeight: 600 }}>₹{r.price}</span> : <span>Free</span>}
                  {r.max_slots && <span>{r.max_slots} slots</span>}
                  {r.reporting_time && <span>Report {r.reporting_time}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ ...S.card, background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.2)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 700, color: "#4ade80", marginBottom: 4 }}>Ready to publish?</div>
          <div style={{ fontSize: 13, color: "#666" }}>The event will go live immediately and appear on the website.</div>
        </div>
        <button onClick={onPublish} disabled={saving} style={{ ...S.btn(), background: "#16a34a", padding: "12px 28px", fontSize: 15 }}>
          {saving ? "Publishing…" : "🚀 Publish Now"}
        </button>
      </div>
    </div>
  );
}
