"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Button, Alert, Badge, Spinner } from "@/components/ui/ds";

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
  title:                   string;
  event_category:          string;
  event_type:              string;
  description:             string;
  start_date:              string;
  end_date:                string;
  start_time:              string;
  end_time:                string;
  location:                string;
  meeting_point:           string;
  maps_url:                string;
  organizer:               string;
  organizer_email:         string;
  organizer_phone:         string;
  support_email:           string;
  cover_image:             string;
  website:                 string;
  registration_closes_at:  string;
  early_bird_ends_at:      string;
  max_participants:        string;
  waiting_list_enabled:    boolean;
  require_login:           boolean;
  approval_required:       boolean;
  collect_tshirt:          boolean;
  refund_policy:           string;
  cancellation_policy:     string;
  visibility:              string;
}

const BLANK: WizardState = {
  title: "", event_category: "community", event_type: "running",
  description: "", start_date: "", end_date: "", start_time: "", end_time: "",
  location: "", meeting_point: "", maps_url: "",
  organizer: "Connected Steps", organizer_email: "info@connectedsteps.in",
  organizer_phone: "+91 97036 20570", support_email: "info@connectedsteps.in",
  cover_image: "", website: "",
  registration_closes_at: "", early_bird_ends_at: "", max_participants: "",
  waiting_list_enabled: false, require_login: true, approval_required: false,
  collect_tshirt: false,
  refund_policy: "", cancellation_policy: "", visibility: "public",
};

const BLANK_RACE: RaceForm = {
  name: "", distance: "", price: "", max_slots: "",
  reporting_time: "", gun_time: "", timing_chip: false, auto_bib: false,
  gender_restriction: "", min_age: "", max_age: "", description: "",
};

const STEPS = [
  { label: "Event Details",    icon: "📋" },
  { label: "Race Setup",       icon: "🏃" },
  { label: "Registration",     icon: "📅" },
  { label: "Review & Publish", icon: "🚀" },
];

const EVENT_CATEGORIES = [
  { value: "community",  label: "Community Run",        emoji: "🤝" },
  { value: "marathon",   label: "Marathon / Half",      emoji: "🏆" },
  { value: "corporate",  label: "Corporate Wellness",   emoji: "🏢" },
  { value: "virtual",    label: "Virtual Challenge",    emoji: "💻" },
  { value: "walkathon",  label: "Walkathon",            emoji: "🚶" },
  { value: "cycling",    label: "Cycling Event",        emoji: "🚴" },
  { value: "triathlon",  label: "Triathlon",            emoji: "🔱" },
];

const EVENT_TYPES = [
  { value: "running",   label: "Running"   },
  { value: "cycling",   label: "Cycling"   },
  { value: "training",  label: "Training"  },
  { value: "race",      label: "Race"      },
  { value: "community", label: "Community" },
  { value: "workshop",  label: "Workshop"  },
];

const DISTANCES = ["1K", "3K", "5K", "10K", "15K", "21.1K", "42.2K", "Custom"];

// ── Global CSS injection ──────────────────────────────────────────────────────
// Injects dark-theme styles for native form elements once on mount.

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
  .wiz-race-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; }
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

