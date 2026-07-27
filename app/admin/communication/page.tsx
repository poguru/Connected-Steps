"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────────

interface CommStats {
  email: {
    total_30d: number; delivered_30d: number; opened_30d: number; clicked_30d: number;
    failed_30d: number; bounced_30d: number; sent_24h: number; failed_24h: number;
    delivery_rate: number | null; open_rate: number | null; click_rate: number | null;
    failure_rate: number | null;
    queue: { queued: number; sending: number; failed: number };
  };
  whatsapp: {
    total_30d: number; sent_30d: number; delivered_30d: number; read_30d: number;
    failed_30d: number; failed_24h: number; delivery_rate: number | null;
  };
  campaigns: { total_30d: number; email: number; whatsapp: number; scheduled: number };
  system:    { pending_jobs: number; dead_jobs: number };
  as_of:     string;
}

interface Campaign {
  id: string; event_id: string; event_title: string | null; event_slug: string | null;
  channel: string; status: string; subject: string | null; message: string | null;
  recipient_filter: string | null; recipient_count: number | null;
  delivered_count: number | null; failed_count: number | null; opened_count: number | null;
  batch_id: string | null; sent_at: string | null; scheduled_for: string | null;
}

interface Template {
  id: string; name: string; subject: string; description: string | null;
  status: string; created_at: string; created_by: string | null;
}

interface CommTimelineItem {
  type: "email" | "whatsapp"; id: string; channel: string; subject: string | null;
  status: string; sent_at: string | null; delivered_at: string | null;
  opened_at: string | null; clicked_at: string | null; bounce_type: string | null;
  bounce_reason: string | null; batch_id: string | null; event_id: string | null;
  meta?: { template_name: string; message_id: string; phone: string };
}

