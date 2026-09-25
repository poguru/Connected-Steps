"use client";

import { useState, useEffect } from "react";

const ACCENT = "#e8620a";

type EventData = {
  id: string; slug: string; title: string; subtitle: string | null;
  tagline: string | null; event_date: string; report_time: string | null;
  flag_off_time: string | null; venue_name: string | null;
  venue_address: string | null; city: string | null; maps_url: string | null;
  registration_opens_at: string | null; registration_closes_at: string | null;
  status: string;
};

function Field({ label, name, value, type = "text", onChange, readOnly }: {
  label: string; name: string; value: string; type?: string;
  onChange: (n: string, v: string) => void; readOnly?: boolean;
}) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
        {label}{readOnly && <span style={{ marginLeft: 6, color: "#555", fontSize: 10 }}>(read-only)</span>}
      </label>
      <input
        name={name} value={value ?? ""} readOnly={readOnly}
        type={type}
        onChange={e => !readOnly && onChange(name, e.target.value)}
        style={{
          width: "100%", boxSizing: "border-box",
          padding: "10px 14px",
          background: readOnly ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.05)",
          border: `1px solid ${readOnly ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.12)"}`,
          borderRadius: 8, color: readOnly ? "#555" : "#fff",
          fontSize: 14, fontFamily: "inherit", outline: "none",
          cursor: readOnly ? "default" : "text",
        }}
      />
    </div>
  );
}

const STATUS_OPTIONS = ["draft","upcoming","active","closed","completed","cancelled"];

export default function EventSettingsPage() {
  const [event,   setEvent]   = useState<EventData | null>(null);
  const [form,    setForm]    = useState<Partial<EventData>>({});
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/it-run/admin/event-settings")
      .then(r => r.json())
      .then(d => { setEvent(d.event); setForm(d.event ?? {}); })
      .catch(() => setMsg({ text: "Failed to load event settings", ok: false }))
      .finally(() => setLoading(false));
  }, []);

  function update(name: string, value: string) {
    setForm(f => ({ ...f, [name]: value }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!event) return;
    setSaving(true); setMsg(null);
    try {
      const res = await fetch("/api/it-run/admin/event-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) { setMsg({ text: d.error ?? "Save failed", ok: false }); return; }
      setEvent(form as EventData);
      setMsg({ text: "Event settings saved", ok: true });
    } finally { setSaving(false); }
  }

  if (loading) return <div style={{ color: "#888", padding: 40, textAlign: "center" }}>Loading...</div>;
  if (!event)  return <div style={{ color: "#f87171", padding: 40 }}>Failed to load event. Check authentication.</div>;

  const f = (form as EventData);

  return (
    <form onSubmit={save} style={{ maxWidth: 780 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: "clamp(20px,3vw,26px)", fontWeight: 800, color: "#fff", margin: 0 }}>Event Settings</h1>
        <p style={{ color: "#666", fontSize: 13, margin: "6px 0 0" }}>
          Update event metadata. Slug is locked — it anchors all QR tokens and public URLs.
        </p>
      </div>

      {msg && (
        <div style={{ marginBottom: 20, padding: "12px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: msg.ok ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
          border: `1px solid ${msg.ok ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: msg.ok ? "#10b981" : "#f87171" }}>
          {msg.text}
        </div>
      )}

      {/* Identity */}
      <Section title="Identity">
        <TwoCol>
          <Field label="Slug"     name="slug"     value={f.slug}     onChange={update} readOnly />
          <Field label="Status"   name="status"   value={f.status}   onChange={update} />
        </TwoCol>
        <Field label="Title"    name="title"    value={f.title}    onChange={update} />
        <TwoCol>
          <Field label="Subtitle" name="subtitle" value={f.subtitle ?? ""} onChange={update} />
          <Field label="Tagline"  name="tagline"  value={f.tagline  ?? ""} onChange={update} />
        </TwoCol>
        <div>
          <label style={{ display: "block", fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Status</label>
          <select value={f.status} onChange={e => update("status", e.target.value)}
            style={{ width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff", fontSize: 14, fontFamily: "inherit", outline: "none" }}>
            {STATUS_OPTIONS.map(s => <option key={s} value={s} style={{ background: "#1a1a1a" }}>{s}</option>)}
          </select>
        </div>
      </Section>

      {/* Timing */}
      <Section title="Event Timing">
        <TwoCol>
          <Field label="Event Date"    name="event_date"    value={f.event_date ?? ""}    onChange={update} type="date" />
          <Field label="Report Time"   name="report_time"   value={f.report_time ?? ""}   onChange={update} />
        </TwoCol>
        <TwoCol>
          <Field label="Flag-off Time" name="flag_off_time" value={f.flag_off_time ?? ""} onChange={update} />
          <div />
        </TwoCol>
        <TwoCol>
          <Field label="Registration Opens"  name="registration_opens_at"  value={f.registration_opens_at  ?? ""} onChange={update} type="datetime-local" />
          <Field label="Registration Closes" name="registration_closes_at" value={f.registration_closes_at ?? ""} onChange={update} type="datetime-local" />
        </TwoCol>
      </Section>

      {/* Venue */}
      <Section title="Venue">
        <TwoCol>
          <Field label="Venue Name"    name="venue_name"    value={f.venue_name    ?? ""} onChange={update} />
          <Field label="City"          name="city"          value={f.city          ?? ""} onChange={update} />
        </TwoCol>
        <Field label="Venue Address" name="venue_address" value={f.venue_address ?? ""} onChange={update} />
        <Field label="Google Maps URL" name="maps_url" value={f.maps_url ?? ""} onChange={update} type="url" />
      </Section>

      <div style={{ display: "flex", gap: 12 }}>
        <button type="submit" disabled={saving}
          style={{ padding: "12px 28px", background: saving ? "rgba(232,98,10,0.4)" : ACCENT, border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
          {saving ? "Saving…" : "Save Changes"}
        </button>
        <button type="button" onClick={() => { setForm(event as EventData); setMsg(null); }}
          style={{ padding: "12px 20px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#888", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
          Reset
        </button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "20px 24px", marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: ACCENT, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 18 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
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
