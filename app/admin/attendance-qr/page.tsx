"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, Button, Input, Label, Alert, Badge, Spinner } from "@/components/ui/ds";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DistLog {
  id: string;
  recipient_email: string;
  recipient_name: string | null;
  status: "pending" | "sent" | "failed";
  sent_at: string;
  error_message: string | null;
}

interface QRRecord {
  id: string;
  date: string;
  location_id: string | null;
  generated_at: string;
  generated_by: string;
  expires_at: string;
  is_active: boolean;
  training_locations: { name: string } | null;
  daily_qr_distribution_log: DistLog[];
}

interface Recipient {
  id: string;
  name: string;
  email: string;
  location_ids: string[];
  is_active: boolean;
  created_at: string;
  created_by: string | null;
}

interface QRSettings {
  id?: string;
  location_id: string | null;
  generation_time: string;
  validity_minutes: number;
  auto_generate_enabled: boolean;
  auto_email_enabled: boolean;
  training_locations?: { id: string; name: string } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function isExpired(iso: string) {
  return new Date(iso) < new Date();
}

const S: Record<string, React.CSSProperties> = {
  input: {
    width: "100%", padding: "9px 12px", background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
    color: "#fff", fontSize: "0.85rem", outline: "none", fontFamily: "inherit",
    boxSizing: "border-box",
  },
};

function statusBadge(status: DistLog["status"]) {
  const map = { sent: "green", failed: "red", pending: "yellow" } as const;
  return <Badge color={map[status]} size="sm">{status}</Badge>;
}

// ── Tab: History ──────────────────────────────────────────────────────────────

function HistoryTab() {
  const [qrs,       setQRs]       = useState<QRRecord[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [generating, setGenerating] = useState(false);
  const [alert,     setAlert]     = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [expanded,  setExpanded]  = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/admin/attendance-qr");
      const data = await res.json();
      setQRs(data.qrs ?? []);
    } catch {
      // Keep the existing list in place on refresh failure.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function generate(sendEmail = true) {
    if (!confirm(`Generate ${sendEmail ? "and send QR email" : "QR only (no email)"} for today?`)) return;
    setGenerating(true);
    setAlert(null);
    try {
      const res = await fetch("/api/admin/attendance-qr/generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ send_email: sendEmail }),
      });

      // Separate JSON parsing from the response check so a non-JSON 500 body
      // (e.g. server crash before response is flushed) shows a clear message
      // instead of a raw "SyntaxError: Unexpected end of JSON input".
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any = {};
      try {
        data = await res.json();
      } catch {
        setAlert({ type: "error", msg: `Server error (HTTP ${res.status}) — no JSON response. Check server logs.` });
        return;
      }

      if (res.ok) {
        const sent = Number(data.emailsSent ?? 0);
        const sentMsg = sendEmail ? ` ${sent} email${sent !== 1 ? "s" : ""} sent.` : "";
        setAlert({ type: "success", msg: `QR generated!${sentMsg}` });
        await load();
      } else {
        setAlert({ type: "error", msg: String(data.error ?? `Generation failed (HTTP ${res.status})`) });
      }
    } catch (e) {
      setAlert({ type: "error", msg: e instanceof Error ? e.message : "Network error — check your connection." });
    } finally {
      setGenerating(false);
    }
  }

  function downloadQR(qr: QRRecord) {
    // Re-fetch the QR image from the generate endpoint by navigating to the scan URL
    // For now, we show the date. A real download would require storing the data URL.
    const url = `/api/admin/attendance-qr/download?id=${qr.id}`;
    window.open(url, "_blank");
  }

  if (loading) return <div style={{ padding: "2rem", textAlign: "center" }}><Spinner /></div>;

