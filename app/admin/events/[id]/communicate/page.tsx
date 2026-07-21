"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button, Alert, Badge, Label, Tabs, Spinner } from "@/components/ui/ds";

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
  batch_id?:        string | null;
}

interface DeliveryEmail {
  email:          string;
  name?:          string | null;
  status:         string;
  error?:         string | null;
  code?:          string | null;
  is_permanent?:  boolean | null;
  attempts:       number;
  aws_message_id?: string | null;
  sent_at?:       string | null;
}

interface BatchDetail {
  total:     number;
  queued:    number;
  sending:   number;
  delivered: number;
  failed:    number;
  retryable: number;
  emails:    DeliveryEmail[];
}

interface EmailDetail {
  email:        string;
  status:       "delivered" | "queued" | "failed";
  error?:       string | null;
  code?:        string | null;
  is_permanent?: boolean | null;
  attempts:     number;
}

interface SendState {
  phase:     "idle" | "queuing" | "sending" | "done";
  batchId:   string | null;
  total:     number;
  queued:    number;
  delivered: number;
  failed:    number;
  details:   EmailDetail[];
  // transient failed count (can be retried)
  retryable: number;
}

const INITIAL_SEND: SendState = {
  phase: "idle", batchId: null, total: 0, queued: 0,
  delivered: 0, failed: 0, details: [], retryable: 0,
};

// ── Template library ──────────────────────────────────────────────────────────

const EMAIL_TEMPLATES = [
  {
    id: "schedule", label: "📅 Event Schedule",
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
    id: "reminder", label: "⏰ Race Day Reminder",
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
    id: "bib_reminder", label: "📦 BIB Collection Reminder",
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
    id: "update", label: "📢 Important Update",
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
    id: "results", label: "🏅 Results Available",
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
    id: "certificate", label: "📜 Certificate Ready",
    subject: "Your Finisher Certificate is Ready! 🏅",
    body: `Hi {name},

Your official finisher certificate for [Event Name] is ready to download!

🏅 [Certificate Download Link]

Print it, frame it, or share it — you've earned it!

Thank you for running with Connected Steps.
— Connected Steps Team`,
  },
  { id: "custom", label: "✏️ Custom Message", subject: "", body: "" },
];

