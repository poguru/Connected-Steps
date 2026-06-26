"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

type RecipientFilter = "all" | "paid" | "free" | "pending" | "checked_in" | "not_checked_in";
type Channel = "email" | "push";

interface CommHistory {
  id:               string;
  sent_at:          string;
  subject:          string;
  recipients:       number;
  sent:             number;
  failed:           number;
  status:           string;
  recipient_filter: string;
  channel?:         string;
}

// ── Template library ──────────────────────────────────────────────────────────

const EMAIL_TEMPLATES = [
  {
    id: "schedule",
    label: "📅 Event Schedule",
    subject: "Event Schedule — Connected Steps",
    body: `Hi {name},

Here's what you need to know for race day:

🕐 REPORTING TIME: 5:30 AM
🏁 FLAG OFF: 6:00 AM
📍 VENUE: [Venue Name and Address]
🚗 PARKING: [Parking Details]
🗺 ROUTE MAP: [Link]

Please arrive 30 minutes before flag off.

For any queries: info@connectedsteps.in

See you at the start line! 🏃`,
  },
  {
    id: "reminder",
    label: "⏰ Race Day Reminder",
    subject: "Race Day Tomorrow — You're Ready!",
    body: `Hi {name},

Your big day is tomorrow! Here's your quick checklist:

✅ Your QR code is in your registration email — keep it handy
✅ Carry a valid ID proof
✅ Bring a water bottle
✅ Wear comfortable running gear
✅ Get a good night's sleep

We're excited to see you tomorrow!

— Connected Steps Team`,
  },
  {
    id: "bib_reminder",
    label: "📦 BIB Collection Reminder",
    subject: "Don't Forget to Collect Your BIB Packet!",
    body: `Hi {name},

Don't forget to collect your BIB packet before race day!

📦 BIB COLLECTION DETAILS:
Venue: [Collection Center Name]
Address: [Address]
Date & Time: [Date] from [Time] to [Time]

What you'll receive in your packet:
• Race BIB with your number
• Timing chip (if applicable)
• T-shirt (if applicable)
• Event goodies

Please bring a valid photo ID when collecting.

See you at the collection center!
— Connected Steps Team`,
  },
  {
    id: "update",
    label: "📢 Important Update",
    subject: "Important Update — Connected Steps Event",
    body: `Hi {name},

We have an important update about your upcoming event.

[Add your update here]

Please note this change and update your plans accordingly.

For any questions: info@connectedsteps.in

Thank you for your understanding.
— Connected Steps Team`,
  },
  {
    id: "results",
    label: "🏅 Results Available",
    subject: "Your Results Are Live! 🏁",
    body: `Hi {name},

Congratulations on completing the event! 🎉

Your results are now live. Check your finish time, position, and timing details on the website.

🏃 You did amazing — every finisher is a winner!

Results: [Results Page Link]

Thank you for being part of Connected Steps.
— Connected Steps Team`,
  },
  {
    id: "certificate",
    label: "📜 Certificate Ready",
    subject: "Your Finisher Certificate is Ready! 🏅",
    body: `Hi {name},

Your official finisher certificate for [Event Name] is ready to download!

🏅 [Certificate Download Link]

Print it, frame it, or share it — you've earned it!

Thank you for running with Connected Steps.
— Connected Steps Team`,
  },
  {
    id: "custom",
    label: "✏️ Custom Message",
    subject: "",
    body: "",
  },
];

const PUSH_TEMPLATES = [
  { id: "reminder",  label: "⏰ Race Day Reminder", title: "Race Day Tomorrow! 🏃", body: "Don't forget — your event is tomorrow. Check your registration email for your QR code." },
  { id: "bib",       label: "📦 BIB Reminder",       title: "Collect Your BIB 📦", body: "Your BIB packet is ready for collection. Please pick it up before race day." },
  { id: "checkin",   label: "✅ Check-In Open",       title: "Check-In is Open! ✅", body: "Race day check-in is now open. Show your QR code at the entrance." },
  { id: "update",    label: "📢 Quick Update",        title: "Event Update 📢", body: "" },
  { id: "results",   label: "🏅 Results Live",         title: "Your Results Are Live! 🏁", body: "Check your finish time and position on the results page." },
  { id: "custom",    label: "✏️ Custom",              title: "", body: "" },
];

