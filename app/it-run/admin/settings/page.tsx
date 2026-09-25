"use client";

import { useState, useEffect, useRef } from "react";

const ACCENT = "#e8620a";
const GREEN  = "#10b981";

// Fields that show a confirmation dialog before saving
const CRITICAL_FIELDS = new Set(["event_date", "registration_closes_at"]);
const CRITICAL_LABELS: Record<string, string> = {
  event_date:             "Event Date",
  registration_closes_at: "Registration Closing Date",
};

type EventData = {
  id: string; slug: string; title: string; subtitle: string | null;
  tagline: string | null; event_date: string; report_time: string | null;
  flag_off_time: string | null; venue_name: string | null;
  venue_address: string | null; city: string | null; maps_url: string | null;
  registration_opens_at: string | null; registration_closes_at: string | null;
  status: string;
  description: string | null; hero_content: string | null;
  event_highlights: string[] | null; important_instructions: string | null;
  contact_email: string | null; contact_phone: string | null;
  terms_text: string | null; privacy_text: string | null;
  bib_collection_info: string | null; race_day_info: string | null;
};

type FormData = Record<string, string>;

const STATUS_OPTIONS = ["draft","upcoming","active","closed","completed","cancelled"];

// ── Input helpers ──────────────────────────────────────────────────────────────

function Input({ label, name, value, type = "text", readOnly, onChange, hint }: {
  label: string; name: string; value: string; type?: string;
  readOnly?: boolean; onChange?: (n: string, v: string) => void; hint?: string;
}) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, color: readOnly ? "#555" : "#888", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>
        {label}{readOnly && <span style={{ marginLeft: 6, fontSize: 10, color: "#444" }}>(read-only)</span>}
      </label>
      {hint && <div style={{ fontSize: 11, color: "#555", marginBottom: 5 }}>{hint}</div>}
      <input
        name={name} value={value ?? ""} readOnly={readOnly} type={type}
        onChange={e => !readOnly && onChange?.(name, e.target.value)}
        style={{
          width: "100%", boxSizing: "border-box", padding: "10px 14px",
          background: readOnly ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.05)",
          border: `1px solid ${readOnly ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.12)"}`,
          borderRadius: 8, color: readOnly ? "#444" : "#fff", fontSize: 14,
          fontFamily: "inherit", outline: "none", cursor: readOnly ? "default" : "text",
        }}
      />
    </div>
  );
}

function Textarea({ label, name, value, onChange, hint, rows = 4 }: {
  label: string; name: string; value: string;
  onChange: (n: string, v: string) => void; hint?: string; rows?: number;
}) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>{label}</label>
      {hint && <div style={{ fontSize: 11, color: "#555", marginBottom: 5 }}>{hint}</div>}
      <textarea
        name={name} value={value ?? ""} rows={rows}
        onChange={e => onChange(name, e.target.value)}
        style={{
          width: "100%", boxSizing: "border-box", padding: "10px 14px",
          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 8, color: "#fff", fontSize: 14, fontFamily: "inherit",
          outline: "none", resize: "vertical", lineHeight: 1.6,
        }}
      />
    </div>
  );
}

function TwoCol({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
      {children}
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "20px 24px", marginBottom: 20 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: ACCENT, textTransform: "uppercase", letterSpacing: "0.1em" }}>{title}</div>
        {desc && <div style={{ fontSize: 12, color: "#555", marginTop: 3 }}>{desc}</div>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
    </div>
  );
}

// ── Confirmation modal ─────────────────────────────────────────────────────────