function Grid({ cols, children, gap = 16 }: { cols: string; children: React.ReactNode; gap?: number }) {
  return <div style={{ display: "grid", gridTemplateColumns: cols, gap, marginBottom: 0 }}>{children}</div>;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NewEventWizard() {
  const router = useRouter();

  const [step,         setStep]         = useState(0);
  const [form,         setForm]         = useState<WizardState>(BLANK);
  const [races,        setRaces]        = useState<RaceForm[]>([]);
  const [raceForm,     setRaceForm]     = useState<RaceForm>(BLANK_RACE);
  const [editIdx,      setEditIdx]      = useState<number | null>(null);
  const [eventId,      setEventId]      = useState<string | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [errors,       setErrors]       = useState<Record<string, string>>({});
  const [savedAt,      setSavedAt]      = useState<string>("");
  const [toast,        setToast]        = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [hasDraft,     setHasDraft]     = useState(false);
  const [skipRaces,    setSkipRaces]    = useState(false);
  const autoRef = useRef<ReturnType<typeof setTimeout>>(null);
  const isMounted = useRef(true);

  // ── CSS injection ───────────────────────────────────────────────────────────
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = GLOBAL_CSS;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); isMounted.current = false; };
  }, []);

  // ── Draft recovery — only restore if user confirms ─────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem("cs_new_event_draft");
    if (saved) {
      try {
        const d = JSON.parse(saved) as { form: WizardState; races: RaceForm[]; step: number; eventId: string | null; skipRaces?: boolean };
        if (d.form?.title) setHasDraft(true);
      } catch { /* ignore */ }
    }
  }, []);

  function restoreDraft() {
    const saved = localStorage.getItem("cs_new_event_draft");
    if (!saved) return;
    try {
      const d = JSON.parse(saved) as { form: WizardState; races: RaceForm[]; step: number; eventId: string | null; skipRaces?: boolean };
      setForm(d.form); setRaces(d.races ?? []); setStep(d.step ?? 0);
      setEventId(d.eventId ?? null); setSkipRaces(d.skipRaces ?? false);
      setHasDraft(false);
    } catch { /* ignore */ }
  }

  function discardDraft() { localStorage.removeItem("cs_new_event_draft"); setHasDraft(false); }

  // ── Auto-save draft to localStorage ────────────────────────────────────────
  const saveDraft = useCallback(() => {
    localStorage.setItem("cs_new_event_draft", JSON.stringify({ form, races, step, eventId, skipRaces }));
  }, [form, races, step, eventId, skipRaces]);

  useEffect(() => {
    if (autoRef.current) clearTimeout(autoRef.current);
    autoRef.current = setTimeout(saveDraft, 600);
  }, [form, races, saveDraft]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const set = (k: keyof WizardState, v: unknown) => setForm(p => ({ ...p, [k]: v }));
  const setRF = (k: keyof RaceForm, v: unknown) => setRaceForm(p => ({ ...p, [k]: v }));

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => { if (isMounted.current) setToast(null); }, 3200);
  };

  // ── Validation ──────────────────────────────────────────────────────────────
  function validate(): boolean {
    const e: Record<string, string> = {};
    if (step === 0) {
      if (!form.title.trim())       e.title       = "Event name is required";
      if (!form.start_date)         e.start_date  = "Start date is required";
      if (!form.location.trim())    e.location    = "Venue is required";
      if (!form.description.trim()) e.description = "Description is required";
    }
    if (step === 1 && !skipRaces && races.length === 0) {
      e.races = 'Add at least one race, or click "Skip — No Races" below';
    }
    if (step === 2) {
      if (!form.registration_closes_at) e.registration_closes_at = "Registration close date is required";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Save to server ──────────────────────────────────────────────────────────
  async function saveToServer(publish = false): Promise<string | null> {
    setSaving(true);
    try {
      const body = {
        title:                   form.title.trim(),
        description:             form.description,
        event_type:              form.event_type,
        event_category:          form.event_category,
        cover_image:             form.cover_image || null,
        start_date:              form.start_date,
        start_time:              form.start_time || null,
        end_date:                form.end_date || form.start_date,
        end_time:                form.end_time || null,
        location:                form.location.trim(),
        meeting_point:           form.meeting_point || null,
        maps_url:                form.maps_url || null,
        organizer:               form.organizer,
        organizer_email:         form.organizer_email || null,
        organizer_phone:         form.organizer_phone || null,
        support_email:           form.support_email || null,
        website:                 form.website || null,
        registration_closes_at:  form.registration_closes_at ? `${form.registration_closes_at}:00` : null,
        early_bird_ends_at:      form.early_bird_ends_at ? `${form.early_bird_ends_at}:00` : null,
        max_participants:        form.max_participants ? Number(form.max_participants) : null,
        waiting_list_enabled:    form.waiting_list_enabled,
        require_login:           form.require_login,
        approval_required:       form.approval_required,
        collect_tshirt:          form.collect_tshirt,
        refund_policy:           form.refund_policy || null,
        cancellation_policy:     form.cancellation_policy || null,
        visibility:              form.visibility,
        status:                  publish ? "published" : "draft",
        price:                   races[0] ? Number(races[0].price) || 0 : 0,
        registration_required:   true,
        distance_categories:     races.map(r => r.distance).filter(Boolean),
      };

      const method    = eventId ? "PATCH" : "POST";
      const reqBody   = eventId ? { id: eventId, ...body } : body;
      const res       = await fetch("/api/admin/events", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(reqBody) });
      const data      = await res.json();

      if (!res.ok) { showToast(data.error ?? "Save failed", "err"); return null; }

      const id = data.data?.id ?? eventId;
      if (id && isMounted.current) setEventId(id);

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
            body: JSON.stringify({ ...race, display_order: i, price: Number(race.price) || 0, max_slots: race.max_slots ? Number(race.max_slots) : null, min_age: race.min_age ? Number(race.min_age) : null, max_age: race.max_age ? Number(race.max_age) : null }),
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

  // ── Navigation ──────────────────────────────────────────────────────────────
  async function handleNext() {
    if (!validate()) return;
    // Save on all step transitions (not just 0 and 2)
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
      showToast("Event published! 🎉");
      setTimeout(() => router.push(`/admin/events/${id}/manage`), 1400);
    }
  }

  // ── Race management ─────────────────────────────────────────────────────────
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
  function deleteRace(i: number) { setRaces(rs => rs.filter((_, idx) => idx !== i)); if (editIdx === i) { setEditIdx(null); setRaceForm(BLANK_RACE); } }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#fff", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(8,8,8,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 2rem", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/admin/events" style={{ display: "flex", alignItems: "center", textDecoration: "none", opacity: 0.7 }}>
            <Image src="/logo.png" alt="" width={26} height={26} style={{ borderRadius: "50%" }} />
          </Link>
          <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.1)" }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: "#fff" }}>New Event</span>
          {form.title && <span style={{ fontSize: 12, color: "#444", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>— {form.title}</span>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {savedAt && <span style={{ fontSize: 11, color: "#333" }}>Saved {savedAt}</span>}
          <Button size="sm" variant="secondary" loading={saving} onClick={handleSaveDraft}>Save Draft</Button>
          <Link href="/admin/events" style={{ textDecoration: "none" }}>
            <Button size="sm" variant="ghost">Cancel</Button>
          </Link>
        </div>
      </header>

      {/* Draft restore banner */}
      {hasDraft && (
        <Alert variant="warning" style={{ margin: "0", borderRadius: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>You have an unsaved draft. Continue where you left off?</span>
          <div style={{ display: "flex", gap: 8 }}>
            <Button size="xs" onClick={restoreDraft}>Restore Draft</Button>
            <Button size="xs" variant="ghost" onClick={discardDraft}>Start Fresh</Button>
          </div>
        </Alert>
      )}

      {/* Step progress */}
      <div style={{ background: "#0c0c0c", borderBottom: "1px solid rgba(255,255,255,0.05)", padding: "0 2rem" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", alignItems: "stretch" }}>
          {STEPS.map((s, i) => (
            <button
              key={s.label}
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              style={{ flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: 4, padding: "14px 8px", background: "none", border: "none", borderBottom: i === step ? "2px solid #e8620a" : "2px solid transparent", cursor: i < step ? "pointer" : "default", transition: "all 0.15s" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: i < step ? "#4ade80" : i === step ? "#e8620a" : "rgba(255,255,255,0.07)", fontSize: 11, fontWeight: 800, color: i <= step ? "#fff" : "#444", flexShrink: 0 }}>
                  {i < step ? "✓" : i + 1}
                </div>
                <span style={{ fontSize: 12, fontWeight: i === step ? 700 : 400, color: i === step ? "#fff" : i < step ? "#4ade80" : "#3a3a3a", whiteSpace: "nowrap" as const }}>
                  {s.label}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "2rem 2rem 6rem" }}>

        {step === 0 && <StepDetails form={form} set={set} errors={errors} />}
        {step === 1 && (
          <StepRaces
            races={races} raceForm={raceForm} setRF={setRF}
            editIdx={editIdx} errors={errors} skipRaces={skipRaces}
            onSkipToggle={() => { setSkipRaces(s => !s); setErrors(e => { const n = { ...e }; delete n.races; return n; }); }}
            onAdd={addOrUpdateRace} onEdit={editRace} onDelete={deleteRace}
            onCancel={() => { setEditIdx(null); setRaceForm(BLANK_RACE); }}
          />
        )}
        {step === 2 && <StepRegistration form={form} set={set} errors={errors} />}
        {step === 3 && <StepReview form={form} races={races} skipRaces={skipRaces} onPublish={handlePublish} saving={saving} />}

        {/* Navigation bar */}
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(8,8,8,0.96)", backdropFilter: "blur(12px)", borderTop: "1px solid rgba(255,255,255,0.06)", padding: "14px 2rem", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 40 }}>
          <Button variant="secondary" disabled={step === 0 || saving} onClick={handleBack}>← Back</Button>

          <div style={{ fontSize: 12, color: "#2a2a2a" }}>
            Step {step + 1} of {STEPS.length}
          </div>

          {step < STEPS.length - 1 ? (
            <Button loading={saving} onClick={handleNext}>Continue →</Button>
          ) : (
            <Button loading={saving} onClick={handlePublish}>🚀 Publish Event</Button>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", background: toast.type === "err" ? "#3b0a0a" : "#0f1a0f", border: `1px solid ${toast.type === "err" ? "rgba(239,68,68,0.3)" : "rgba(74,222,128,0.3)"}`, borderRadius: 24, padding: "10px 22px", fontSize: 13, fontWeight: 600, color: toast.type === "err" ? "#f87171" : "#4ade80", zIndex: 9999, whiteSpace: "nowrap", boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}>
          {toast.msg}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Step 1: Event Details ─────────────────────────────────────────────────────

function StepDetails({ form, set, errors }: { form: WizardState; set: (k: keyof WizardState, v: unknown) => void; errors: Record<string, string> }) {
  const [imgOk, setImgOk] = useState(false);

  return (
    <div>
      <SectionCard title="Basic Information">
        <Grid cols="2fr 1fr" gap={16}>
          <Field label="Event Name" required error={errors.title}>
            <input className="wiz-input" value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. Connected Steps 5K Community Run" />
          </Field>
          <Field label="Category" required>
            <select className="wiz-select" value={form.event_category} onChange={e => set("event_category", e.target.value)}>
              {EVENT_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>)}
            </select>
          </Field>
        </Grid>

        <div style={{ height: 14 }} />

        <Grid cols="1fr 1fr" gap={16}>
          <Field label="Event Type">
            <select className="wiz-select" value={form.event_type} onChange={e => set("event_type", e.target.value)}>
              {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Visibility">
            <select className="wiz-select" value={form.visibility} onChange={e => set("visibility", e.target.value)}>
              <option value="public">🌐 Public</option>
              <option value="private">🔒 Private (link only)</option>
              <option value="unlisted">🔗 Unlisted</option>
            </select>
          </Field>
        </Grid>

        <div style={{ height: 14 }} />

        <Field label="Description" required error={errors.description} hint="Tell participants what makes this event special.">
          <textarea className="wiz-textarea" style={{ minHeight: 120 }} value={form.description} onChange={e => set("description", e.target.value)} placeholder="Describe the event, highlights, what to expect…" rows={5} />
        </Field>
      </SectionCard>

      <SectionCard title="Cover Image">
        <Grid cols="1fr auto" gap={14}>
          <Field label="Image URL" hint="Paste a direct image link (JPG, PNG, WebP)">
            <input className="wiz-input" value={form.cover_image} onChange={e => { set("cover_image", e.target.value); setImgOk(false); }} placeholder="https://images.unsplash.com/…" />
          </Field>
          {form.cover_image && (
            <div style={{ alignSelf: "flex-end" }}>
              <Image
                src={form.cover_image}
                alt="Cover preview"
                width={80} height={56}
                style={{ borderRadius: 8, objectFit: "cover", border: `1px solid ${imgOk ? "rgba(74,222,128,0.3)" : "rgba(255,255,255,0.1)"}` }}
                onLoad={() => setImgOk(true)}
                onError={() => setImgOk(false)}
                unoptimized
              />
            </div>
          )}
        </Grid>
      </SectionCard>

      <SectionCard title="Date & Time">
        <Grid cols="1fr 1fr 1fr 1fr" gap={14}>
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
        <Grid cols="1fr 1fr" gap={14}>
          <Field label="Meeting Point" hint="Where participants gather before the event">
            <input className="wiz-input" value={form.meeting_point} onChange={e => set("meeting_point", e.target.value)} placeholder="Gate 1, Parking Area" />
          </Field>
          <Field label="Google Maps URL">
            <input className="wiz-input" value={form.maps_url} onChange={e => set("maps_url", e.target.value)} placeholder="https://maps.google.com/…" />
          </Field>
        </Grid>
      </SectionCard>

      <SectionCard title="Organizer Details">
        <Grid cols="1fr 1fr" gap={14}>
          <Field label="Organizer Name">
            <input className="wiz-input" value={form.organizer} onChange={e => set("organizer", e.target.value)} />
          </Field>
          <Field label="Website">
            <input className="wiz-input" value={form.website} onChange={e => set("website", e.target.value)} placeholder="https://connectedsteps.in" />
          </Field>
        </Grid>
        <div style={{ height: 14 }} />
        <Grid cols="1fr 1fr 1fr" gap={14}>
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

// ── Step 2: Race Setup ────────────────────────────────────────────────────────

function StepRaces({
  races, raceForm, setRF, editIdx, errors, skipRaces,
  onSkipToggle, onAdd, onEdit, onDelete, onCancel,
}: {
  races: RaceForm[]; raceForm: RaceForm; setRF: (k: keyof RaceForm, v: unknown) => void;
  editIdx: number | null; errors: Record<string, string>; skipRaces: boolean;
  onSkipToggle: () => void; onAdd: () => void; onEdit: (i: number) => void;
  onDelete: (i: number) => void; onCancel: () => void;
}) {
  const customDist = !["1K","3K","5K","10K","15K","21.1K","42.2K",""].includes(raceForm.distance);

  return (
    <div>
      {/* Existing races */}
      {races.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#e8620a", textTransform: "uppercase" as const, letterSpacing: ".1em", marginBottom: 12 }}>
            Races Added ({races.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {races.map((r, i) => (
              <div key={i} className="wiz-card wiz-card-hover" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(232,98,10,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🏃</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#fff" }}>{r.name}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 3 }}>
                      {r.distance && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.07)", color: "#888" }}>{r.distance}</span>}
                      {r.price ? <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(232,98,10,0.12)", color: "#e8620a" }}>₹{r.price}</span> : <span style={{ fontSize: 11, color: "#555" }}>Free</span>}
                      {r.max_slots && <span style={{ fontSize: 11, color: "#666" }}>{r.max_slots} slots</span>}
                      {r.reporting_time && <span style={{ fontSize: 11, color: "#555" }}>Report {r.reporting_time}</span>}
                      {r.gun_time && <span style={{ fontSize: 11, color: "#555" }}>Gun {r.gun_time}</span>}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Button size="xs" variant="ghost" onClick={() => onEdit(i)}>Edit</Button>
                  <Button size="xs" variant="danger" onClick={() => onDelete(i)}>Remove</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {errors.races && <Alert variant="error" style={{ marginBottom: 14 }}>{errors.races}</Alert>}

      {/* Add/Edit form */}
      {!skipRaces && (
        <SectionCard title={editIdx !== null ? "Edit Race" : "Add a Race"}>
          <Grid cols="1fr 1fr 1fr" gap={14}>
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
              {(customDist || raceForm.distance === "") && raceForm.distance !== undefined && (
                <input className="wiz-input" style={{ marginTop: 8 }} value={raceForm.distance} onChange={e => setRF("distance", e.target.value)} placeholder="e.g. 3K, 100M, 2.5K" />
              )}
            </Field>
            <Field label="Entry Fee (₹)" hint="0 = Free entry">
              <input type="number" className="wiz-input" value={raceForm.price} onChange={e => setRF("price", e.target.value)} placeholder="0" min="0" />
            </Field>
          </Grid>

          <div style={{ height: 14 }} />

          <Grid cols="1fr 1fr 1fr" gap={14}>
            <Field label="Max Slots" hint="Leave blank for unlimited">
              <input type="number" className="wiz-input" value={raceForm.max_slots} onChange={e => setRF("max_slots", e.target.value)} placeholder="Unlimited" min="1" />
            </Field>
            <Field label="Reporting Time">
              <input type="time" className="wiz-input" value={raceForm.reporting_time} onChange={e => setRF("reporting_time", e.target.value)} />
            </Field>
            <Field label="Gun / Flag-off Time">
              <input type="time" className="wiz-input" value={raceForm.gun_time} onChange={e => setRF("gun_time", e.target.value)} />
            </Field>
          </Grid>

          <div style={{ height: 14 }} />

          <Grid cols="1fr 1fr 1fr" gap={14}>
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

          <div style={{ height: 16 }} />

          <div style={{ display: "flex", gap: 20, marginBottom: 18 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#bbb" }}>
              <input type="checkbox" className="wiz-checkbox" checked={raceForm.timing_chip} onChange={e => setRF("timing_chip", e.target.checked)} />
              Timing Chip
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#bbb" }}>
              <input type="checkbox" className="wiz-checkbox" checked={raceForm.auto_bib} onChange={e => setRF("auto_bib", e.target.checked)} />
              Auto-assign BIB Numbers
            </label>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <Button onClick={onAdd}>{editIdx !== null ? "Update Race" : "+ Add Race"}</Button>
            {editIdx !== null && <Button variant="secondary" onClick={onCancel}>Cancel</Button>}
          </div>
        </SectionCard>
      )}

      {/* Skip option */}
      <div style={{ marginTop: 20, padding: "14px 18px", background: skipRaces ? "rgba(74,222,128,0.07)" : "rgba(255,255,255,0.02)", border: `1px solid ${skipRaces ? "rgba(74,222,128,0.2)" : "rgba(255,255,255,0.07)"}`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: skipRaces ? "#4ade80" : "#555" }}>
            {skipRaces ? "✓ No races — event has no race categories" : "This event has no race categories (e.g. walkathon, workshop)"}
          </div>
          <div style={{ fontSize: 11, color: "#444", marginTop: 2 }}>Participants register directly without choosing a distance</div>
        </div>
        <Button size="sm" variant={skipRaces ? "ghost" : "secondary"} onClick={onSkipToggle}>{skipRaces ? "Add Races" : "Skip — No Races"}</Button>
      </div>
    </div>
  );
}

// ── Step 3: Registration Settings ────────────────────────────────────────────

function StepRegistration({ form, set, errors }: { form: WizardState; set: (k: keyof WizardState, v: unknown) => void; errors: Record<string, string> }) {
  return (
    <div>
      <SectionCard title="Registration Window">
        <Grid cols="1fr 1fr" gap={16}>
          <Field label="Registration Closes *" required error={errors.registration_closes_at} hint="After this date/time, registrations are blocked">
            <input type="datetime-local" className="wiz-input" value={form.registration_closes_at} onChange={e => set("registration_closes_at", e.target.value)} />
          </Field>
          <Field label="Early Bird Ends" hint="Optional — for early bird pricing">
            <input type="datetime-local" className="wiz-input" value={form.early_bird_ends_at} onChange={e => set("early_bird_ends_at", e.target.value)} />
          </Field>
        </Grid>
        <div style={{ height: 14 }} />
        <Grid cols="1fr 1fr" gap={16}>
          <Field label="Total Capacity" hint="Maximum registrations across all races. Leave blank for unlimited.">
            <input type="number" className="wiz-input" value={form.max_participants} onChange={e => set("max_participants", e.target.value)} placeholder="Unlimited" min="1" />
          </Field>
        </Grid>
      </SectionCard>

      <SectionCard title="Options">
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: "16px 40px", marginBottom: 20 }}>
          {[
            { key: "require_login",        label: "Require Login",        hint: "Users must be logged in to register" },
            { key: "waiting_list_enabled", label: "Enable Waiting List",  hint: "Accept registrations after capacity is full" },
            { key: "approval_required",    label: "Manual Approval",      hint: "Admin approves each registration manually" },
            { key: "collect_tshirt",       label: "Collect T-Shirt Size", hint: "Participants must choose a size (XS–XXXL) during registration" },
          ].map(({ key, label, hint }) => (
            <label key={key} style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
              <input type="checkbox" className="wiz-checkbox" style={{ marginTop: 2 }} checked={Boolean(form[key as keyof WizardState])} onChange={e => set(key as keyof WizardState, e.target.checked)} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc" }}>{label}</div>
                <div style={{ fontSize: 11, color: "#444", marginTop: 1 }}>{hint}</div>
              </div>
            </label>
          ))}
        </div>
        <Grid cols="1fr 1fr" gap={16}>
          <Field label="Refund Policy">
            <textarea className="wiz-textarea" style={{ minHeight: 80 }} value={form.refund_policy} onChange={e => set("refund_policy", e.target.value)} placeholder="e.g. No refunds after registration is confirmed." />
          </Field>
          <Field label="Cancellation Policy">
            <textarea className="wiz-textarea" style={{ minHeight: 80 }} value={form.cancellation_policy} onChange={e => set("cancellation_policy", e.target.value)} placeholder="e.g. Cancellations accepted up to 48 hours before the event." />
          </Field>
        </Grid>
      </SectionCard>
    </div>
  );
}

// ── Step 4: Review & Publish ──────────────────────────────────────────────────

function StepReview({ form, races, skipRaces, onPublish, saving }: { form: WizardState; races: RaceForm[]; skipRaces: boolean; onPublish: () => void; saving: boolean }) {
  const Row = ({ label, value }: { label: string; value: string | undefined | null }) =>
    value ? (
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <span style={{ width: 150, flexShrink: 0, fontSize: 11, color: "#444", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".05em", paddingTop: 1 }}>{label}</span>
        <span style={{ fontSize: 13, color: "#ccc", lineHeight: 1.5 }}>{value}</span>
      </div>
    ) : null;

  const isReady = form.title && form.start_date && form.location && form.registration_closes_at;

  return (
    <div>
      <SectionCard title="Event Summary">
        <Row label="Event Name"    value={form.title} />
        <Row label="Category"      value={EVENT_CATEGORIES.find(c => c.value === form.event_category)?.label} />
        <Row label="Date"          value={form.start_date + (form.end_date && form.end_date !== form.start_date ? ` → ${form.end_date}` : "")} />
        <Row label="Time"          value={[form.start_time, form.end_time].filter(Boolean).join(" – ")} />
        <Row label="Venue"         value={form.location} />
        <Row label="Meeting Point" value={form.meeting_point} />
        <Row label="Organizer"     value={form.organizer} />
        <Row label="Reg. Closes"   value={form.registration_closes_at?.replace("T", " at ").slice(0, -3)} />
        <Row label="Capacity"      value={form.max_participants ? `${form.max_participants} participants` : "Unlimited"} />
        <Row label="Visibility"    value={form.visibility.charAt(0).toUpperCase() + form.visibility.slice(1)} />
      </SectionCard>

      {!skipRaces && races.length > 0 && (
        <SectionCard title={`Races (${races.length})`}>
          {races.map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < races.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontWeight: 700, color: "#fff" }}>{r.name}</span>
                {r.distance && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.07)", color: "#666" }}>{r.distance}</span>}
              </div>
              <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#555", alignItems: "center" }}>
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
          <div style={{ fontSize: 12, color: "#666" }}>
            {!form.title && "• Event name  "}
            {!form.start_date && "• Start date  "}
            {!form.location && "• Venue  "}
            {!form.registration_closes_at && "• Registration close date"}
          </div>
        </div>
      )}

      {/* Publish card */}
      <div style={{ background: isReady ? "rgba(22,163,74,0.08)" : "rgba(255,255,255,0.02)", border: `1px solid ${isReady ? "rgba(22,163,74,0.2)" : "rgba(255,255,255,0.07)"}`, borderRadius: 14, padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: isReady ? "#4ade80" : "#555", marginBottom: 4 }}>
            {isReady ? "Ready to publish!" : "Complete the form to publish"}
          </div>
          <div style={{ fontSize: 13, color: "#444", lineHeight: 1.5 }}>
            {isReady ? "The event goes live immediately and appears on the website." : "Go back and fill in the required fields."}
          </div>
        </div>
        <Button loading={saving} disabled={!isReady} onClick={onPublish}>🚀 Publish Now</Button>
      </div>
    </div>
  );
}