interface ParticipantComms {
  email: string; phones: string[]; total: number; timeline: CommTimelineItem[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {};

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

function pct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n}%`;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function rateColor(n: number | null | undefined): string {
  if (n == null) return "#666";
  if (n >= 70) return "#4ade80";
  if (n >= 40) return "#fb923c";
  return "#f87171";
}

function statusBadge(status: string): React.CSSProperties {
  const map: Record<string, string> = {
    sent: "#4ade80", delivered: "#4ade80", read: "#4ade80", opened: "#4ade80",
    failed: "#f87171", bounced: "#f87171", dead: "#f87171",
    queued: "#fb923c", sending: "#fb923c", scheduled: "#60a5fa",
    draft: "#888", archived: "#555", active: "#4ade80",
    cancelled: "#666",
  };
  return {
    display: "inline-block", padding: "2px 8px", borderRadius: 999,
    fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
    background: `${map[status] ?? "#666"}22`,
    color: map[status] ?? "#666",
    textTransform: "uppercase" as const,
  };
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div style={{ background: "#111", border: `1px solid ${highlight ? "rgba(232,98,10,0.3)" : "rgba(255,255,255,0.07)"}`, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: highlight ? "#e8620a" : "#f0f0f0", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, color: "#e8620a", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12, marginTop: 8 }}>{children}</div>;
}

// ── Overview tab ───────────────────────────────────────────────────────────────

function OverviewTab({ stats, loading }: { stats: CommStats | null; loading: boolean }) {
  if (loading) return <div style={{ color: "#444", fontSize: 13, padding: "40px 0", textAlign: "center" }}>Loading stats…</div>;
  if (!stats) return <div style={{ color: "#f87171", fontSize: 13, padding: "40px 0", textAlign: "center" }}>Failed to load stats</div>;

  const { email, whatsapp, campaigns, system } = stats;

  const alerts: { msg: string; sev: "warn" | "err" }[] = [];
  if (system.dead_jobs > 0)       alerts.push({ msg: `${system.dead_jobs} dead job(s) in queue — needs attention`, sev: "err" });
  if (email.queue.failed > 10)    alerts.push({ msg: `${email.queue.failed} emails stuck in failed state`, sev: "err" });
  if (email.failed_24h > 5)       alerts.push({ msg: `${email.failed_24h} emails failed in the last 24 hours`, sev: "warn" });
  if (whatsapp.failed_24h > 5)    alerts.push({ msg: `${whatsapp.failed_24h} WhatsApp messages failed in last 24 hours`, sev: "warn" });
  if (system.pending_jobs > 200)  alerts.push({ msg: `Job queue backlog: ${system.pending_jobs} pending jobs`, sev: "warn" });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Alerts */}
      {alerts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {alerts.map((a, i) => (
            <div key={i} style={{ padding: "10px 14px", borderRadius: 8, background: a.sev === "err" ? "rgba(248,113,113,0.08)" : "rgba(251,146,60,0.08)", border: `1px solid ${a.sev === "err" ? "rgba(248,113,113,0.2)" : "rgba(251,146,60,0.2)"}`, color: a.sev === "err" ? "#f87171" : "#fb923c", fontSize: 12 }}>
              {a.sev === "err" ? "⚠" : "⚡"} {a.msg}
            </div>
          ))}
        </div>
      )}

      {/* Email stats */}
      <div>
        <SectionHead>Email — Last 30 Days</SectionHead>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10 }}>
          <StatCard label="Sent"      value={fmt(email.total_30d)} />
          <StatCard label="Delivered" value={fmt(email.delivered_30d)} sub={pct(email.delivery_rate)} />
          <StatCard label="Opened"    value={fmt(email.opened_30d)}   sub={pct(email.open_rate)} />
          <StatCard label="Clicked"   value={fmt(email.clicked_30d)}  sub={pct(email.click_rate)} />
          <StatCard label="Failed"    value={fmt(email.failed_30d)}   highlight={email.failed_30d > 10} />
          <StatCard label="Bounced"   value={fmt(email.bounced_30d)} />
        </div>
      </div>

      {/* Email queue */}
      <div>
        <SectionHead>Email Queue (Live)</SectionHead>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10 }}>
          <StatCard label="Queued"  value={fmt(email.queue.queued)} />
          <StatCard label="Sending" value={fmt(email.queue.sending)} />
          <StatCard label="Failed"  value={fmt(email.queue.failed)} highlight={email.queue.failed > 0} />
          <StatCard label="Sent 24h" value={fmt(email.sent_24h)} sub={`${email.failed_24h} failed`} />
        </div>
      </div>

      {/* WhatsApp stats */}
      <div>
        <SectionHead>WhatsApp — Last 30 Days</SectionHead>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10 }}>
          <StatCard label="Total"     value={fmt(whatsapp.total_30d)} />
          <StatCard label="Sent"      value={fmt(whatsapp.sent_30d)} />
          <StatCard label="Delivered" value={fmt(whatsapp.delivered_30d)} sub={pct(whatsapp.delivery_rate)} />
          <StatCard label="Read"      value={fmt(whatsapp.read_30d)} />
          <StatCard label="Failed"    value={fmt(whatsapp.failed_30d)} highlight={whatsapp.failed_30d > 10} />
        </div>
      </div>

      {/* Campaigns + system */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <SectionHead>Campaigns (30d)</SectionHead>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: "Total",     value: campaigns.total_30d },
              { label: "Email",     value: campaigns.email },
              { label: "WhatsApp",  value: campaigns.whatsapp },
              { label: "Scheduled", value: campaigns.scheduled },
            ].map(r => (
              <div key={r.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#888", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <span>{r.label}</span>
                <span style={{ color: "#ddd", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <SectionHead>System Health</SectionHead>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: "Pending Jobs", value: system.pending_jobs, warn: system.pending_jobs > 100 },
              { label: "Dead Jobs",    value: system.dead_jobs,    warn: system.dead_jobs > 0 },
            ].map(r => (
              <div key={r.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#888", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <span>{r.label}</span>
                <span style={{ color: r.warn ? "#f87171" : "#ddd", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{r.value}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, fontSize: 11, color: "#444" }}>
            Last updated: {fmtDate(stats.as_of)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── History tab ────────────────────────────────────────────────────────────────

function HistoryTab({ campaigns, loading }: { campaigns: Campaign[]; loading: boolean }) {
  if (loading) return <div style={{ color: "#444", fontSize: 13, padding: "40px 0", textAlign: "center" }}>Loading campaigns…</div>;

  if (!campaigns.length) return <div style={{ color: "#444", fontSize: 13, padding: "40px 0", textAlign: "center" }}>No campaigns found</div>;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            {["Event", "Channel", "Subject / Purpose", "Audience", "Sent At", "Delivered", "Failed", "Status"].map(h => (
              <th key={h} style={{ padding: "8px 10px", color: "#555", fontWeight: 600, textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {campaigns.map(c => (
            <tr key={c.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <td style={{ padding: "10px 10px", color: "#ccc", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.event_slug ? (
                  <Link href={`/admin/events/${c.event_id}/communicate`} style={{ color: "#e8620a", textDecoration: "none" }}>
                    {c.event_title ?? c.event_id}
                  </Link>
                ) : (c.event_title ?? "—")}
              </td>
              <td style={{ padding: "10px 10px" }}>
                <span style={{ ...statusBadge(c.channel === "email" ? "delivered" : "scheduled"), textTransform: "none" as const }}>
                  {c.channel === "email" ? "📧" : c.channel === "whatsapp" ? "💬" : c.channel === "push" ? "🔔" : "📨"} {c.channel}
                </span>
              </td>
              <td style={{ padding: "10px 10px", color: "#bbb", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.subject ?? c.message ?? "—"}
              </td>
              <td style={{ padding: "10px 10px", color: "#777", whiteSpace: "nowrap" }}>
                {c.recipient_filter ?? "all"}{c.recipient_count != null ? ` (${c.recipient_count})` : ""}
              </td>
              <td style={{ padding: "10px 10px", color: "#666", whiteSpace: "nowrap" }}>{fmtDate(c.sent_at ?? c.scheduled_for)}</td>
              <td style={{ padding: "10px 10px", color: "#4ade80", fontVariantNumeric: "tabular-nums" }}>{fmt(c.delivered_count)}</td>
              <td style={{ padding: "10px 10px", color: c.failed_count ? "#f87171" : "#555", fontVariantNumeric: "tabular-nums" }}>{fmt(c.failed_count)}</td>
              <td style={{ padding: "10px 10px" }}><span style={statusBadge(c.status)}>{c.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Templates tab ──────────────────────────────────────────────────────────────

function TemplatesTab() {
  const [templates, setTemplates]       = useState<Template[]>([]);
  const [loading,   setLoading]         = useState(true);
  const [filter,    setFilter]          = useState<"" | "draft" | "active" | "archived">("");
  const [toast,     setToast]           = useState<string | null>(null);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  const load = useCallback(async () => {
    setLoading(true);
    const url = filter ? `/api/admin/comm-templates?status=${filter}` : "/api/admin/comm-templates";
    const res = await fetch(url);
    const data = await res.json();
    setTemplates(data.templates ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function archive(id: string) {
    const res = await fetch(`/api/admin/comm-templates/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "archive" }),
    });
    if (res.ok) { showToast("Template archived"); load(); }
    else showToast("Failed to archive");
  }

  async function activate(id: string) {
    const res = await fetch(`/api/admin/comm-templates/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "activate" }),
    });
    if (res.ok) { showToast("Template activated"); load(); }
    else showToast("Failed to activate");
  }

  async function duplicate(id: string) {
    const res = await fetch(`/api/admin/comm-templates/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "duplicate" }),
    });
    if (res.ok) { showToast("Template duplicated"); load(); }
    else showToast("Failed to duplicate");
  }

  async function del(id: string, name: string) {
    if (!confirm(`Delete template "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/comm-templates/${id}`, { method: "DELETE" });
    if (res.ok) { showToast("Template deleted"); load(); }
    else showToast("Failed to delete");
  }

  const FILTERS = [
    { label: "All",      val: "" },
    { label: "Active",   val: "active" },
    { label: "Draft",    val: "draft" },
    { label: "Archived", val: "archived" },
  ] as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 999, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "10px 16px", fontSize: 13, color: "#ddd" }}>
          {toast}
        </div>
      )}

      {/* Filters + new button */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {FILTERS.map(f => (
            <button key={f.val} onClick={() => setFilter(f.val as typeof filter)}
              style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                background: filter === f.val ? "rgba(232,98,10,0.12)" : "transparent",
                borderColor: filter === f.val ? "#e8620a" : "rgba(255,255,255,0.12)",
                color: filter === f.val ? "#e8620a" : "#888" }}>
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
      </div>

      {loading ? (
        <div style={{ color: "#444", fontSize: 13, padding: "40px 0", textAlign: "center" }}>Loading templates…</div>
      ) : templates.length === 0 ? (
        <div style={{ color: "#444", fontSize: 13, padding: "40px 0", textAlign: "center" }}>No templates found</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {templates.map(t => (
            <div key={t.id} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#f0f0f0" }}>{t.name}</span>
                  <span style={statusBadge(t.status)}>{t.status}</span>
                </div>
                {t.subject && <div style={{ fontSize: 11, color: "#777", marginTop: 3 }}>Subject: {t.subject}</div>}
                {t.description && <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>{t.description}</div>}
                <div style={{ fontSize: 10, color: "#444", marginTop: 6 }}>Created {fmtDate(t.created_at)}</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
                <button onClick={() => duplicate(t.id)}
                  style={{ padding: "4px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, fontSize: 11, color: "#888", cursor: "pointer", fontFamily: "inherit" }}>
                  Duplicate
                </button>
                {t.status !== "active" && (
                  <button onClick={() => activate(t.id)}
                    style={{ padding: "4px 10px", background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.15)", borderRadius: 6, fontSize: 11, color: "#4ade80", cursor: "pointer", fontFamily: "inherit" }}>
                    Activate
                  </button>
                )}
                {t.status !== "archived" && (
                  <button onClick={() => archive(t.id)}
                    style={{ padding: "4px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, fontSize: 11, color: "#666", cursor: "pointer", fontFamily: "inherit" }}>
                    Archive
                  </button>
                )}
                <button onClick={() => del(t.id, t.name)}
                  style={{ padding: "4px 10px", background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 6, fontSize: 11, color: "#f87171", cursor: "pointer", fontFamily: "inherit" }}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Scheduled tab ──────────────────────────────────────────────────────────────

function ScheduledTab({ campaigns, loading }: { campaigns: Campaign[]; loading: boolean }) {
  const scheduled = campaigns.filter(c => c.status === "scheduled");

  if (loading) return <div style={{ color: "#444", fontSize: 13, padding: "40px 0", textAlign: "center" }}>Loading…</div>;

  if (!scheduled.length) return (
    <div style={{ color: "#444", fontSize: 13, padding: "40px 0", textAlign: "center" }}>
      No scheduled campaigns
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {scheduled.map(c => (
        <div key={c.id} style={{ background: "#111", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#f0f0f0" }}>{c.subject ?? c.message ?? "—"}</span>
                <span style={statusBadge("scheduled")}>Scheduled</span>
              </div>
              {c.event_title && (
                <div style={{ fontSize: 11, color: "#777", marginTop: 4 }}>
                  Event: <Link href={`/admin/events/${c.event_id}/communicate`} style={{ color: "#e8620a", textDecoration: "none" }}>{c.event_title}</Link>
                </div>
              )}
              <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>
                Channel: {c.channel} · Audience: {c.recipient_filter ?? "all"}{c.recipient_count != null ? ` (${c.recipient_count})` : ""}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 11, color: "#60a5fa", fontWeight: 600 }}>Sends at</div>
              <div style={{ fontSize: 12, color: "#bbb", marginTop: 2 }}>{fmtDate(c.scheduled_for)}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Participant Lookup tab ─────────────────────────────────────────────────────

function ParticipantLookupTab() {
  const [emailInput, setEmailInput] = useState("");
  const [data,       setData]       = useState<ParticipantComms | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  async function lookup() {
    const email = emailInput.trim().toLowerCase();
    if (!email) return;
    setLoading(true); setError(null); setData(null);
    try {
      const res = await fetch(`/api/admin/participant-comms?email=${encodeURIComponent(email)}`);
      if (!res.ok) { setError("Lookup failed"); return; }
      setData(await res.json());
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }

  function handleKey(e: React.KeyboardEvent) { if (e.key === "Enter") lookup(); }

  const CHANNEL_ICONS: Record<string, string> = { email: "📧", whatsapp: "💬" };
  const STATUS_COLORS: Record<string, string> = {
    delivered: "#4ade80", read: "#4ade80", opened: "#4ade80",
    failed: "#f87171", bounced: "#f87171",
    queued: "#fb923c", sending: "#fb923c",
    sent: "#ddd",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Search input */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          value={emailInput}
          onChange={e => setEmailInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Enter participant email address…"
          style={{ flex: 1, minWidth: 200, padding: "10px 14px", background: "#111", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#f0f0f0", fontSize: 13, fontFamily: "inherit", outline: "none" }}
        />
        <button onClick={lookup} disabled={loading}
          style={{ padding: "10px 20px", background: "#e8620a", border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: loading ? 0.6 : 1 }}>
          {loading ? "…" : "Look up"}
        </button>
      </div>

      {error && <div style={{ color: "#f87171", fontSize: 13 }}>{error}</div>}

      {data && (
        <div>
          <div style={{ fontSize: 12, color: "#555", marginBottom: 16 }}>
            Showing {data.total} message{data.total !== 1 ? "s" : ""} for <strong style={{ color: "#e8620a" }}>{data.email}</strong>
            {data.phones.length > 0 && <> · Phones: {data.phones.join(", ")}</>}
          </div>

          {data.timeline.length === 0 ? (
            <div style={{ color: "#444", fontSize: 13, textAlign: "center", padding: "32px 0" }}>No messages found for this email</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {data.timeline.map(item => (
                <div key={item.id} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", alignItems: "flex-start" }}>
                  {/* Channel icon */}
                  <div style={{ flexShrink: 0, width: 28, textAlign: "center", fontSize: 16, marginTop: 1 }}>
                    {CHANNEL_ICONS[item.channel] ?? "📨"}
                  </div>
                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, color: "#ddd", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.subject ?? "—"}
                      </span>
                      <span style={{ ...statusBadge(item.status), flexShrink: 0 }}>{item.status}</span>
                    </div>
                    {/* Delivery milestones */}
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
                      {item.sent_at && <span style={{ fontSize: 10, color: "#555" }}>Sent {fmtDate(item.sent_at)}</span>}
                      {item.delivered_at && <span style={{ fontSize: 10, color: "#4ade80" }}>✓ Delivered {fmtDate(item.delivered_at)}</span>}
                      {item.opened_at && <span style={{ fontSize: 10, color: "#60a5fa" }}>👁 Opened {fmtDate(item.opened_at)}</span>}
                      {item.clicked_at && <span style={{ fontSize: 10, color: "#a78bfa" }}>🔗 Clicked {fmtDate(item.clicked_at)}</span>}
                      {item.bounce_type && <span style={{ fontSize: 10, color: "#f87171" }}>⚠ Bounce: {item.bounce_type} — {item.bounce_reason}</span>}
                    </div>
                  </div>
                  {/* Date */}
                  <div style={{ flexShrink: 0, fontSize: 10, color: "#444", textAlign: "right" }}>
                    {item.sent_at ? new Date(item.sent_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

const TABS = [
  { key: "overview",   label: "Overview" },
  { key: "history",    label: "History" },
  { key: "scheduled",  label: "Scheduled" },
  { key: "templates",  label: "Templates" },
  { key: "lookup",     label: "Participant Lookup" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function CommunicationCenterPage() {
  const [tab,       setTab]       = useState<TabKey>("overview");
  const [stats,     setStats]     = useState<CommStats | null>(null);
  const [statsLoad, setStatsLoad] = useState(true);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campsLoad, setCampsLoad] = useState(true);

  async function loadStats() {
    setStatsLoad(true);
    try {
      const res = await fetch("/api/admin/communication/stats");
      if (res.ok) setStats(await res.json());
    } finally { setStatsLoad(false); }
  }

  async function loadCampaigns() {
    setCampsLoad(true);
    try {
      const res = await fetch("/api/admin/communication/recent?limit=100");
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns ?? []);
      }
    } finally { setCampsLoad(false); }
  }

  useEffect(() => {
    loadStats();
    loadCampaigns();
  }, []);

  void S; // suppress unused var warning

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px 60px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, color: "#555", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Platform</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f0f0f0", margin: 0 }}>Communication Center</h1>
          <button onClick={() => { loadStats(); loadCampaigns(); }}
            style={{ padding: "7px 16px", background: "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#888", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 24, overflowX: "auto" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: "10px 16px", background: "none", border: "none", cursor: "pointer",
              fontFamily: "inherit", fontSize: 13, whiteSpace: "nowrap",
              color: tab === t.key ? "#e8620a" : "#666",
              borderBottom: `2px solid ${tab === t.key ? "#e8620a" : "transparent"}`,
              fontWeight: tab === t.key ? 600 : 400,
            }}>
            {t.label}
            {t.key === "scheduled" && campaigns.filter(c => c.status === "scheduled").length > 0 && (
              <span style={{ marginLeft: 6, background: "rgba(96,165,250,0.15)", color: "#60a5fa", borderRadius: 10, padding: "1px 6px", fontSize: 10 }}>
                {campaigns.filter(c => c.status === "scheduled").length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview"  && <OverviewTab  stats={stats} loading={statsLoad} />}
      {tab === "history"   && <HistoryTab   campaigns={campaigns} loading={campsLoad} />}
      {tab === "scheduled" && <ScheduledTab campaigns={campaigns} loading={campsLoad} />}
      {tab === "templates" && <TemplatesTab />}
      {tab === "lookup"    && <ParticipantLookupTab />}
    </div>
  );
}