function ConfirmModal({ changes, onConfirm, onCancel }: {
  changes: { field: string; label: string; oldVal: string; newVal: string }[];
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#111", border: "1px solid rgba(232,98,10,0.4)", borderRadius: 16, maxWidth: 480, width: "100%", padding: 28 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 8 }}>Confirm Critical Changes</div>
        <div style={{ fontSize: 13, color: "#888", marginBottom: 20, lineHeight: 1.6 }}>
          The following fields affect live registrations and public-facing dates. Please review carefully before saving.
        </div>
        {changes.map(c => (
          <div key={c.field} style={{ background: "rgba(232,98,10,0.06)", border: "1px solid rgba(232,98,10,0.2)", borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: ACCENT, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{c.label}</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: "#555", marginBottom: 3 }}>CURRENT</div>
                <div style={{ fontSize: 13, color: "#888", fontFamily: "monospace" }}>{c.oldVal || "(empty)"}</div>
              </div>
              <div style={{ color: "#555", alignSelf: "center" }}>→</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: "#555", marginBottom: 3 }}>NEW VALUE</div>
                <div style={{ fontSize: 13, color: "#fff", fontFamily: "monospace", fontWeight: 600 }}>{c.newVal || "(empty)"}</div>
              </div>
            </div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onConfirm}
            style={{ flex: 1, padding: "12px", background: ACCENT, border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            Yes, Save Changes
          </button>
          <button onClick={onCancel}
            style={{ padding: "12px 20px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#888", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function EventSettingsPage() {
  const [event,   setEvent]   = useState<EventData | null>(null);
  const [form,    setForm]    = useState<FormData>({});
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState<{ text: string; ok: boolean } | null>(null);
  const [confirmChanges, setConfirmChanges] = useState<null | { field: string; label: string; oldVal: string; newVal: string }[]>(null);
  const pendingSubmit = useRef<boolean>(false);

  useEffect(() => {
    fetch("/api/it-run/admin/event-settings")
      .then(r => r.json())
      .then(d => {
        const ev = d.event ?? {};
        // Flatten event_highlights array to newline-separated string for the textarea
        const form: FormData = {};
        for (const [k, v] of Object.entries(ev)) {
          if (k === "event_highlights") {
            form[k] = Array.isArray(v) ? (v as string[]).join("\n") : "";
          } else {
            form[k] = (v as string | null) ?? "";
          }
        }
        setEvent(ev);
        setForm(form);
      })
      .catch(() => setMsg({ text: "Failed to load event settings", ok: false }))
      .finally(() => setLoading(false));
  }, []);

  function update(name: string, value: string) {
    setForm(f => ({ ...f, [name]: value }));
  }

  async function doSave(withConfirm: boolean) {
    if (!event) return;
    setSaving(true); setMsg(null);
    try {
      // Rebuild event_highlights as JSON array from newline-separated textarea
      const payload: Record<string, unknown> = { ...form };
      const highlightsRaw = form["event_highlights"] ?? "";
      payload["event_highlights"] = highlightsRaw
        .split("\n")
        .map(s => s.trim())
        .filter(Boolean);

      if (withConfirm) payload["confirm"] = true;

      const res = await fetch("/api/it-run/admin/event-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();

      if (res.status === 409 && d.needsConfirm) {
        // Server says critical fields changed — show confirmation modal
        const changes = (d.criticalFields as string[]).map(f => ({
          field:  f,
          label:  CRITICAL_LABELS[f] ?? f,
          oldVal: String(event[f as keyof EventData] ?? ""),
          newVal: String(form[f] ?? ""),
        }));
        setConfirmChanges(changes);
        pendingSubmit.current = true;
        return;
      }

      if (!res.ok) { setMsg({ text: d.error ?? "Save failed", ok: false }); return; }

      // Update local event snapshot with saved values (flatten highlights back)
      const updated = { ...event, ...form } as EventData;
      updated.event_highlights = (payload["event_highlights"] as string[]).length > 0
        ? payload["event_highlights"] as string[]
        : null;
      setEvent(updated);
      setMsg({ text: "Event settings saved successfully", ok: true });
    } finally {
      setSaving(false);
      pendingSubmit.current = false;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await doSave(false);
  }

  if (loading) return <div style={{ color: "#888", padding: 40, textAlign: "center" }}>Loading…</div>;
  if (!event)  return <div style={{ color: "#f87171", padding: 40 }}>Failed to load event. Check authentication.</div>;

  const f = form;

  return (
    <>
      {confirmChanges && (
        <ConfirmModal
          changes={confirmChanges}
          onConfirm={() => { setConfirmChanges(null); doSave(true); }}
          onCancel={() => { setConfirmChanges(null); setSaving(false); }}
        />
      )}

      <form onSubmit={handleSubmit} style={{ maxWidth: 820 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: "clamp(20px,3vw,26px)", fontWeight: 800, color: "#fff", margin: 0 }}>Event Settings</h1>
            <p style={{ color: "#666", fontSize: 13, margin: "6px 0 0" }}>
              All changes take effect immediately on the public page. Slug is locked — it anchors QR tokens and URLs.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" disabled={saving}
              style={{ padding: "10px 24px", background: saving ? "rgba(232,98,10,0.4)" : ACCENT, border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button type="button" onClick={() => {
              const reset: FormData = {};
              for (const [k, v] of Object.entries(event)) {
                if (k === "event_highlights") {
                  reset[k] = Array.isArray(v) ? (v as string[]).join("\n") : "";
                } else {
                  reset[k] = (v as string | null) ?? "";
                }
              }
              setForm(reset); setMsg(null);
            }}
              style={{ padding: "10px 18px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#888", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
              Reset
            </button>
          </div>
        </div>

        {msg && (
          <div style={{ marginBottom: 20, padding: "12px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
            background: msg.ok ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
            border: `1px solid ${msg.ok ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
            color: msg.ok ? GREEN : "#f87171" }}>
            {msg.text}
          </div>
        )}

        {/* ── Basic Info ── */}
        <Section title="Basic Info" desc="Core identity of the event">
          <TwoCol>
            <Input label="Slug"   name="slug"   value={f.slug   ?? ""} readOnly />
            <div>
              <label style={{ display: "block", fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>Status</label>
              <select value={f.status ?? "upcoming"} onChange={e => update("status", e.target.value)}
                style={{ width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff", fontSize: 14, fontFamily: "inherit", outline: "none" }}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s} style={{ background: "#1a1a1a" }}>{s}</option>)}
              </select>
            </div>
          </TwoCol>
          <Input label="Event Name"  name="title"    value={f.title    ?? ""} onChange={update} />
          <TwoCol>
            <Input label="Subtitle"  name="subtitle" value={f.subtitle ?? ""} onChange={update} hint="Shown below the hero title" />
            <Input label="Tagline"   name="tagline"  value={f.tagline  ?? ""} onChange={update} hint="Short motto / tag" />
          </TwoCol>
        </Section>

        {/* ── Timing & Registration ── */}
        <Section title="Timing & Registration" desc="Critical fields — confirmation required before saving">
          <TwoCol>
            <Input label="Event Date ⚠" name="event_date" value={f.event_date ?? ""} type="date" onChange={update} hint="Changes trigger a confirmation dialog" />
            <TwoCol>
              <Input label="Report Time"   name="report_time"   value={f.report_time   ?? ""} onChange={update} hint="e.g. 05:30 AM" />
              <Input label="Flag-off Time" name="flag_off_time" value={f.flag_off_time ?? ""} onChange={update} hint="e.g. 06:00 AM" />
            </TwoCol>
          </TwoCol>
          <TwoCol>
            <Input label="Registration Opens"        name="registration_opens_at"  value={f.registration_opens_at  ?? ""} type="datetime-local" onChange={update} />
            <Input label="Registration Closes ⚠"    name="registration_closes_at" value={f.registration_closes_at ?? ""} type="datetime-local" onChange={update} hint="Changes trigger a confirmation dialog" />
          </TwoCol>
        </Section>

        {/* ── Venue ── */}
        <Section title="Venue" desc="Shown in the hero, event details card, and BIB emails">
          <TwoCol>
            <Input label="Venue Name"  name="venue_name" value={f.venue_name ?? ""} onChange={update} />
            <Input label="City"        name="city"       value={f.city       ?? ""} onChange={update} />
          </TwoCol>
          <Input label="Venue Address" name="venue_address" value={f.venue_address ?? ""} onChange={update} />
          <Input label="Google Maps URL" name="maps_url" value={f.maps_url ?? ""} onChange={update} type="url" hint="Shown as View on Maps link" />
        </Section>

        {/* ── Content ── */}
        <Section title="Content" desc="Used on the public landing page. Plain text only — HTML is stripped automatically.">
          <Textarea label="Event Description"
            name="description" value={f.description ?? ""} onChange={update} rows={5}
            hint="About section on the landing page" />
          <Textarea label="Hero Content"
            name="hero_content" value={f.hero_content ?? ""} onChange={update} rows={2}
            hint="Tagline shown under the main heading in the hero" />
          <Textarea label="Event Highlights"
            name="event_highlights" value={f.event_highlights ?? ""} onChange={update} rows={6}
            hint="One highlight per line — shown as bullet points on the landing page" />
          <Textarea label="Important Instructions"
            name="important_instructions" value={f.important_instructions ?? ""} onChange={update} rows={6}
            hint="Rules, requirements, eligibility — shown in a dedicated section" />
        </Section>

        {/* ── Race Day ── */}
        <Section title="Race Day" desc="Details shown in the race day section of the landing page">
          <Textarea label="Race Day Information"
            name="race_day_info" value={f.race_day_info ?? ""} onChange={update} rows={6}
            hint="Gates open time, parking, facilities, schedule notes, etc." />
          <Textarea label="BIB Collection Information"
            name="bib_collection_info" value={f.bib_collection_info ?? ""} onChange={update} rows={5}
            hint="Where, when, and how to collect race BIBs. Also shown in confirmation emails." />
        </Section>

        {/* ── Contact ── */}
        <Section title="Contact" desc="Shown in the Contact section and in all participant emails">
          <TwoCol>
            <Input label="Contact Email" name="contact_email" value={f.contact_email ?? ""} onChange={update} type="email" />
            <Input label="Contact Phone" name="contact_phone" value={f.contact_phone ?? ""} onChange={update} />
          </TwoCol>
        </Section>

        {/* ── Legal ── */}
        <Section title="Legal" desc="Shown in footer and registration flow. Plain text only.">
          <Textarea label="Terms & Conditions"
            name="terms_text" value={f.terms_text ?? ""} onChange={update} rows={8}
            hint="Full T&C text — no HTML tags" />
          <Textarea label="Privacy Policy Text"
            name="privacy_text" value={f.privacy_text ?? ""} onChange={update} rows={8}
            hint="Privacy policy text" />
        </Section>

        <div style={{ display: "flex", gap: 10, paddingBottom: 40 }}>
          <button type="submit" disabled={saving}
            style={{ padding: "12px 28px", background: saving ? "rgba(232,98,10,0.4)" : ACCENT, border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </>
  );
}