const PUSH_TEMPLATES = [
  { id: "reminder",  label: "⏰ Race Day Reminder", title: "Race Day Tomorrow! 🏃", body: "Don't forget — your event is tomorrow. Check your registration email for your QR code." },
  { id: "bib",       label: "📦 BIB Reminder",       title: "Collect Your BIB 📦",  body: "Your BIB packet is ready for collection. Please pick it up before race day." },
  { id: "checkin",   label: "✅ Check-In Open",       title: "Check-In is Open! ✅", body: "Race day check-in is now open. Show your QR code at the entrance." },
  { id: "update",    label: "📢 Quick Update",        title: "Event Update 📢",       body: "" },
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
  page:    { minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "inherit" } as React.CSSProperties,
  header:  { position: "sticky" as const, top: 0, zIndex: 40, background: "rgba(10,10,10,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 2rem", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" } as React.CSSProperties,
  input:   { width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const } as React.CSSProperties,
  select:  { width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const, cursor: "pointer" } as React.CSSProperties,
  textarea:{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const, resize: "vertical" as const } as React.CSSProperties,
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function CommunicatePage() {
  const params  = useParams();
  const eventId = params.id as string;

  const [tab,     setTab]     = useState<"email" | "push" | "history">("email");
  const [history, setHistory] = useState<CommHistory[]>([]);

  // Email composer state
  const [emailFilter,   setEmailFilter]   = useState<RecipientFilter>("all");
  const [emailSubject,  setEmailSubject]  = useState("");
  const [emailBody,     setEmailBody]     = useState("");
  const [emailTemplate, setEmailTemplate] = useState("custom");

  // Async send state machine
  const [send, setSend] = useState<SendState>(INITIAL_SEND);
  const pollRef         = useRef<ReturnType<typeof setInterval> | null>(null);

  // Push state
  const [pushFilter,   setPushFilter]   = useState<RecipientFilter>("all");
  const [pushTitle,    setPushTitle]    = useState("");
  const [pushBody,     setPushBody]     = useState("");
  const [pushTemplate, setPushTemplate] = useState("custom");
  const [pushSending,  setPushSending]  = useState(false);
  const [pushResult,   setPushResult]   = useState<{ sent: number } | null>(null);

  // Test email state
  const [testEmailAddr,  setTestEmailAddr]  = useState("");
  const [testSending,    setTestSending]    = useState(false);
  const [testResult,     setTestResult]     = useState<string>("");

  // Delivery tracking state (history tab drill-down)
  const [expandedBatch,  setExpandedBatch]  = useState<string | null>(null);
  const [batchDetail,    setBatchDetail]    = useState<BatchDetail | null>(null);
  const [detailLoading,  setDetailLoading]  = useState(false);
  const [detailFilter,   setDetailFilter]   = useState<string>("all");
  const [detailSearch,   setDetailSearch]   = useState("");
  const [resumingBatch,  setResumingBatch]  = useState<string | null>(null);

  const [toast, setToast] = useState("");
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3500); };

  useEffect(() => { loadHistory(); /* eslint-disable-next-line */ }, []);

  async function loadHistory() {
    const res  = await fetch(`/api/admin/events/${eventId}/communicate`);
    const data = await res.json();
    setHistory(data.history ?? []);
  }

  // ── Status polling ────────────────────────────────────────────────────────────
  // Polls /status every 3s while sending. Emails are processed server-side via
  // after() — the browser just reads progress from the DB. Closing the tab is safe.

  useEffect(() => {
    if (send.phase !== "sending" || !send.batchId) return;
    const batchId = send.batchId;

    const poll = async () => {
      try {
        const res  = await fetch(`/api/admin/events/${eventId}/communicate/status?batch_id=${batchId}`);
        const data = await res.json() as { total: number; queued: number; sending: number; delivered: number; failed: number; retryable: number };

        setSend(s => ({
          ...s,
          total:     data.total,
          queued:    data.queued + data.sending,
          delivered: data.delivered,
          failed:    data.failed,
          retryable: data.retryable,
        }));

        if (data.queued === 0 && data.sending === 0) {
          // All done — load per-email detail list and finalize
          clearInterval(pollRef.current!);
          const detailRes  = await fetch(`/api/admin/events/${eventId}/communicate/status?batch_id=${batchId}&include_all=true`);
          const detailData = await detailRes.json() as { emails?: DeliveryEmail[] };
          setSend(s => ({
            ...s,
            phase:  "done",
            queued: 0,
            details: (detailData.emails ?? []).map(d => ({
              email:        d.email,
              status:       d.status as EmailDetail["status"],
              error:        d.error,
              code:         d.code,
              is_permanent: d.is_permanent,
              attempts:     d.attempts,
            })),
          }));
          void loadHistory();
        }
      } catch {
        // Network error — continue polling
      }
    };

    void poll();
    pollRef.current = setInterval(poll, 3000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [send.phase, send.batchId]);

  // ── Email enqueue ─────────────────────────────────────────────────────────────

  function applyEmailTemplate(id: string) {
    setEmailTemplate(id);
    const t = EMAIL_TEMPLATES.find(t => t.id === id);
    if (t && id !== "custom") { setEmailSubject(t.subject); setEmailBody(t.body); }
  }

  async function enqueueEmail() {
    if (!emailSubject.trim() || !emailBody.trim()) { showToast("Subject and body are required"); return; }
    const filterLabel = FILTERS.find(f => f.value === emailFilter)?.label ?? emailFilter;
    if (!confirm(`Queue email to ${filterLabel}?\n\nEmails will be sent in the background — you can safely close this tab.`)) return;

    setSend({ ...INITIAL_SEND, phase: "queuing" });

    try {
      const res  = await fetch(`/api/admin/events/${eventId}/communicate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: emailSubject, body: emailBody, recipient_filter: emailFilter }),
      });
      const data = await res.json() as { batch_id?: string; queued?: number; message?: string; error?: string };

      if (!res.ok) { setSend(INITIAL_SEND); showToast(`❌ ${data.error ?? "Failed to queue emails"}`); return; }
      if (!data.batch_id || !data.queued) { setSend(INITIAL_SEND); showToast(data.message ?? "No recipients matched"); return; }

      setSend({ ...INITIAL_SEND, phase: "sending", batchId: data.batch_id, total: data.queued, queued: data.queued });
    } catch {
      setSend(INITIAL_SEND);
      showToast("❌ Network error — please try again");
    }
  }

  async function retryFailed() {
    if (!send.batchId) return;
    const batchId = send.batchId;
    const res  = await fetch(`/api/admin/events/${eventId}/communicate/status`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch_id: batchId }),
    });
    const data = await res.json() as { requeued?: number };
    if ((data.requeued ?? 0) > 0) {
      // Re-trigger server-side processing for the re-queued emails
      void fetch(`/api/admin/events/${eventId}/communicate/resume`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_id: batchId }),
      });
      setSend(s => ({ ...s, phase: "sending", queued: data.requeued!, details: [], retryable: 0 }));
    } else {
      showToast("No transient failures to retry");
    }
  }

  function downloadCSV() {
    const rows = ["Email,Status,Error,Code,Permanent,Attempts",
      ...send.details.map(d =>
        `${d.email},${d.status},"${(d.error ?? "").replace(/"/g, "'")}",${d.code ?? ""},${d.is_permanent ?? ""},${d.attempts}`
      )];
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(rows.join("\n"));
    a.download = `email-report-${send.batchId?.slice(0, 8) ?? "batch"}.csv`;
    a.click();
  }

  // ── Delivery tracking ─────────────────────────────────────────────────────────

  async function toggleBatchDetail(batchId: string | null | undefined) {
    if (!batchId) return;
    if (expandedBatch === batchId) {
      setExpandedBatch(null); setBatchDetail(null); setDetailFilter("all"); setDetailSearch("");
      return;
    }
    setExpandedBatch(batchId); setBatchDetail(null); setDetailLoading(true);
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/communicate/status?batch_id=${batchId}&include_all=true`);
      const data = await res.json() as BatchDetail;
      setBatchDetail(data);
    } catch { showToast("Failed to load delivery detail"); }
    finally { setDetailLoading(false); }
  }

  async function retryBatchFailed(batchId: string) {
    const res  = await fetch(`/api/admin/events/${eventId}/communicate/status`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch_id: batchId }),
    });
    const data = await res.json() as { requeued?: number };
    if ((data.requeued ?? 0) > 0) {
      showToast(`🔄 ${data.requeued} emails re-queued for retry`);
      void toggleBatchDetail(batchId); // refresh
    } else {
      showToast("No transient failures to retry");
    }
  }

  async function resumeBatch(batchId: string) {
    setResumingBatch(batchId);
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/communicate/resume`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_id: batchId }),
      });
      const data = await res.json() as { resumed?: number; error?: string };
      if (!res.ok) { showToast(`❌ ${data.error ?? "Resume failed"}`); return; }
      showToast(`▶ Resuming delivery for ${data.resumed} queued email${data.resumed !== 1 ? "s" : ""}`);
      void loadHistory();
    } catch { showToast("❌ Network error"); }
    finally { setResumingBatch(null); }
  }

  function downloadBatchCSV(batchId: string) {
    if (!batchDetail) return;
    const rows = [
      "Email,Name,Status,Error,Code,Permanent,Attempts,AWS Message ID,Sent At",
      ...batchDetail.emails.map(d =>
        [d.email, d.name ?? "", d.status, d.error ?? "", d.code ?? "", d.is_permanent ?? "", d.attempts, d.aws_message_id ?? "", d.sent_at ?? ""]
          .map(v => `"${String(v).replace(/"/g, "'")}"`)
          .join(",")
      ),
    ].join("\n");
    const a = document.createElement("a");
    a.href  = "data:text/csv;charset=utf-8," + encodeURIComponent(rows);
    a.download = `delivery-report-${batchId.slice(0, 8)}.csv`;
    a.click();
  }

  // ── Test email ────────────────────────────────────────────────────────────────

  async function sendTestEmail() {
    if (!emailSubject.trim() || !emailBody.trim()) { showToast("Write a subject and message first"); return; }
    const to = testEmailAddr.trim() || prompt("Send test to which email address?");
    if (!to) return;
    setTestSending(true); setTestResult("");
    try {
      const res  = await fetch(`/api/admin/events/${eventId}/communicate/test`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject: emailSubject, body: emailBody }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      setTestResult(data.ok ? `✅ Test sent to ${to}` : `❌ ${data.error ?? "Failed"}`);
    } catch { setTestResult("❌ Network error"); }
    finally { setTestSending(false); }
  }

  // ── Push send ─────────────────────────────────────────────────────────────────

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

  // ── Render ────────────────────────────────────────────────────────────────────

  const TABS = [
    { key: "email",   label: "📧 Email" },
    { key: "push",    label: "🔔 Push Notification" },
    { key: "history", label: `📋 History (${history.length})` },
  ];

  const pct = send.total > 0 ? Math.round(((send.delivered + send.failed) / send.total) * 100) : 0;

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href={`/admin/events/${eventId}/manage`} style={{ color: "#555", fontSize: 13, textDecoration: "none" }}>← Event Hub</Link>
          <span style={{ color: "#333" }}>/</span>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Communication Hub</span>
        </div>
        <Link href={`/admin/events/${eventId}/registrations`} style={{ textDecoration: "none" }}>
          <Button size="sm" variant="secondary">View Registrations</Button>
        </Link>
      </header>

      {/* Tabs */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 2rem", background: "#0d0d0d" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <Tabs tabs={TABS.map(t => ({ key: t.key, label: t.label }))} active={tab} onChange={k => setTab(k as typeof tab)} />
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "1.75rem 2rem" }}>

        {/* ── Email Tab ────────────────────────────────────────────────────── */}
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

              {/* Provider info */}
              <div style={{ marginTop: 20, padding: "10px 12px", background: "rgba(96,165,250,0.05)", border: "1px solid rgba(96,165,250,0.15)", borderRadius: 8, fontSize: 11, color: "#60a5fa", lineHeight: 1.6 }}>
                <strong>ZeptoMail</strong><br />
                Emails are sent server-side in the background.<br /><br />
                You can close this tab — delivery will continue automatically.
              </div>
            </div>

            {/* Composer */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <Label>Recipients</Label>
                <select style={S.select} value={emailFilter} onChange={e => setEmailFilter(e.target.value as RecipientFilter)} disabled={send.phase === "sending"}>
                  {FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>

              <div>
                <Label>Subject *</Label>
                <input style={S.input} value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Email subject line" disabled={send.phase === "sending"} />
              </div>

              <div>
                <Label>Message *</Label>
                <p style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>Use <code style={{ color: "#e8620a" }}>{"{name}"}</code> for participant name. Plain text — line breaks become paragraphs.</p>
                <textarea style={{ ...S.textarea, minHeight: 260 }} value={emailBody} onChange={e => setEmailBody(e.target.value)} placeholder="Write your message here…" disabled={send.phase === "sending"} />
              </div>

              {/* ── Send button / progress display ─────────────────────────── */}
              {send.phase === "idle" && (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const, alignItems: "center" }}>
                  <Button onClick={enqueueEmail}>Queue &amp; Send Email</Button>
                  <Button size="sm" variant="secondary" loading={testSending} onClick={sendTestEmail}>📨 Send Test</Button>
                  {testResult && <Badge color={testResult.startsWith("✅") ? "green" : "red"} size="sm">{testResult}</Badge>}
                </div>
              )}

              {send.phase === "queuing" && (
                <div style={{ fontSize: 13, color: "#60a5fa" }}>⏳ Preparing queue…</div>
              )}

              {(send.phase === "sending" || send.phase === "done") && (
                <div style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "16px 18px" }}>

                  {/* Status header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    {send.phase === "sending" ? (
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#60a5fa" }}>📤 Sending… (server-side — safe to close tab)</span>
                    ) : (
                      <span style={{ fontSize: 13, fontWeight: 700, color: send.failed === 0 ? "#4ade80" : "#fbbf24" }}>
                        {send.failed === 0 ? "✅ All emails delivered" : `⚠️ Completed with ${send.failed} failure${send.failed !== 1 ? "s" : ""}`}
                      </span>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, marginBottom: 12, overflow: "hidden" }}>
                    <div style={{ display: "flex", height: "100%", borderRadius: 3, overflow: "hidden", transition: "width 0.3s" }}>
                      <div style={{ width: `${send.total > 0 ? (send.delivered / send.total) * 100 : 0}%`, background: "#4ade80", transition: "width 0.5s" }} />
                      <div style={{ width: `${send.total > 0 ? (send.failed / send.total) * 100 : 0}%`, background: "#f87171", transition: "width 0.5s" }} />
                    </div>
                  </div>

                  {/* Counters */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
                    {[
                      { label: "Total",     value: send.total,     color: "#888"    },
                      { label: "Queued",    value: send.queued,    color: "#60a5fa" },
                      { label: "Delivered", value: send.delivered, color: "#4ade80" },
                      { label: "Failed",    value: send.failed,    color: send.failed > 0 ? "#f87171" : "#555" },
                    ].map(c => (
                      <div key={c.label} style={{ textAlign: "center" as const, padding: "8px 6px", background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: c.color }}>{c.value}</div>
                        <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase" as const, letterSpacing: ".06em" }}>{c.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Progress text */}
                  <div style={{ fontSize: 11, color: "#555", marginBottom: 12 }}>
                    {send.phase === "sending"
                      ? `Processing ${send.delivered + send.failed} of ${send.total} — ${pct}% complete`
                      : `${pct}% complete · ${send.total} recipients`}
                  </div>

                  {/* Actions when done */}
                  {send.phase === "done" && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                      {send.retryable > 0 && (
                        <Button size="sm" onClick={retryFailed}>🔄 Retry {send.retryable} Transient Failure{send.retryable !== 1 ? "s" : ""}</Button>
                      )}
                      {send.details.length > 0 && (
                        <Button size="sm" variant="secondary" onClick={downloadCSV}>↓ Download Report CSV</Button>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => setSend(INITIAL_SEND)}>Send Another</Button>
                    </div>
                  )}

                  {/* Per-email detail log (scrollable, newest-last) */}
                  {send.details.length > 0 && (
                    <div style={{ marginTop: 12, maxHeight: 180, overflowY: "auto" as const, background: "#0a0a0a", borderRadius: 6, border: "1px solid rgba(255,255,255,0.05)", padding: "8px 10px" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#555", textTransform: "uppercase" as const, letterSpacing: ".07em", marginBottom: 6 }}>
                        Delivery Log ({send.details.length})
                      </div>
                      {[...send.details].reverse().map((d, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, fontSize: 11, marginBottom: 3, alignItems: "flex-start" }}>
                          <span style={{ flexShrink: 0, color: d.status === "delivered" ? "#4ade80" : d.status === "queued" ? "#60a5fa" : "#f87171" }}>
                            {d.status === "delivered" ? "✓" : d.status === "queued" ? "↻" : "✗"}
                          </span>
                          <span style={{ color: "#888", flexShrink: 0, minWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{d.email}</span>
                          {d.status !== "delivered" && d.error && (
                            <span style={{ color: "#555", fontSize: 10 }}>{d.error.slice(0, 70)}</span>
                          )}
                          {d.status === "queued" && (
                            <span style={{ color: "#60a5fa", fontSize: 10 }}>retrying (attempt {d.attempts})</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Failure details when done */}
                  {send.phase === "done" && send.failed > 0 && (
                    <div style={{ marginTop: 10, background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 6, padding: "10px 12px" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#f87171", marginBottom: 6 }}>Failed Recipients</div>
                      {send.details.filter(d => d.status === "failed").map((d, i) => (
                        <div key={i} style={{ fontSize: 11, color: "#888", marginBottom: 3 }}>
                          <span style={{ color: "#f87171" }}>{d.email}</span>
                          {d.code && <span style={{ color: "#555", marginLeft: 8, fontFamily: "monospace", fontSize: 10 }}>{d.code.replace(/_/g, " ")}</span>}
                          {d.is_permanent && <span style={{ color: "#ef4444", marginLeft: 6, fontSize: 10 }}>permanent</span>}
                          {!d.is_permanent && <span style={{ color: "#60a5fa", marginLeft: 6, fontSize: 10 }}>transient</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Push Notification Tab ─────────────────────────────────────────── */}
        {tab === "push" && (
          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 20 }}>
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

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <Label>Recipients</Label>
                <select style={S.select} value={pushFilter} onChange={e => setPushFilter(e.target.value as RecipientFilter)}>
                  {FILTERS.filter(f => f.value !== "pending").map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <Label>Notification Title *</Label>
                <input style={S.input} value={pushTitle} onChange={e => setPushTitle(e.target.value)} placeholder="Race Day Tomorrow! 🏃" maxLength={65} />
                <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>{pushTitle.length}/65 characters</div>
              </div>
              <div>
                <Label>Message Body *</Label>
                <textarea style={{ ...S.textarea, minHeight: 100 }} value={pushBody} onChange={e => setPushBody(e.target.value)} placeholder="Don't forget — your event is tomorrow…" maxLength={178} />
                <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>{pushBody.length}/178 characters</div>
              </div>
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
                <Button loading={pushSending} onClick={sendPush}>Send Push Notification</Button>
                {pushResult && <Badge color="green">✅ Sent to {pushResult.sent} users</Badge>}
              </div>
            </div>
          </div>
        )}

        {/* ── History Tab ───────────────────────────────────────────────────── */}
        {tab === "history" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {history.length === 0 ? (
              <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "4rem", textAlign: "center" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                <div style={{ fontWeight: 700, fontSize: 16, color: "#555" }}>No messages sent yet</div>
              </div>
            ) : history.map(h => {
              const isExpanded = expandedBatch === h.batch_id;
              const canExpand  = !!h.batch_id && (h.channel ?? "email") === "email";
              const pct        = h.recipients > 0 ? Math.round(((h.sent ?? 0) / h.recipients) * 100) : 0;

              // Filtered + searched emails for the detail panel
              const detailEmails = (batchDetail?.emails ?? []).filter(d => {
                const matchStatus = detailFilter === "all" || d.status === detailFilter;
                const matchSearch = !detailSearch || d.email.toLowerCase().includes(detailSearch.toLowerCase()) || (d.name ?? "").toLowerCase().includes(detailSearch.toLowerCase());
                return matchStatus && matchSearch;
              });

              return (
                <div key={h.id} style={{ background: "#111", border: `1px solid ${isExpanded ? "rgba(232,98,10,0.3)" : "rgba(255,255,255,0.07)"}`, borderRadius: 12, overflow: "hidden", transition: "border-color 0.2s" }}>
                  {/* Campaign row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", flexWrap: "wrap" as const }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "#fff", marginBottom: 2 }}>{h.subject}</div>
                      <div style={{ fontSize: 11, color: "#555" }}>
                        {new Date(h.sent_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {" · "}{h.recipient_filter ?? "all"}
                        {" · "}<span style={{ color: (h.channel ?? "email") === "push" ? "#a78bfa" : "#e8620a" }}>{(h.channel ?? "email").toUpperCase()}</span>
                      </div>
                    </div>

                    {/* Delivery stats mini-bar */}
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
                      <div style={{ textAlign: "center" as const }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#4ade80" }}>{h.sent ?? 0}</div>
                        <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase" as const }}>Delivered</div>
                      </div>
                      <div style={{ textAlign: "center" as const }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: (h.failed ?? 0) > 0 ? "#f87171" : "#555" }}>{h.failed ?? 0}</div>
                        <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase" as const }}>Failed</div>
                      </div>
                      <div style={{ textAlign: "center" as const }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#888" }}>{h.recipients ?? 0}</div>
                        <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase" as const }}>Total</div>
                      </div>
                      {h.recipients > 0 && (
                        <div style={{ width: 50, height: 50, position: "relative" as const }}>
                          <svg viewBox="0 0 36 36" style={{ transform: "rotate(-90deg)" }}>
                            <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                            <circle cx="18" cy="18" r="15.9" fill="none" stroke={pct === 100 ? "#4ade80" : pct > 80 ? "#fbbf24" : "#f87171"} strokeWidth="3"
                              strokeDasharray={`${pct} ${100 - pct}`} strokeLinecap="round" />
                          </svg>
                          <div style={{ position: "absolute" as const, inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#aaa" }}>{pct}%</div>
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                      <span style={{
                        padding: "3px 10px", borderRadius: 999, fontSize: 10, fontWeight: 700,
                        background: h.status === "queued" ? "rgba(96,165,250,0.12)" : h.status === "failed" ? "rgba(248,113,113,0.12)" : "rgba(74,222,128,0.1)",
                        color:      h.status === "queued" ? "#60a5fa"              : h.status === "failed" ? "#f87171"              : "#4ade80",
                      }}>
                        {h.status ?? "sent"}
                      </span>
                      {h.status === "queued" && h.batch_id && (
                        <button
                          onClick={() => resumeBatch(h.batch_id!)}
                          disabled={resumingBatch === h.batch_id}
                          style={{ padding: "5px 12px", background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.25)", borderRadius: 6, color: "#60a5fa", fontSize: 11, fontWeight: 700, cursor: resumingBatch === h.batch_id ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: resumingBatch === h.batch_id ? 0.6 : 1 }}>
                          {resumingBatch === h.batch_id ? "Starting…" : "▶ Resume"}
                        </button>
                      )}
                      {canExpand && (
                        <button onClick={() => toggleBatchDetail(h.batch_id)} style={{ padding: "5px 12px", background: isExpanded ? "rgba(232,98,10,0.15)" : "rgba(255,255,255,0.05)", border: `1px solid ${isExpanded ? "rgba(232,98,10,0.3)" : "rgba(255,255,255,0.1)"}`, borderRadius: 6, color: isExpanded ? "#e8620a" : "#888", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                          {isExpanded ? "▲ Hide" : "▼ Details"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Delivery detail panel */}
                  {isExpanded && (
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "14px 16px" }}>
                      {detailLoading ? (
                        <div style={{ fontSize: 12, color: "#555", padding: "20px 0", textAlign: "center" as const }}>Loading delivery data…</div>
                      ) : batchDetail ? (
                        <>
                          {/* Stats row */}
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 14 }}>
                            {[
                              { label: "Total",     v: batchDetail.total,     c: "#888"    },
                              { label: "Delivered", v: batchDetail.delivered, c: "#4ade80" },
                              { label: "Failed",    v: batchDetail.failed,    c: batchDetail.failed > 0 ? "#f87171" : "#555" },
                              { label: "Queued",    v: batchDetail.queued,    c: "#60a5fa" },
                              { label: "Retryable", v: batchDetail.retryable, c: batchDetail.retryable > 0 ? "#fbbf24" : "#555" },
                            ].map(s => (
                              <div key={s.label} style={{ textAlign: "center" as const, padding: "8px 4px", background: "rgba(255,255,255,0.02)", borderRadius: 6 }}>
                                <div style={{ fontSize: 20, fontWeight: 700, color: s.c }}>{s.v}</div>
                                <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase" as const }}>{s.label}</div>
                              </div>
                            ))}
                          </div>

                          {/* Actions */}
                          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" as const }}>
                            {batchDetail.retryable > 0 && (
                              <button onClick={() => retryBatchFailed(h.batch_id!)} style={{ padding: "6px 14px", background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 6, color: "#fbbf24", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                                🔄 Retry {batchDetail.retryable} Transient Failure{batchDetail.retryable !== 1 ? "s" : ""}
                              </button>
                            )}
                            <button onClick={() => downloadBatchCSV(h.batch_id!)} style={{ padding: "6px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#aaa", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                              ↓ Download CSV ({batchDetail.total} rows)
                            </button>
                          </div>

                          {/* Filter + search */}
                          <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" as const }}>
                            <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: 2 }}>
                              {["all","delivered","failed","queued"].map(f => (
                                <button key={f} onClick={() => setDetailFilter(f)} style={{ padding: "4px 10px", borderRadius: 5, border: "none", background: detailFilter === f ? "#e8620a" : "transparent", color: detailFilter === f ? "#fff" : "#666", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                                  {f === "all" ? `All (${batchDetail.total})` : f === "delivered" ? `✓ ${batchDetail.delivered}` : f === "failed" ? `✗ ${batchDetail.failed}` : `⏳ ${batchDetail.queued}`}
                                </button>
                              ))}
                            </div>
                            <input value={detailSearch} onChange={e => setDetailSearch(e.target.value)} placeholder="Search email or name…" style={{ padding: "5px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", fontSize: 11, outline: "none", fontFamily: "inherit", flex: 1, minWidth: 180 }} />
                          </div>

                          {/* Per-email table */}
                          <div style={{ maxHeight: 320, overflowY: "auto" as const, background: "#0a0a0a", borderRadius: 6, border: "1px solid rgba(255,255,255,0.05)" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                              <thead style={{ position: "sticky" as const, top: 0, background: "#0a0a0a", zIndex: 1 }}>
                                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                                  {["Status","Recipient","AWS Message ID","Error","Attempts","Sent At"].map(col => (
                                    <th key={col} style={{ padding: "8px 10px", textAlign: "left" as const, fontSize: 9, color: "#555", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".06em", whiteSpace: "nowrap" as const }}>{col}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {detailEmails.length === 0 ? (
                                  <tr><td colSpan={6} style={{ padding: "20px", textAlign: "center" as const, color: "#555" }}>No results</td></tr>
                                ) : detailEmails.slice(0, 200).map((d, i) => (
                                  <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.03)" }}>
                                    <td style={{ padding: "6px 10px", whiteSpace: "nowrap" as const }}>
                                      <span style={{ fontSize: 10, fontWeight: 700, color: d.status === "delivered" ? "#4ade80" : d.status === "queued" ? "#60a5fa" : "#f87171" }}>
                                        {d.status === "delivered" ? "✓ delivered" : d.status === "queued" ? "⏳ queued" : "✗ failed"}
                                        {d.is_permanent === true && <span style={{ color: "#ef4444", marginLeft: 4 }}>perm</span>}
                                      </span>
                                    </td>
                                    <td style={{ padding: "6px 10px" }}>
                                      <div style={{ color: "#fff" }}>{d.name || "—"}</div>
                                      <div style={{ color: "#555", fontSize: 10 }}>{d.email}</div>
                                    </td>
                                    <td style={{ padding: "6px 10px", color: "#555", fontFamily: "monospace", fontSize: 10 }}>{d.aws_message_id ? d.aws_message_id.slice(0, 20) + "…" : "—"}</td>
                                    <td style={{ padding: "6px 10px", color: "#666", maxWidth: 180, overflow: "hidden" as const, textOverflow: "ellipsis" as const, whiteSpace: "nowrap" as const }}>{d.error ?? "—"}</td>
                                    <td style={{ padding: "6px 10px", color: "#666", textAlign: "center" as const }}>{d.attempts}</td>
                                    <td style={{ padding: "6px 10px", color: "#555", whiteSpace: "nowrap" as const, fontSize: 10 }}>{d.sent_at ? new Date(d.sent_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {detailEmails.length > 200 && (
                              <div style={{ padding: "8px 10px", fontSize: 10, color: "#555", textAlign: "center" as const }}>Showing first 200 of {detailEmails.length} — download CSV for full list</div>
                            )}
                          </div>
                        </>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
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