  return (
    <div>
      {alert && (
        <Alert variant={alert.type === "success" ? "success" : "error"} style={{ marginBottom: 16 }}>
          {alert.msg}
        </Alert>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <Button onClick={() => generate(true)} loading={generating} variant="primary">
          ⚡ Generate QR &amp; Send Emails
        </Button>
        <Button onClick={() => generate(false)} loading={generating} variant="outline">
          Generate QR Only
        </Button>
        <Button onClick={load} variant="ghost" size="sm">↻ Refresh</Button>
      </div>

      {qrs.length === 0 ? (
        <Card style={{ textAlign: "center", padding: "3rem", color: "rgba(255,255,255,0.4)" }}>
          No QR codes generated yet. Click &quot;Generate QR &amp; Send Emails&quot; to start.
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {qrs.map(qr => {
            const open  = expanded === qr.id;
            const exp   = isExpired(qr.expires_at);
            const sent  = qr.daily_qr_distribution_log.filter(l => l.status === "sent").length;
            const failed = qr.daily_qr_distribution_log.filter(l => l.status === "failed").length;

            return (
              <Card key={qr.id} style={{ padding: "1rem 1.25rem" }}>
                {/* Row header */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#fff" }}>
                      {fmtDate(qr.date)}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                      by {qr.generated_by} · {fmtDateTime(qr.generated_at)}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    {exp
                      ? <Badge color="red" size="sm">Expired</Badge>
                      : <Badge color="green" size="sm">Valid until {fmtDateTime(qr.expires_at)}</Badge>
                    }
                    {!qr.is_active && <Badge color="gray" size="sm">Superseded</Badge>}
                    {qr.training_locations && (
                      <Badge color="blue" size="sm">{qr.training_locations.name}</Badge>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {sent > 0 && <span style={{ fontSize: "0.78rem", color: "#4ade80" }}>✉ {sent} sent</span>}
                    {failed > 0 && <span style={{ fontSize: "0.78rem", color: "#f87171" }}>✗ {failed} failed</span>}
                    <Button size="xs" variant="ghost" onClick={() => setExpanded(open ? null : qr.id)}>
                      {open ? "▲ Hide" : "▼ Details"}
                    </Button>
                  </div>
                </div>

                {/* Expandable distribution log */}
                {open && (
                  <div style={{ marginTop: 14, borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 12 }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>
                      Email Distribution
                    </div>
                    {qr.daily_qr_distribution_log.length === 0 ? (
                      <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.35)" }}>No emails sent for this QR.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {qr.daily_qr_distribution_log.map(log => (
                          <div key={log.id} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: "0.8rem" }}>
                            {statusBadge(log.status)}
                            <span style={{ color: "#fff" }}>{log.recipient_name ?? log.recipient_email}</span>
                            <span style={{ color: "rgba(255,255,255,0.4)" }}>{log.recipient_email}</span>
                            <span style={{ color: "rgba(255,255,255,0.3)" }}>{fmtDateTime(log.sent_at)}</span>
                            {log.error_message && (
                              <span style={{ color: "#f87171", fontSize: "0.75rem" }}>{log.error_message}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Tab: Recipients ───────────────────────────────────────────────────────────

const BLANK_RECIPIENT = { name: "", email: "", is_active: true };

function RecipientsTab() {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [editId,     setEditId]     = useState<string | null>(null);
  const [form,       setForm]       = useState(BLANK_RECIPIENT);
  const [showAdd,    setShowAdd]    = useState(false);
  const [alert,      setAlert]      = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch("/api/admin/attendance-qr/recipients");
    const data = await res.json();
    setRecipients(data.recipients ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!form.name.trim() || !form.email.trim()) {
      setAlert({ type: "error", msg: "Name and email are required." });
      return;
    }
    setSaving(true);
    setAlert(null);
    try {
      const url    = editId ? `/api/admin/attendance-qr/recipients/${editId}` : "/api/admin/attendance-qr/recipients";
      const method = editId ? "PATCH" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        setAlert({ type: "success", msg: editId ? "Recipient updated." : "Recipient added." });
        setForm(BLANK_RECIPIENT);
        setEditId(null);
        setShowAdd(false);
        await load();
      } else {
        setAlert({ type: "error", msg: data.error ?? "Failed to save" });
      }
    } catch (e) {
      setAlert({ type: "error", msg: String(e) });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(r: Recipient) {
    await fetch(`/api/admin/attendance-qr/recipients/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !r.is_active }),
    });
    await load();
  }

  async function remove(r: Recipient) {
    if (!confirm(`Remove ${r.name} (${r.email}) from recipients?`)) return;
    await fetch(`/api/admin/attendance-qr/recipients/${r.id}`, { method: "DELETE" });
    await load();
  }

  function startEdit(r: Recipient) {
    setEditId(r.id);
    setForm({ name: r.name, email: r.email, is_active: r.is_active });
    setShowAdd(true);
    setAlert(null);
  }

  function cancelEdit() {
    setEditId(null);
    setForm(BLANK_RECIPIENT);
    setShowAdd(false);
    setAlert(null);
  }

  if (loading) return <div style={{ padding: "2rem", textAlign: "center" }}><Spinner /></div>;

  return (
    <div>
      {alert && (
        <Alert variant={alert.type === "success" ? "success" : "error"} style={{ marginBottom: 16 }}>
          {alert.msg}
        </Alert>
      )}

      {!showAdd && (
        <div style={{ marginBottom: 16 }}>
          <Button onClick={() => { setShowAdd(true); setEditId(null); setForm(BLANK_RECIPIENT); }} variant="primary">
            + Add Recipient
          </Button>
        </div>
      )}

      {showAdd && (
        <Card style={{ padding: "1.25rem", marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 14, fontSize: "0.9rem" }}>
            {editId ? "Edit Recipient" : "New Recipient"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <Label style={{ marginBottom: 5 }}>Name *</Label>
              <input style={S.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Trainer name" />
            </div>
            <div>
              <Label style={{ marginBottom: 5 }}>Email *</Label>
              <input style={S.input} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="trainer@example.com" />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <input type="checkbox" id="recip-active" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
            <label htmlFor="recip-active" style={{ fontSize: "0.85rem", cursor: "pointer" }}>Active (receives emails)</label>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <Button onClick={save} loading={saving} variant="primary">{editId ? "Save Changes" : "Add Recipient"}</Button>
            <Button onClick={cancelEdit} variant="ghost">Cancel</Button>
          </div>
        </Card>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {recipients.length === 0 ? (
          <Card style={{ textAlign: "center", padding: "2rem", color: "rgba(255,255,255,0.4)" }}>
            No recipients configured yet.
          </Card>
        ) : recipients.map(r => (
          <Card key={r.id} style={{ padding: "0.875rem 1.25rem", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", opacity: r.is_active ? 1 : 0.5 }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "#fff" }}>{r.name}</div>
              <div style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.45)" }}>{r.email}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Badge color={r.is_active ? "green" : "gray"} size="sm">{r.is_active ? "Active" : "Disabled"}</Badge>
              <Button size="xs" variant="ghost" onClick={() => toggleActive(r)}>
                {r.is_active ? "Disable" : "Enable"}
              </Button>
              <Button size="xs" variant="ghost" onClick={() => startEdit(r)}>Edit</Button>
              <Button size="xs" variant="ghost" onClick={() => remove(r)} style={{ color: "#f87171" }}>Remove</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Health ───────────────────────────────────────────────────────────────

interface RunLog {
  id: string;
  execution_date: string;
  triggered_by: "cron" | "manual";
  started_at: string;
  finished_at: string | null;
  status: "running" | "success" | "partial" | "failed" | "skipped";
  emails_sent: number;
  emails_failed: number;
  error_message: string | null;
}

interface HealthData {
  health: "healthy" | "degraded" | "critical" | "unknown";
  today: { date: string; hasQR: boolean; qrId: string | null; generatedAt: string | null; expiresAt: string | null };
  recipients: { activeCount: number };
  runs: RunLog[];
  lastRun: { at: string; status: string; emailsSent: number; emailsFailed: number; triggeredBy: string } | null;
  lastSuccess: { at: string; emailsSent: number; triggeredBy: string } | null;
  lastFailure: { at: string; status: string; emailsFailed: number; errorMessage: string | null; triggeredBy: string } | null;
}

const HEALTH_COLOR: Record<string, string> = {
  healthy:  "#22c55e",
  degraded: "#f59e0b",
  critical: "#ef4444",
  unknown:  "rgba(255,255,255,0.3)",
};

const HEALTH_LABEL: Record<string, string> = {
  healthy:  "Healthy",
  degraded: "Degraded — some emails failed",
  critical: "Critical — automation failed",
  unknown:  "Unknown — no run history",
};

const RUN_STATUS_COLOR: Record<string, string> = {
  success: "#22c55e",
  partial: "#f59e0b",
  failed:  "#ef4444",
  skipped: "rgba(255,255,255,0.3)",
  running: "#60a5fa",
};

function HealthTab() {
  const [data,    setData]    = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [alert,    setAlert]  = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/attendance-qr/health");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function retryToday() {
    if (!confirm("Retry QR generation and email for today? This will create a new QR and attempt to send emails.")) return;
    setRetrying(true);
    setAlert(null);
    try {
      const res = await fetch("/api/admin/attendance-qr/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ send_email: true }),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let body: any = {};
      try { body = await res.json(); } catch { /* non-JSON */ }
      if (res.ok) {
        const sent = Number(body.emailsSent ?? 0);
        setAlert({ type: "success", msg: `QR generated. ${sent} email${sent !== 1 ? "s" : ""} sent.` });
        await load();
      } else {
        setAlert({ type: "error", msg: String(body.error ?? `Failed (HTTP ${res.status})`) });
      }
    } catch (e) {
      setAlert({ type: "error", msg: e instanceof Error ? e.message : "Network error." });
    } finally {
      setRetrying(false);
    }
  }

  if (loading) return <div style={{ padding: "2rem", textAlign: "center" }}><Spinner /></div>;
  if (!data)   return <div style={{ padding: "2rem", color: "#f87171" }}>Failed to load health status.</div>;

  const { health, today, recipients, runs, lastSuccess, lastFailure } = data;
  const healthColor = HEALTH_COLOR[health];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {alert && (
        <Alert variant={alert.type === "success" ? "success" : "error"} style={{ marginBottom: 4 }}>
          {alert.msg}
        </Alert>
      )}

      {/* Status summary */}
      <Card style={{ padding: "1.25rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 14, height: 14, borderRadius: "50%",
              background: healthColor,
              boxShadow: `0 0 8px ${healthColor}`,
              flexShrink: 0,
            }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.95rem", color: healthColor }}>
                {HEALTH_LABEL[health]}
              </div>
              <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                Automation status as of right now
              </div>
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <Button size="sm" variant="ghost" onClick={load}>↻ Refresh</Button>
            {(health === "critical" || health === "degraded") && (
              <Button size="sm" variant="primary" loading={retrying} onClick={retryToday}>
                ⚡ Retry Today
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Key metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
        {/* Today's QR */}
        <Card style={{ padding: "1rem" }}>
          <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Today&apos;s QR</div>
          {today.hasQR ? (
            <>
              <div style={{ fontWeight: 700, color: "#22c55e", fontSize: "0.9rem" }}>Generated</div>
              {today.generatedAt && (
                <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.45)", marginTop: 3 }}>
                  at {fmtDateTime(today.generatedAt)}
                </div>
              )}
              {today.expiresAt && (
                <div style={{ fontSize: "0.72rem", color: isExpired(today.expiresAt) ? "#f87171" : "rgba(255,255,255,0.35)", marginTop: 2 }}>
                  {isExpired(today.expiresAt) ? "Expired" : `Expires ${fmtDateTime(today.expiresAt)}`}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontWeight: 700, color: "#ef4444", fontSize: "0.9rem" }}>Missing</div>
          )}
        </Card>

        {/* Recipients */}
        <Card style={{ padding: "1rem" }}>
          <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Recipients</div>
          <div style={{ fontWeight: 700, fontSize: "1.4rem", color: "#fff" }}>{recipients.activeCount}</div>
          <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.35)", marginTop: 2 }}>active</div>
        </Card>

        {/* Last success */}
        <Card style={{ padding: "1rem" }}>
          <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Last Success</div>
          {lastSuccess ? (
            <>
              <div style={{ fontWeight: 700, color: "#22c55e", fontSize: "0.85rem" }}>{lastSuccess.emailsSent} sent</div>
              <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", marginTop: 3 }}>
                {fmtDateTime(lastSuccess.at)}
              </div>
              <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
                via {lastSuccess.triggeredBy}
              </div>
            </>
          ) : (
            <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.3)" }}>No successful runs yet</div>
          )}
        </Card>

        {/* Last failure */}
        <Card style={{ padding: "1rem" }}>
          <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Last Failure</div>
          {lastFailure ? (
            <>
              <div style={{ fontWeight: 700, color: "#ef4444", fontSize: "0.85rem" }}>{lastFailure.emailsFailed} failed</div>
              <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", marginTop: 3 }}>
                {fmtDateTime(lastFailure.at)}
              </div>
              {lastFailure.errorMessage && (
                <div style={{ fontSize: "0.7rem", color: "#f87171", marginTop: 4, fontFamily: "monospace", wordBreak: "break-word" }}>
                  {lastFailure.errorMessage.slice(0, 80)}{lastFailure.errorMessage.length > 80 ? "…" : ""}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: "0.8rem", color: "#22c55e" }}>No failures</div>
          )}
        </Card>
      </div>

      {/* Run history */}
      <Card style={{ padding: "1.25rem" }}>
        <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: 12 }}>Execution History (last 14 runs)</div>
        {runs.length === 0 ? (
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.85rem" }}>
            No runs recorded yet. History appears here after the first automated or manual run.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  {["Date", "Trigger", "Status", "Sent", "Failed", "Started", "Duration"].map(h => (
                    <th key={h} style={{ padding: "5px 10px 8px 0", textAlign: "left", fontWeight: 600, color: "rgba(255,255,255,0.4)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: ".05em", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map(r => {
                  const color = RUN_STATUS_COLOR[r.status] ?? "rgba(255,255,255,0.5)";
                  const durationMs = r.finished_at
                    ? new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()
                    : null;
                  const duration = durationMs !== null
                    ? durationMs < 60000 ? `${(durationMs / 1000).toFixed(1)}s` : `${(durationMs / 60000).toFixed(1)}m`
                    : "—";
                  return (
                    <tr key={r.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "7px 10px 7px 0", color: "#fff", whiteSpace: "nowrap" }}>
                        {fmtDate(r.execution_date)}
                      </td>
                      <td style={{ padding: "7px 10px 7px 0", color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap" }}>
                        {r.triggered_by}
                      </td>
                      <td style={{ padding: "7px 10px 7px 0", whiteSpace: "nowrap" }}>
                        <span style={{ color, fontWeight: 600 }}>{r.status}</span>
                        {r.error_message && (
                          <div style={{ color: "#f87171", fontSize: "0.7rem", maxWidth: 200, wordBreak: "break-word" }}>
                            {r.error_message.slice(0, 60)}{r.error_message.length > 60 ? "…" : ""}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "7px 10px 7px 0", color: r.emails_sent > 0 ? "#4ade80" : "rgba(255,255,255,0.3)", fontVariantNumeric: "tabular-nums" }}>
                        {r.emails_sent}
                      </td>
                      <td style={{ padding: "7px 10px 7px 0", color: r.emails_failed > 0 ? "#f87171" : "rgba(255,255,255,0.3)", fontVariantNumeric: "tabular-nums" }}>
                        {r.emails_failed}
                      </td>
                      <td style={{ padding: "7px 10px 7px 0", color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>
                        {fmtDateTime(r.started_at)}
                      </td>
                      <td style={{ padding: "7px 0 7px 0", color: "rgba(255,255,255,0.35)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                        {duration}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Tab: Settings ─────────────────────────────────────────────────────────────

function SettingsTab() {
  const [settings, setSettings] = useState<QRSettings | null>(null);
  const [form,     setForm]     = useState({
    generation_time:       "05:00",
    validity_minutes:      180,
    auto_generate_enabled: true,
    auto_email_enabled:    true,
  });
  const [saving,  setSaving]  = useState(false);
  const [loading, setLoading] = useState(true);
  const [alert,   setAlert]   = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/attendance-qr/settings")
      .then(r => r.json())
      .then(d => {
        const global = (d.settings ?? []).find((s: QRSettings) => s.location_id === null);
        if (global) {
          setSettings(global);
          setForm({
            generation_time:       global.generation_time,
            validity_minutes:      global.validity_minutes,
            auto_generate_enabled: global.auto_generate_enabled,
            auto_email_enabled:    global.auto_email_enabled,
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function save() {
    if (!/^\d{2}:\d{2}$/.test(form.generation_time)) {
      setAlert({ type: "error", msg: "Generation time must be in HH:MM format (e.g. 05:00)" });
      return;
    }
    if (form.validity_minutes < 30 || form.validity_minutes > 480) {
      setAlert({ type: "error", msg: "Validity must be between 30 and 480 minutes." });
      return;
    }
    setSaving(true);
    setAlert(null);
    const res  = await fetch("/api/admin/attendance-qr/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location_id: null, ...form }),
    });
    const data = await res.json();
    if (res.ok) {
      setSettings(data.settings);
      setAlert({ type: "success", msg: "Settings saved." });
    } else {
      setAlert({ type: "error", msg: data.error ?? "Failed to save" });
    }
    setSaving(false);
  }

  if (loading) return <div style={{ padding: "2rem", textAlign: "center" }}><Spinner /></div>;

  const validityHours = (form.validity_minutes / 60).toFixed(1);

  return (
    <div style={{ maxWidth: 520 }}>
      {alert && (
        <Alert variant={alert.type === "success" ? "success" : "error"} style={{ marginBottom: 16 }}>
          {alert.msg}
        </Alert>
      )}

      <Card style={{ padding: "1.5rem" }}>
        <div style={{ fontWeight: 700, marginBottom: 20, fontSize: "0.95rem" }}>Global QR Settings</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <Label style={{ marginBottom: 6 }}>QR Generation Time (IST, HH:MM)</Label>
            <input
              style={S.input}
              type="time"
              value={form.generation_time}
              onChange={e => setForm(f => ({ ...f, generation_time: e.target.value }))}
            />
            <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
              Configurable between 04:00 and 07:59 IST (cron fires hourly in this window).
            </div>
          </div>

          <div>
            <Label style={{ marginBottom: 6 }}>QR Validity — {validityHours} hours ({form.validity_minutes} min)</Label>
            <input
              style={S.input}
              type="number"
              min={30} max={480} step={15}
              value={form.validity_minutes}
              onChange={e => setForm(f => ({ ...f, validity_minutes: Number(e.target.value) }))}
            />
            <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
              Minutes the QR stays valid after generation (30–480). Default: 180 (3 hours).
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={form.auto_generate_enabled}
                onChange={e => setForm(f => ({ ...f, auto_generate_enabled: e.target.checked }))}
              />
              <div>
                <div style={{ fontSize: "0.875rem", fontWeight: 600 }}>Enable automatic QR generation</div>
                <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" }}>Cron generates a new QR daily at the configured time.</div>
              </div>
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={form.auto_email_enabled}
                onChange={e => setForm(f => ({ ...f, auto_email_enabled: e.target.checked }))}
              />
              <div>
                <div style={{ fontSize: "0.875rem", fontWeight: 600 }}>Enable automatic email distribution</div>
                <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" }}>Send QR to all active recipients after generation.</div>
              </div>
            </label>
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <Button onClick={save} loading={saving} variant="primary">Save Settings</Button>
        </div>
      </Card>

      <Card style={{ padding: "1.25rem", marginTop: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10, fontSize: "0.85rem" }}>How it works</div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.8rem", color: "rgba(255,255,255,0.55)", lineHeight: 1.8 }}>
          <li>A cron job fires hourly between 4:00 AM and 8:00 AM IST.</li>
          <li>When the current time reaches the configured generation time, a new QR is created.</li>
          <li>The QR is immediately emailed to all active recipients.</li>
          <li>Participants scan the QR using the Connected Steps app.</li>
          <li>Each QR automatically expires after the configured validity period.</li>
          <li>Expired QRs show: <em>"Attendance QR has expired. Please use today&apos;s latest QR."</em></li>
          <li>Admins can regenerate manually at any time from the History tab.</li>
        </ul>
      </Card>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = "health" | "history" | "recipients" | "settings";

export default function AttendanceQRPage() {
  const [tab, setTab] = useState<Tab>("health");

  const tabs: { key: Tab; label: string }[] = [
    { key: "health",     label: "Health" },
    { key: "history",    label: "QR History" },
    { key: "recipients", label: "Recipients" },
    { key: "settings",   label: "Settings" },
  ];

  return (
    <div style={{ padding: "1.5rem", maxWidth: 800, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800 }}>Daily Attendance QR</h1>
        <p style={{ margin: "6px 0 0", fontSize: "0.82rem", color: "rgba(255,255,255,0.45)" }}>
          Auto-generates a secure QR every morning and emails it to configured trainers.
        </p>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.1)", flexWrap: "wrap" }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: "8px 16px", background: "none", border: "none", cursor: "pointer",
              fontSize: "0.875rem", fontFamily: "inherit", fontWeight: tab === t.key ? 700 : 400,
              color: tab === t.key ? "#e8620a" : "rgba(255,255,255,0.55)",
              borderBottom: `2px solid ${tab === t.key ? "#e8620a" : "transparent"}`,
              marginBottom: -1, transition: "all .15s",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "health"     && <HealthTab />}
      {tab === "history"    && <HistoryTab />}
      {tab === "recipients" && <RecipientsTab />}
      {tab === "settings"   && <SettingsTab />}
    </div>
  );
}
