"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Button, Input, Label, Alert, Badge } from "@/components/ui/ds";
import dynamic from "next/dynamic";

const RichEmailEditor = dynamic(() => import("@/components/admin/RichEmailEditor"), { ssr: false });

// ── Constants ─────────────────────────────────────────────────────────────────

const CHANNELS = [
  { value: "email",     label: "Email",     icon: "📧", desc: "Rich HTML with attachments" },
  { value: "whatsapp",  label: "WhatsApp",  icon: "💬", desc: "Pre-approved templates only" },
];

const MESSAGE_TYPES = [
  { value: "training_announcement",   label: "Training Announcement" },
  { value: "event_announcement",      label: "Event Announcement" },
  { value: "special_event",           label: "Special Event" },
  { value: "community_run",           label: "Community Run" },
  { value: "festive_greeting",        label: "Festive Greeting" },
  { value: "birthday_wish",           label: "Birthday Wish" },
  { value: "sponsor_promotion",       label: "Sponsor Promotion" },
  { value: "venue_change",            label: "Venue Change" },
  { value: "route_map",               label: "Route Map" },
  { value: "emergency_notification",  label: "Emergency Notification" },
  { value: "maintenance_announcement",label: "Maintenance Announcement" },
  { value: "general_update",          label: "General Update" },
];

const SEGMENTS = [
  { value: "all_users",        label: "All Users",           configType: null },
  { value: "training_members", label: "Training Members",    configType: null },
  { value: "premium_members",  label: "Premium Members",     configType: null },
  { value: "free_members",     label: "Free Members (No Membership)", configType: null },
  { value: "event_registered", label: "Event Registrants",   configType: "event_ids" },
  { value: "attended_recent",  label: "Attended in Last N Days", configType: "days" },
  { value: "never_attended",   label: "Never Attended",      configType: null },
  { value: "waitlisted",       label: "Waitlisted Users",    configType: "event_ids_optional" },
  { value: "admins",           label: "Admins Only",         configType: null },
  { value: "custom_emails",    label: "Custom Email List",   configType: "emails" },
  { value: "custom_phones",    label: "Custom Phone List",   configType: "phones" },
];

const WA_TEMPLATES = [
  { name: "session_alert",           label: "Session Alert",          params: ["Name", "Date", "Location", "Run", "Link"] },
  { name: "run_registration",        label: "Run Registration",       params: ["Name", "Event Name", "Date", "Location"] },
  { name: "membership_confirmation", label: "Membership Confirmation",params: ["Name", "Plan", "Amount", "Expiry"] },
  { name: "birthday_wishes",         label: "Birthday Wishes",        params: ["Name"] },
];

// ── Input styles ──────────────────────────────────────────────────────────────

