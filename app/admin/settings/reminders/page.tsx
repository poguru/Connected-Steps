"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, Button, Alert, Badge } from "@/components/ui/ds";

interface Setting { key: string; value: string; updated_at: string; }
interface ReminderLog {
  id:             string;
  user_email:     string;
  reminder_date:  string;
  sessions_count: number;
  channel:        string;
  status:         string;
  error_msg:      string | null;
  sent_at:        string;
}
interface Session { id: string; title: string; date: string; }

const CHANNEL_LABELS: Record<string, string> = {
  email:    "Email",
  whatsapp: "WhatsApp",
};

const TOGGLE_KEYS = [
  { key: "session_reminder_email_enabled",  label: "Email Reminders",    desc: "Send a personalised email to every active member the evening before each session, listing all sessions for that day." },
  { key: "session_reminder_wa_enabled",     label: "WhatsApp Reminders", desc: "Send a WhatsApp message via Meta Cloud API to members who have a verified phone number." },
] as const;

export default function RemindersSettingsPage() {
  const [settings,    setSettings]    = useState<Setting[]>([]);
  const [logs,        setLogs]        = useState<ReminderLog[]>([]);
  const [sessions,    setSessions]    = useState<Session[]>([]);
  const [saving,      setSaving]      = useState<Record<string, boolean>>({});
  const [saved,       setSaved]       = useState<Record<string, boolean>>({});
  const [loadErr,     setLoadErr]     = useState("");
  const [logsLoading, setLogsLoading] = useState(false);

  const [testSessionId, setTestSessionId] = useState("");
  const [testEmail,     setTestEmail]     = useState("");
  const [testPhone,     setTestPhone]     = useState("");
  const [testChannels,  setTestChannels]  = useState<string[]>(["email", "whatsapp"]);
  const [testResult,    setTestResult]    = useState<{ ok: boolean; report?: Record<string, { ok: boolean; error?: string }> } | null>(null);
  const [testLoading,   setTestLoading]   = useState(false);

  // Email pipeline diagnostic
  const [diagEmail,    setDiagEmail]    = useState("");
  const [diagLoading,  setDiagLoading]  = useState(false);
  const [diagResult,   setDiagResult]   = useState<{ ok: boolean; diagnosis: string; provider: string | null; message_id: string | null; error: string | null; env_check: Record<string, unknown> } | null>(null);

  async function runEmailDiag() {
    if (!diagEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(diagEmail)) return;
    setDiagLoading(true); setDiagResult(null);
    try {
      const r = await fetch("/api/admin/email-diagnostics", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: diagEmail }),
      });
      const d = await r.json();
      setDiagResult(d);
    } catch { setDiagResult({ ok: false, diagnosis: "Network error", provider: null, message_id: null, error: "Network error", env_check: {} }); }
    finally  { setDiagLoading(false); }
  }

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/admin/settings");
    if (!res.ok) { setLoadErr("Failed to load settings."); return; }
    const { settings: rows } = await res.json();
    setSettings(rows ?? []);
  }, []);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res  = await fetch("/api/admin/reminders/logs?limit=50");
      const data = await res.json();
      setLogs(data.logs ?? []);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  const loadSessions = useCallback(async () => {
    const res  = await fetch("/api/admin/sessions?limit=20");
    const data = await res.json();
    setSessions((data.data ?? []).slice(0, 20));
  }, []);

  useEffect(() => {
    loadSettings();
    loadLogs();
    loadSessions();
  }, [loadSettings, loadLogs, loadSessions]);

  function get(key: string) {
    return settings.find(s => s.key === key)?.value ?? "true";
  }

  async function toggle(key: string) {
    const current = get(key) !== "false";
    await save(key, current ? "false" : "true");
  }

  async function save(key: string, value: string) {
    setSaving(p => ({ ...p, [key]: true }));
    const res = await fetch("/api/admin/settings", {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ key, value }),
    });
    if (res.ok) {
      setSettings(p => p.map(s => s.key === key ? { ...s, value, updated_at: new Date().toISOString() } : s));
      setSaved(p => ({ ...p, [key]: true }));
      setTimeout(() => setSaved(p => ({ ...p, [key]: false })), 2000);
    }
    setSaving(p => ({ ...p, [key]: false }));
  }

  function toggleChannel(ch: string) {
    setTestChannels(prev =>
      prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]
    );
  }

  async function sendTest() {
    if (!testSessionId || !testEmail) return;
    setTestLoading(true);
    setTestResult(null);
    try {
      const res  = await fetch("/api/admin/reminders/test", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          session_id: testSessionId,
          test_email: testEmail,
          test_phone: testPhone || undefined,
          channels:   testChannels,
        }),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.ok) loadLogs();
    } finally {
      setTestLoading(false);
    }
  }

  const INPUT: React.CSSProperties = {
    padding: "9px 12px",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    color: "#fff",
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <div style={{ padding: "2rem", maxWidth: 680, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 4px", fontSize: "1.3rem", fontWeight: 700, color: "#fff" }}>
        Session Reminder Settings
      </h1>
      <p style={{ margin: "0 0 2rem", fontSize: 13, color: "#555" }}>
        Every evening at 6:00 PM IST, all active members receive a single reminder listing
        every session scheduled for the next day. No pre-registration required.
      </p>

      {loadErr && <Alert variant="error" style={{ marginBottom: "1rem" }}>{loadErr}</Alert>}

      {/* ── Channel toggles ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
        {TOGGLE_KEYS.map(({ key, label, desc }) => {
          const isOn = get(key) !== "false";
          return (
            <Card key={key} style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "#fff", marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 12, color: "#555" }}>{desc}</div>
              </div>
              <button
                onClick={() => toggle(key)}
                disabled={saving[key]}
                aria-label={isOn ? `Disable ${label}` : `Enable ${label}`}
                style={{
                  width: 48, height: 26, borderRadius: 999, border: "none", cursor: "pointer",
                  background: isOn ? "#e8620a" : "rgba(255,255,255,0.1)",
                  position: "relative", transition: "background 0.2s", flexShrink: 0,
                  opacity: saving[key] ? 0.5 : 1,
                }}
              >
                <span style={{
                  position: "absolute", top: 3, left: isOn ? 24 : 3,
                  width: 20, height: 20, borderRadius: "50%", background: "#fff",
                  transition: "left 0.2s",
                }} />
              </button>
              {saved[key] && <Badge color="green" size="sm">Saved</Badge>}
            </Card>
          );
        })}
      </div>

      {/* ── Schedule info ── */}
      <Card style={{ marginBottom: "1.5rem" }}>
        <div style={{ fontSize: 11, color: "#444", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
          Cron Schedule
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            ["Fires at",    "6:00 PM IST every day"],
            ["UTC time",    "12:30 UTC"],
            ["Recipients",  "All active Connected Steps members"],
            ["Dedup",       "One email + one WhatsApp per user per day"],
          ].map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize: 11, color: "#555", marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 13, color: "#ccc", fontWeight: 500 }}>{value}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 6, fontSize: 12, color: "#444", fontFamily: "monospace" }}>
          schedule: &quot;30 12 * * *&quot;
        </div>
      </Card>

      {/* ── Test reminder ── */}
      <Card style={{ marginBottom: "1.5rem" }}>
        <div style={{ fontSize: 11, color: "#444", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
          Send Test Reminder
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Session</div>
            <select value={testSessionId} onChange={e => setTestSessionId(e.target.value)} style={{ ...INPUT }}>
              <option value="">Select a session...</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  {s.title} &mdash; {new Date(s.date + "T12:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Test Email</div>
              <input
                type="email"
                placeholder="admin@example.com"
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
                style={INPUT}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Test Phone (WhatsApp)</div>
              <input
                type="tel"
                placeholder="91XXXXXXXXXX"
                value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
                style={INPUT}
              />
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>Channels</div>
            <div style={{ display: "flex", gap: 8 }}>
              {["email", "whatsapp"].map(ch => (
                <button
                  key={ch}
                  onClick={() => toggleChannel(ch)}
                  style={{
                    padding: "5px 12px", borderRadius: 6, border: "1px solid",
                    borderColor: testChannels.includes(ch) ? "#e8620a" : "rgba(255,255,255,0.1)",
                    background:  testChannels.includes(ch) ? "rgba(232,98,10,0.12)" : "transparent",
                    color:       testChannels.includes(ch) ? "#e8620a" : "#888",
                    fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {CHANNEL_LABELS[ch]}
                </button>
              ))}
            </div>
          </div>

          <Button
            loading={testLoading}
            onClick={sendTest}
            disabled={!testSessionId || !testEmail || testChannels.length === 0}
          >
            Send Test Reminder
          </Button>
        </div>

        {testResult && (
          <div style={{ marginTop: 14, padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: testResult.ok ? "#10b981" : "#f87171", marginBottom: 8 }}>
              {testResult.ok ? "Test sent" : "Test failed"}
            </div>
            {testResult.report && Object.entries(testResult.report).map(([ch, res]) => (
              <div key={ch} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "#888", width: 70 }}>{CHANNEL_LABELS[ch] ?? ch}</span>
                <Badge color={res.ok ? "green" : "red"} size="sm">{res.ok ? "OK" : "Failed"}</Badge>
                {!res.ok && res.error && (
                  <span style={{ fontSize: 11, color: "#f87171", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {res.error}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Reminder Logs ── */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "#444", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
            Recent Reminder Logs
          </div>
          <button
            onClick={loadLogs}
            style={{ fontSize: 11, color: "#e8620a", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
          >
            Refresh
          </button>
        </div>

        {logsLoading ? (
          <div style={{ color: "#555", fontSize: 13, padding: "20px 0", textAlign: "center" }}>Loading...</div>
        ) : logs.length === 0 ? (
          <div style={{ color: "#555", fontSize: 13, padding: "20px 0", textAlign: "center" }}>
            No reminders sent yet. They will appear here after the 6 PM cron runs.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  {["Email", "Date", "Sessions", "Channel", "Status", "Sent At"].map(h => (
                    <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: "#555", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "7px 10px", color: "#888", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {log.user_email}
                    </td>
                    <td style={{ padding: "7px 10px", color: "#ccc", whiteSpace: "nowrap" }}>
                      {new Date(log.reminder_date + "T12:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </td>
                    <td style={{ padding: "7px 10px", color: "#888", textAlign: "center" }}>
                      {log.sessions_count}
                    </td>
                    <td style={{ padding: "7px 10px", color: "#aaa" }}>
                      <Badge color={log.channel === "email" ? "blue" : "green"} size="sm">
                        {CHANNEL_LABELS[log.channel] ?? log.channel}
                      </Badge>
                    </td>
                    <td style={{ padding: "7px 10px" }}>
                      <Badge color={log.status === "sent" ? "green" : "red"} size="sm">
                        {log.status}
                      </Badge>
                      {log.error_msg && (
                        <span style={{ marginLeft: 6, color: "#f87171", fontSize: 10 }} title={log.error_msg}>
                          {log.error_msg.slice(0, 30)}{log.error_msg.length > 30 ? "..." : ""}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "7px 10px", color: "#555", whiteSpace: "nowrap" }}>
                      {new Date(log.sent_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Email Pipeline Diagnostic ──────────────────────────────────────── */}
      <Card style={{ marginTop: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 6 }}>📧 Email Delivery Diagnostic</div>
        <div style={{ fontSize: 12, color: "#555", marginBottom: 16 }}>
          Send a test email to verify the ZeptoMail delivery pipeline is working. Use your own email address to confirm receipt.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 240px" }}>
            <label style={{ fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>Recipient Email</label>
            <input
              type="email"
              value={diagEmail}
              onChange={e => setDiagEmail(e.target.value)}
              placeholder="you@example.com"
              style={{ width: "100%", padding: "8px 10px", background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#fff", fontFamily: "inherit", fontSize: 13, boxSizing: "border-box" }}
            />
          </div>
          <Button onClick={runEmailDiag} disabled={diagLoading || !diagEmail} style={{ flexShrink: 0 }}>
            {diagLoading ? "Sending…" : "Send Test Email"}
          </Button>
        </div>

        {diagResult && (
          <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 8,
            background: diagResult.ok ? "rgba(74,222,128,0.07)" : "rgba(239,68,68,0.07)",
            border: `1px solid ${diagResult.ok ? "rgba(74,222,128,0.25)" : "rgba(239,68,68,0.25)"}` }}>
            <div style={{ fontSize: 13, color: diagResult.ok ? "#4ade80" : "#f87171", fontWeight: 600, marginBottom: 8 }}>
              {diagResult.diagnosis}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "#555" }}>
              {diagResult.provider   && <span>Provider: {diagResult.provider}</span>}
              {diagResult.message_id && <span style={{ fontFamily: "monospace" }}>Message ID: {diagResult.message_id}</span>}
              {diagResult.env_check && Object.entries(diagResult.env_check).map(([k, v]) => (
                <span key={k}>{k}: <span style={{ color: v === true ? "#4ade80" : v === false ? "#f87171" : "#888" }}>{String(v)}</span></span>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