const FILTERS: { value: RecipientFilter; label: string }[] = [
  { value: "all",            label: "All Confirmed Registrants" },
  { value: "paid",           label: "Paid Only" },
  { value: "free",           label: "Free / Complementary" },
  { value: "checked_in",    label: "Checked In" },
  { value: "not_checked_in", label: "Not Yet Checked In" },
];

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  page:   { minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "inherit" } as React.CSSProperties,
  header: { position: "sticky" as const, top: 0, zIndex: 40, background: "rgba(10,10,10,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 2rem", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" } as React.CSSProperties,
  card:   { background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "1.25rem" } as React.CSSProperties,
  input:  { width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const } as React.CSSProperties,
  select: { width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const, cursor: "pointer" } as React.CSSProperties,
  textarea: { width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const, resize: "vertical" as const } as React.CSSProperties,
  btn:    (p = true): React.CSSProperties => ({ padding: "9px 20px", background: p ? "#e8620a" : "rgba(255,255,255,0.06)", border: p ? "none" : "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: p ? "#fff" : "#aaa", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }),
  label:  { display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase" as const, letterSpacing: ".07em", marginBottom: 6 } as React.CSSProperties,
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function CommunicatePage() {
  const params  = useParams();
  const eventId = params.id as string;

  const [tab,     setTab]     = useState<"email"|"push"|"history">("email");
  const [history, setHistory] = useState<CommHistory[]>([]);

  // Email state
  const [emailFilter,   setEmailFilter]   = useState<RecipientFilter>("all");
  const [emailSubject,  setEmailSubject]  = useState("");
  const [emailBody,     setEmailBody]     = useState("");
  const [emailTemplate, setEmailTemplate] = useState("custom");
  const [emailSending,  setEmailSending]  = useState(false);
  const [emailResult,   setEmailResult]   = useState<{ sent: number; failed: number } | null>(null);

  // Push state
  const [pushFilter,    setPushFilter]    = useState<RecipientFilter>("all");
  const [pushTitle,     setPushTitle]     = useState("");
  const [pushBody,      setPushBody]      = useState("");
  const [pushTemplate,  setPushTemplate]  = useState("custom");
  const [pushSending,   setPushSending]   = useState(false);
  const [pushResult,    setPushResult]    = useState<{ sent: number } | null>(null);

  const [toast, setToast] = useState("");
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3500); };

  useEffect(() => { loadHistory(); /* eslint-disable-next-line */ }, []);

  async function loadHistory() {
    const res  = await fetch(`/api/admin/events/${eventId}/communicate`);
    const data = await res.json();
    setHistory(data.history ?? []);
  }

  // ── Email send ──────────────────────────────────────────────────────────────

  function applyEmailTemplate(id: string) {
    setEmailTemplate(id);
    const t = EMAIL_TEMPLATES.find(t => t.id === id);
    if (t && id !== "custom") { setEmailSubject(t.subject); setEmailBody(t.body); }
  }

  async function sendEmail() {
    if (!emailSubject.trim() || !emailBody.trim()) { showToast("Subject and body are required"); return; }
    if (!confirm(`Send email to ${FILTERS.find(f => f.value === emailFilter)?.label}?`)) return;
    setEmailSending(true); setEmailResult(null);
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/communicate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: emailSubject, body: emailBody, recipient_filter: emailFilter }),
      });
      const data = await res.json();
      if (res.ok) { setEmailResult(data); showToast(`✅ Sent ${data.sent} emails`); await loadHistory(); }
      else showToast(`❌ ${data.error ?? "Send failed"}`);
    } finally { setEmailSending(false); }
  }

  // ── Push send ───────────────────────────────────────────────────────────────

  function applyPushTemplate(id: string) {
    setPushTemplate(id);
    const t = PUSH_TEMPLATES.find(t => t.id === id);
    if (t && id !== "custom") { setPushTitle(t.title); if (t.body) setPushBody(t.body); }
  }

  async function sendPush() {
    if (!pushTitle.trim() || !pushBody.trim()) { showToast("Title and body are required"); return; }
    if (!confirm(`Send push notification to ${FILTERS.find(f => f.value === pushFilter)?.label}?`)) return;
    setPushSending(true); setPushResult(null);
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/communicate/push`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: pushTitle, body: pushBody, recipient_filter: pushFilter, action_url: `/events` }),
      });
      const data = await res.json();
      if (res.ok) { setPushResult(data); showToast(`✅ Push sent to ${data.sent} users`); await loadHistory(); }
      else showToast(`❌ ${data.error ?? "Send failed"}`);
    } finally { setPushSending(false); }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const TABS = [
    { key: "email",   label: "📧 Email" },
    { key: "push",    label: "🔔 Push Notification" },
    { key: "history", label: `📋 History (${history.length})` },
  ];

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href={`/admin/events/${eventId}/manage`} style={{ color: "#555", fontSize: 13, textDecoration: "none" }}>← Event Hub</Link>
          <span style={{ color: "#333" }}>/</span>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Communication Hub</span>
        </div>
        <Link href={`/admin/events/${eventId}/registrations`} style={{ ...S.btn(false), fontSize: 12, textDecoration: "none", padding: "6px 14px" }}>
          View Registrations
        </Link>
      </header>

      {/* Tabs */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 2rem", background: "#0d0d0d" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex" }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key as typeof tab)} style={{ padding: "12px 18px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: tab === t.key ? 700 : 400, color: tab === t.key ? "#fff" : "#555", borderBottom: tab === t.key ? "2px solid #e8620a" : "2px solid transparent", marginBottom: -1 }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "1.75rem 2rem" }}>

        {/* ── Email Tab ──────────────────────────────────────────────────────── */}
        {tab === "email" && (
          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 20 }}>
            {/* Template sidebar */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase" as const, letterSpacing: ".07em", marginBottom: 10 }}>Templates</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {EMAIL_TEMPLATES.map(t => (
                  <button key={t.id} onClick={() => applyEmailTemplate(t.id)} style={{ padding: "8px 12px", background: emailTemplate === t.id ? "rgba(232,98,10,0.15)" : "rgba(255,255,255,0.03)", border: emailTemplate === t.id ? "1px solid rgba(232,98,10,0.3)" : "1px solid rgba(255,255,255,0.06)", borderRadius: 8, color: emailTemplate === t.id ? "#e8620a" : "#888", fontSize: 12, fontWeight: emailTemplate === t.id ? 700 : 400, cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Composer */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={S.label}>Recipients</label>
                <select style={S.select} value={emailFilter} onChange={e => setEmailFilter(e.target.value as RecipientFilter)}>
                  {FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>

              <div>
                <label style={S.label}>Subject *</label>
                <input style={S.input} value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Email subject line" />
              </div>

              <div>
                <label style={S.label}>Message *</label>
                <p style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>Use <code style={{ color: "#e8620a" }}>{"{name}"}</code> for participant name. Plain text — line breaks become paragraphs.</p>
                <textarea style={{ ...S.textarea, minHeight: 280 }} value={emailBody} onChange={e => setEmailBody(e.target.value)} placeholder="Write your message here…" />
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button onClick={sendEmail} disabled={emailSending} style={S.btn()}>
                  {emailSending ? "Sending…" : "Send Email"}
                </button>
                {emailResult && (
                  <span style={{ fontSize: 13, color: "#4ade80" }}>
                    ✅ Sent to {emailResult.sent} participants{emailResult.failed > 0 ? ` · ❌ ${emailResult.failed} failed` : ""}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Push Notification Tab ──────────────────────────────────────────── */}
        {tab === "push" && (
          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 20 }}>
            {/* Template sidebar */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase" as const, letterSpacing: ".07em", marginBottom: 10 }}>Quick Templates</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {PUSH_TEMPLATES.map(t => (
                  <button key={t.id} onClick={() => applyPushTemplate(t.id)} style={{ padding: "8px 12px", background: pushTemplate === t.id ? "rgba(232,98,10,0.15)" : "rgba(255,255,255,0.03)", border: pushTemplate === t.id ? "1px solid rgba(232,98,10,0.3)" : "1px solid rgba(255,255,255,0.06)", borderRadius: 8, color: pushTemplate === t.id ? "#e8620a" : "#888", fontSize: 12, fontWeight: pushTemplate === t.id ? 700 : 400, cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const }}>
                    {t.label}
                  </button>
                ))}
              </div>

              <div style={{ marginTop: 20, padding: "12px", background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, fontSize: 11, color: "#555", lineHeight: 1.6 }}>
                <strong style={{ color: "#888" }}>Channels:</strong><br />
                • In-app notification (database)<br />
                • Web push (VAPID)<br />
                • Mobile push (Expo)<br /><br />
                Users receive all channels simultaneously.
              </div>
            </div>

            {/* Composer */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={S.label}>Recipients</label>
                <select style={S.select} value={pushFilter} onChange={e => setPushFilter(e.target.value as RecipientFilter)}>
                  {FILTERS.filter(f => f.value !== "pending").map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>

              <div>
                <label style={S.label}>Notification Title *</label>
                <input style={S.input} value={pushTitle} onChange={e => setPushTitle(e.target.value)} placeholder="Race Day Tomorrow! 🏃" maxLength={65} />
                <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>{pushTitle.length}/65 characters</div>
              </div>

              <div>
                <label style={S.label}>Message Body *</label>
                <textarea style={{ ...S.textarea, minHeight: 100 }} value={pushBody} onChange={e => setPushBody(e.target.value)} placeholder="Don't forget — your event is tomorrow…" maxLength={178} />
                <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>{pushBody.length}/178 characters</div>
              </div>

              {/* Preview */}
              {(pushTitle || pushBody) && (
                <div style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ fontSize: 11, color: "#555", marginBottom: 8, fontWeight: 700, textTransform: "uppercase" as const }}>Preview</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: "#e8620a22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 18 }}>🏃</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#fff", marginBottom: 2 }}>{pushTitle || "Notification Title"}</div>
                      <div style={{ fontSize: 12, color: "#888", lineHeight: 1.4 }}>{pushBody || "Notification body…"}</div>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button onClick={sendPush} disabled={pushSending} style={{ ...S.btn(), background: "#7c3aed" }}>
                  {pushSending ? "Sending…" : "Send Push Notification"}
                </button>
                {pushResult && (
                  <span style={{ fontSize: 13, color: "#4ade80" }}>✅ Sent to {pushResult.sent} users</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── History Tab ────────────────────────────────────────────────────── */}
        {tab === "history" && (
          <div>
            {history.length === 0 ? (
              <div style={{ ...S.card, textAlign: "center", padding: "4rem" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                <div style={{ fontWeight: 700, fontSize: 16, color: "#555" }}>No messages sent yet</div>
              </div>
            ) : (
              <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                      {["Sent At", "Subject", "Channel", "Filter", "Sent", "Failed", "Status"].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left" as const, fontSize: 10, color: "#555", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".07em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(h => (
                      <tr key={h.id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ padding: "10px 14px", color: "#666", whiteSpace: "nowrap" as const, fontSize: 12 }}>
                          {new Date(h.sent_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td style={{ padding: "10px 14px", fontWeight: 600, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" as const, whiteSpace: "nowrap" as const }}>{h.subject}</td>
                        <td style={{ padding: "10px 14px" }}>
                          <span style={{ padding: "2px 10px", borderRadius: 999, background: (h.channel ?? "email") === "push" ? "rgba(124,58,237,0.15)" : "rgba(232,98,10,0.12)", color: (h.channel ?? "email") === "push" ? "#a78bfa" : "#e8620a", fontSize: 11, fontWeight: 700 }}>
                            {(h.channel ?? "email").toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px", color: "#666", fontSize: 12 }}>{h.recipient_filter ?? "all"}</td>
                        <td style={{ padding: "10px 14px", color: "#4ade80", fontWeight: 700 }}>{h.sent ?? h.recipients}</td>
                        <td style={{ padding: "10px 14px", color: h.failed > 0 ? "#f87171" : "#555" }}>{h.failed ?? 0}</td>
                        <td style={{ padding: "10px 14px" }}>
                          <span style={{ padding: "2px 8px", borderRadius: 999, background: "rgba(74,222,128,0.1)", color: "#4ade80", fontSize: 11, fontWeight: 700 }}>
                            {h.status ?? "sent"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 24, padding: "10px 20px", fontSize: 13, fontWeight: 600, color: "#fff", zIndex: 9999, whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