const SI: React.CSSProperties = {
  width: "100%", padding: "9px 12px",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
  color: "#fff", fontSize: "0.85rem", outline: "none",
  fontFamily: "inherit", boxSizing: "border-box",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function NewCampaignPage() {
  const router = useRouter();

  const [channel,     setChannel]     = useState("email");
  const [msgType,     setMsgType]     = useState("general_update");
  const [isTransact,  setIsTransact]  = useState(false);
  const [name,        setName]        = useState("");
  const [description, setDescription] = useState("");
  const [segment,     setSegment]     = useState("all_users");
  const [eventIds,    setEventIds]    = useState(""); // comma-separated
  const [days,        setDays]        = useState("30");
  const [customEmails,setCustomEmails]= useState("");
  const [customPhones,setCustomPhones]= useState("");

  // Email content
  const [subject,  setSubject]  = useState("");
  const [htmlBody, setHtmlBody] = useState("");

  // WhatsApp content
  const [waTemplate, setWaTemplate] = useState(WA_TEMPLATES[0].name);
  const [waParams,   setWaParams]   = useState<string[]>(WA_TEMPLATES[0].params.map(() => ""));

  // Scheduling
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduleFor,  setScheduleFor]  = useState("");

  // Segment preview
  const [previewCount,   setPreviewCount]   = useState<number | null>(null);
  const [previewSample,  setPreviewSample]  = useState<{ email: string; name: string }[]>([]);
  const [previewing,     setPreviewing]     = useState(false);

  // Submission
  const [saving,   setSaving]   = useState(false);
  const [sending,  setSending]  = useState(false);
  const [alert,    setAlert]    = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const selectedWaTemplate = WA_TEMPLATES.find(t => t.name === waTemplate)!;

  // Update WA param slots when template changes
  useEffect(() => {
    setWaParams(selectedWaTemplate.params.map(() => ""));
  }, [waTemplate]); // eslint-disable-line

  function buildSegmentConfig() {
    const cfg: Record<string, unknown> = {};
    if (segment === "event_registered" || segment === "waitlisted") {
      cfg.event_ids = eventIds.split(",").map(s => s.trim()).filter(Boolean);
    }
    if (segment === "attended_recent") cfg.days = Number(days) || 30;
    if (segment === "custom_emails")   cfg.emails = customEmails.split("\n").map(s => s.trim()).filter(Boolean);
    if (segment === "custom_phones")   cfg.phones = customPhones.split("\n").map(s => s.trim()).filter(Boolean);
    return cfg;
  }

  const previewSegment = useCallback(async () => {
    setPreviewing(true);
    setPreviewCount(null);
    const res = await fetch("/api/admin/campaigns/segment-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        segment_type:    segment,
        segment_config:  buildSegmentConfig(),
        channel,
        message_type:    msgType,
        is_transactional: isTransact,
      }),
    });
    const d = await res.json();
    setPreviewCount(d.count ?? null);
    setPreviewSample(d.sample ?? []);
    setPreviewing(false);
  }, [segment, eventIds, days, customEmails, customPhones, channel, msgType, isTransact]); // eslint-disable-line

  async function saveDraft(): Promise<string | null> {
    setSaving(true);
    setAlert(null);
    const body: Record<string, unknown> = {
      name, description, channel, message_type: msgType, is_transactional: isTransact,
      segment_type: segment, segment_config: buildSegmentConfig(),
    };
    if (channel === "email") {
      body.subject  = subject;
      body.html_body = htmlBody;
    } else {
      body.wa_template_name   = waTemplate;
      body.wa_template_params = waParams;
    }
    const res  = await fetch("/api/admin/campaigns", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setAlert({ type: "error", msg: data.error ?? "Failed to save" });
      return null;
    }
    return data.campaign.id as string;
  }

  async function handleSend() {
    if (!name.trim()) { setAlert({ type: "error", msg: "Campaign name is required." }); return; }
    if (channel === "email" && (!subject.trim() || !htmlBody.trim())) {
      setAlert({ type: "error", msg: "Email requires subject and body." }); return;
    }

    setSending(true);
    const id = await saveDraft();
    if (!id) { setSending(false); return; }

    const sendBody: Record<string, unknown> = {};
    if (scheduleMode === "later" && scheduleFor) sendBody.schedule_for = scheduleFor;

    const res  = await fetch(`/api/admin/campaigns/${id}/send`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sendBody),
    });
    const data = await res.json();
    setSending(false);

    if (res.ok) {
      if (data.scheduled) {
        router.push(`/admin/campaigns?alert=scheduled`);
      } else {
        router.push(`/admin/campaigns/${id}`);
      }
    } else {
      setAlert({ type: "error", msg: data.error ?? "Send failed" });
    }
  }

  const segmentDef = SEGMENTS.find(s => s.value === segment)!;

  return (
    <div style={{ padding: "1.5rem", maxWidth: 800, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <a href="/admin/campaigns" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.45)", textDecoration: "none" }}>
          ← Campaigns
        </a>
        <h1 style={{ margin: "8px 0 0", fontSize: "1.3rem", fontWeight: 800 }}>New Campaign</h1>
      </div>

      {alert && <Alert variant={alert.type === "success" ? "success" : "error"} style={{ marginBottom: 16 }}>{alert.msg}</Alert>}

      {/* ── Step 1: Basic Info ── */}
      <Card style={{ padding: "1.25rem", marginBottom: 16 }}>
        <div style={sectionTitle}>1 · Basic Info</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <Label style={labelStyle}>Campaign Name *</Label>
            <input style={SI} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. July Training Newsletter" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <Label style={labelStyle}>Description (optional)</Label>
            <input style={SI} value={description} onChange={e => setDescription(e.target.value)} placeholder="Internal note about this campaign" />
          </div>
        </div>

        {/* Channel */}
        <div style={{ marginTop: 16 }}>
          <Label style={labelStyle}>Channel *</Label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {CHANNELS.map(c => (
              <label key={c.value} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
                background: channel === c.value ? "rgba(232,98,10,0.12)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${channel === c.value ? "#e8620a" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 8, cursor: "pointer", flex: 1,
              }}>
                <input type="radio" name="channel" value={c.value} checked={channel === c.value}
                  onChange={() => setChannel(c.value)} style={{ accentColor: "#e8620a" }} />
                <span style={{ fontSize: "1.1rem" }}>{c.icon}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{c.label}</div>
                  <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.4)" }}>{c.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Message type */}
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <Label style={labelStyle}>Message Type</Label>
            <select style={SI} value={msgType} onChange={e => setMsgType(e.target.value)}>
              {MESSAGE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 2 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.85rem" }}>
              <input type="checkbox" checked={isTransact} onChange={e => setIsTransact(e.target.checked)} />
              <div>
                <div style={{ fontWeight: 600 }}>Transactional</div>
                <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.4)" }}>Skip consent filtering</div>
              </div>
            </label>
          </div>
        </div>
      </Card>

      {/* ── Step 2: Audience ── */}
      <Card style={{ padding: "1.25rem", marginBottom: 16 }}>
        <div style={sectionTitle}>2 · Audience</div>
        <div>
          <Label style={labelStyle}>Segment</Label>
          <select style={SI} value={segment} onChange={e => setSegment(e.target.value)}>
            {SEGMENTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        {/* Segment config inputs */}
        {segmentDef.configType === "event_ids" && (
          <div style={{ marginTop: 12 }}>
            <Label style={labelStyle}>Event IDs (comma-separated UUIDs)</Label>
            <input style={SI} value={eventIds} onChange={e => setEventIds(e.target.value)} placeholder="uuid1, uuid2, …" />
          </div>
        )}
        {segmentDef.configType === "event_ids_optional" && (
          <div style={{ marginTop: 12 }}>
            <Label style={labelStyle}>Event IDs — optional (leave blank for all waitlisted)</Label>
            <input style={SI} value={eventIds} onChange={e => setEventIds(e.target.value)} placeholder="uuid1, uuid2, … or leave blank" />
          </div>
        )}
        {segmentDef.configType === "days" && (
          <div style={{ marginTop: 12 }}>
            <Label style={labelStyle}>Days since last attendance</Label>
            <input style={{ ...SI, maxWidth: 120 }} type="number" min="1" max="365" value={days}
              onChange={e => setDays(e.target.value)} />
          </div>
        )}
        {segmentDef.configType === "emails" && (
          <div style={{ marginTop: 12 }}>
            <Label style={labelStyle}>Email addresses (one per line)</Label>
            <textarea style={{ ...SI, height: 100, resize: "vertical" }} value={customEmails}
              onChange={e => setCustomEmails(e.target.value)} placeholder="one@example.com&#10;two@example.com" />
          </div>
        )}
        {segmentDef.configType === "phones" && (
          <div style={{ marginTop: 12 }}>
            <Label style={labelStyle}>Phone numbers — 91XXXXXXXXXX (one per line)</Label>
            <textarea style={{ ...SI, height: 100, resize: "vertical" }} value={customPhones}
              onChange={e => setCustomPhones(e.target.value)} placeholder="919876543210&#10;918765432109" />
          </div>
        )}

        {/* Segment preview */}
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Button onClick={previewSegment} loading={previewing} size="sm" variant="outline">Preview Recipients</Button>
          {previewCount !== null && (
            <div style={{ fontSize: "0.85rem" }}>
              <span style={{ fontWeight: 700, color: "#4ade80" }}>{previewCount}</span>
              <span style={{ color: "rgba(255,255,255,0.5)" }}> eligible recipients</span>
              {previewSample.length > 0 && (
                <span style={{ color: "rgba(255,255,255,0.35)" }}>
                  {" (e.g. "}
                  {previewSample.map(s => s.name || s.email).slice(0, 3).join(", ")}
                  {previewSample.length > 3 ? ", …" : ""}
                  {")"}
                </span>
              )}
            </div>
          )}
        </div>

        {!isTransact && (
          <div style={{ marginTop: 10, fontSize: "0.75rem", color: "rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.03)", padding: "8px 10px", borderRadius: 6 }}>
            ℹ Opted-out users and suppressed emails are automatically excluded at send time.
          </div>
        )}
      </Card>

      {/* ── Step 3: Content ── */}
      <Card style={{ padding: "1.25rem", marginBottom: 16 }}>
        <div style={sectionTitle}>3 · Content</div>

        {channel === "email" ? (
          <>
            <div style={{ marginBottom: 12 }}>
              <Label style={labelStyle}>Subject *</Label>
              <input style={SI} value={subject} onChange={e => setSubject(e.target.value)}
                placeholder="e.g. July Training Sessions Now Live 🏃" />
              <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.3)", marginTop: 4 }}>
                Use {"{{firstName}}"} for personalisation.
              </div>
            </div>
            <div>
              <Label style={labelStyle}>Body *</Label>
              <RichEmailEditor content={htmlBody} onChange={(html) => setHtmlBody(html)} minHeight={300} placeholder="Write your email content…" />
            </div>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <Label style={labelStyle}>WhatsApp Template</Label>
              <select style={SI} value={waTemplate}
                onChange={e => setWaTemplate(e.target.value)}>
                {WA_TEMPLATES.map(t => <option key={t.name} value={t.name}>{t.label}</option>)}
              </select>
              <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.3)", marginTop: 4 }}>
                Only pre-approved Meta templates can be used for business-initiated messages.
              </div>
            </div>
            {selectedWaTemplate.params.length > 0 && (
              <div>
                <Label style={labelStyle}>Template Variables</Label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {selectedWaTemplate.params.map((param, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.45)", minWidth: 90 }}>{"{{" + (i + 1) + "}} " + param}</span>
                      <input style={{ ...SI, flex: 1 }} value={waParams[i] ?? ""} placeholder={`Value for ${param}`}
                        onChange={e => setWaParams(p => { const n = [...p]; n[i] = e.target.value; return n; })} />
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.3)", marginTop: 6 }}>
                  Use {"{{firstName}}"} or {"{{fullName}}"} for personalisation.
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* ── Step 4: Schedule ── */}
      <Card style={{ padding: "1.25rem", marginBottom: 20 }}>
        <div style={sectionTitle}>4 · Schedule</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {(["now", "later"] as const).map(m => (
            <label key={m} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.85rem" }}>
              <input type="radio" name="schedule" value={m} checked={scheduleMode === m}
                onChange={() => setScheduleMode(m)} style={{ accentColor: "#e8620a" }} />
              {m === "now" ? "Send Immediately" : "Schedule for Later"}
            </label>
          ))}
        </div>
        {scheduleMode === "later" && (
          <div style={{ marginTop: 12 }}>
            <Label style={labelStyle}>Send at (IST)</Label>
            <input style={{ ...SI, maxWidth: 260 }} type="datetime-local" value={scheduleFor}
              onChange={e => setScheduleFor(e.target.value)} />
          </div>
        )}
      </Card>

      {/* ── Actions ── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Button onClick={async () => {
          if (!name.trim()) { setAlert({ type: "error", msg: "Name is required" }); return; }
          const id = await saveDraft();
          if (id) router.push(`/admin/campaigns/${id}`);
        }} loading={saving} variant="outline">
          Save as Draft
        </Button>
        <Button onClick={handleSend} loading={sending} variant="primary">
          {scheduleMode === "later" ? "Schedule Campaign" : "Send Campaign"}
        </Button>
        <Link href="/admin/campaigns">
          <Button variant="ghost">Cancel</Button>
        </Link>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const sectionTitle: React.CSSProperties = {
  fontWeight: 700, fontSize: "0.8rem", color: "rgba(255,255,255,0.45)",
  textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 14,
};

const labelStyle: React.CSSProperties = { fontSize: "0.8rem", marginBottom: 5, display: "block" };
