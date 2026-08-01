"use client";

import { useState, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ComponentStatus { ok: boolean; label: string; detail: string }

interface DeadJob {
  id: string; job_type: string; last_error: string | null;
  attempts: number; created_at: string; updated_at: string;
}

interface Campaign {
  id: string; name: string; status: string;
  total_recipients: number; sent_count: number; failed_count: number;
  created_at: string; updated_at: string;
}

interface CronRun { date: string; status: string; ran_at: string }

interface Throughput {
  jobs_last_hour:      number;
  emails_last_hour:    number;
  failed_webhooks_24h: number;
}

interface DisasterRecovery {
  pitr_enabled_note: string;
  recovery_steps:    string;
}

interface HealthData {
  ok:         boolean;
  ts:         string;
  elapsed:    number;
  issues:     string[];
  components: Record<string, ComponentStatus>;
  job_queue:  { pending: number; processing: number; failed: number; dead: number };
  dead_jobs:  DeadJob[];
  cron_last_run:    Record<string, CronRun>;
  active_campaigns: Campaign[];
  recent_campaigns: Campaign[];
  throughput?:         Throughput;
  disaster_recovery?:  DisasterRecovery;
  version:     string;
  environment: string;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  page:    { padding: "28px 24px", maxWidth: 1060, margin: "0 auto" },
  head:    { display: "flex", alignItems: "center", gap: 12, marginBottom: 28 },
  title:   { fontSize: "1.3rem", fontWeight: 700, color: "#fff", margin: 0 },
  pill:    { padding: "3px 10px", borderRadius: 20, fontSize: "0.75rem", fontWeight: 700 },
  grid:    { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, marginBottom: 28 },
  card:    { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 10, padding: "14px 16px" },
  cardH:   { display: "flex", alignItems: "center", gap: 8, marginBottom: 4 },
  cardLbl: { fontSize: "0.9rem", fontWeight: 600, color: "#fff" },
  cardSub: { fontSize: "0.78rem", color: "rgba(255,255,255,0.45)", marginTop: 2 },
  dot:     { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  section: { marginBottom: 28 },
  sHead:   { fontSize: "1rem", fontWeight: 600, color: "#fff", marginBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.09)", paddingBottom: 8 },
  tbl:     { width: "100%", borderCollapse: "collapse" as const },
  th:      { textAlign: "left" as const, fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", fontWeight: 600, padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.06)", textTransform: "uppercase" as const, letterSpacing: "0.05em" },
  td:      { fontSize: "0.82rem", color: "rgba(255,255,255,0.75)", padding: "8px 8px", borderBottom: "1px solid rgba(255,255,255,0.04)" },
  badge:   { padding: "2px 8px", borderRadius: 4, fontSize: "0.72rem", fontWeight: 700, display: "inline-block" },
  issue:   { background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "10px 14px", marginBottom: 8, color: "#fca5a5", fontSize: "0.85rem" },
  statRow: { display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" as const },
  stat:    { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 8, padding: "12px 16px", minWidth: 100 },
  snum:    { fontSize: "1.4rem", fontWeight: 700, color: "#fff" },
  slbl:    { fontSize: "0.72rem", color: "rgba(255,255,255,0.4)", marginTop: 2 },
  btn:     { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, padding: "6px 14px", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: "0.82rem" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusPill({ ok }: { ok: boolean }) {
  return (
    <span style={{ ...S.pill, background: ok ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", color: ok ? "#4ade80" : "#f87171" }}>
      {ok ? "Healthy" : "Degraded"}
    </span>
  );
}

function Dot({ ok }: { ok: boolean }) {
  return <span style={{ ...S.dot, background: ok ? "#4ade80" : "#f87171" }} />;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, [string, string]> = {
    active:      ["rgba(34,197,94,0.15)",  "#4ade80"],
    paused:      ["rgba(234,179,8,0.15)",  "#fbbf24"],
    completed:   ["rgba(59,130,246,0.15)", "#93c5fd"],
    failed:      ["rgba(239,68,68,0.15)",  "#f87171"],
    dead:        ["rgba(239,68,68,0.15)",  "#f87171"],
    pending:     ["rgba(234,179,8,0.15)",  "#fbbf24"],
    processing:  ["rgba(59,130,246,0.15)", "#93c5fd"],
    ok:          ["rgba(34,197,94,0.15)",  "#4ade80"],
    unknown:     ["rgba(107,114,128,0.2)", "#9ca3af"],
  };
  const [bg, color] = colors[status] ?? colors.unknown;
  return <span style={{ ...S.badge, background: bg, color }}>{status}</span>;
}

function fmtRelative(iso: string): string {
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SystemHealthPage() {
  const [data,    setData]    = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/system-health", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as HealthData;
      setData(json);
      setLastFetched(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load health data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const id = setInterval(() => { void refresh(); }, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  if (loading && !data) return (
    <div style={S.page}>
      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.9rem" }}>Loading system health…</div>
    </div>
  );

  if (error) return (
    <div style={S.page}>
      <div style={{ ...S.issue, marginBottom: 16 }}>Error: {error}</div>
      <button style={S.btn} onClick={() => void refresh()}>Retry</button>
    </div>
  );

  if (!data) return null;

  const cronJobs = Object.entries(data.cron_last_run).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.head}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={S.title}>System Health</h1>
            <StatusPill ok={data.ok} />
          </div>
          <div style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
            v{data.version} · {data.environment} · checked in {data.elapsed}ms
            {lastFetched && ` · refreshed ${fmtRelative(lastFetched.toISOString())}`}
          </div>
        </div>
        <button style={{ ...S.btn, marginLeft: "auto" }} onClick={() => void refresh()} disabled={loading}>
          {loading ? "Refreshing…" : "↻ Refresh"}
        </button>
      </div>

      {/* Issues */}
      {data.issues.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {data.issues.map(i => <div key={i} style={S.issue}>⚠ {i}</div>)}
        </div>
      )}

      {/* Components grid */}
      <div style={S.grid}>
        {Object.entries(data.components).map(([key, comp]) => (
          <div key={key} style={S.card}>
            <div style={S.cardH}>
              <Dot ok={comp.ok} />
              <span style={S.cardLbl}>{comp.label}</span>
            </div>
            <div style={S.cardSub}>{comp.detail}</div>
          </div>
        ))}
      </div>

      {/* Job queue stats */}
      <div style={S.section}>
        <div style={S.sHead}>Job Queue</div>
        <div style={S.statRow}>
          {Object.entries(data.job_queue).map(([k, v]) => (
            <div key={k} style={S.stat}>
              <div style={{ ...S.snum, color: k === "dead" && v > 0 ? "#f87171" : k === "failed" && v > 0 ? "#fbbf24" : "#fff" }}>{v}</div>
              <div style={S.slbl}>{k}</div>
            </div>
          ))}
        </div>

        {/* Dead jobs */}
        {data.dead_jobs.length > 0 && (
          <>
            <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#f87171", marginBottom: 8 }}>
              Dead Jobs (need manual review)
            </div>
            <table style={S.tbl}>
              <thead><tr>
                <th style={S.th}>Job type</th>
                <th style={S.th}>Attempts</th>
                <th style={S.th}>Last error</th>
                <th style={S.th}>Created</th>
              </tr></thead>
              <tbody>
                {data.dead_jobs.map(j => (
                  <tr key={j.id}>
                    <td style={S.td}><code style={{ fontSize: "0.8rem" }}>{j.job_type}</code></td>
                    <td style={S.td}>{j.attempts}</td>
                    <td style={{ ...S.td, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {j.last_error ?? "—"}
                    </td>
                    <td style={S.td}>{fmtRelative(j.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* Throughput */}
      {data.throughput && (
        <div style={S.section}>
          <div style={S.sHead}>Throughput</div>
          <div style={S.statRow}>
            <div style={S.stat}>
              <div style={S.snum}>{data.throughput.jobs_last_hour}</div>
              <div style={S.slbl}>jobs / last hour</div>
            </div>
            <div style={S.stat}>
              <div style={S.snum}>{data.throughput.emails_last_hour}</div>
              <div style={S.slbl}>emails delivered / last hour</div>
            </div>
            <div style={{ ...S.stat }}>
              <div style={{ ...S.snum, color: data.throughput.failed_webhooks_24h > 0 ? "#fbbf24" : "#fff" }}>
                {data.throughput.failed_webhooks_24h}
              </div>
              <div style={S.slbl}>failed webhooks / last 24h</div>
            </div>
          </div>
        </div>
      )}

      {/* Disaster Recovery */}
      {data.disaster_recovery && (
        <div style={S.section}>
          <div style={S.sHead}>Disaster Recovery</div>
          <div style={{ ...S.card, maxWidth: 720 }}>
            <div style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.7)", lineHeight: 1.6, marginBottom: 10 }}>
              <span style={{ color: "#4ade80", fontWeight: 600 }}>PITR</span>{" "}
              {data.disaster_recovery.pitr_enabled_note}
            </div>
            <div style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.45)", lineHeight: 1.7 }}>
              <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.6)" }}>Recovery steps: </span>
              {data.disaster_recovery.recovery_steps}
            </div>
          </div>
        </div>
      )}

      {/* Active/paused campaigns */}
      {data.active_campaigns.length > 0 && (
        <div style={S.section}>
          <div style={S.sHead}>Active / Paused Campaigns</div>
          <table style={S.tbl}>
            <thead><tr>
              <th style={S.th}>Name</th>
              <th style={S.th}>Status</th>
              <th style={S.th}>Sent</th>
              <th style={S.th}>Failed</th>
              <th style={S.th}>Total</th>
              <th style={S.th}>Updated</th>
            </tr></thead>
            <tbody>
              {data.active_campaigns.map(c => (
                <tr key={c.id}>
                  <td style={S.td}>{c.name}</td>
                  <td style={S.td}><StatusBadge status={c.status} /></td>
                  <td style={S.td}>{c.sent_count ?? 0}</td>
                  <td style={{ ...S.td, color: (c.failed_count ?? 0) > 0 ? "#f87171" : "inherit" }}>{c.failed_count ?? 0}</td>
                  <td style={S.td}>{c.total_recipients ?? 0}</td>
                  <td style={S.td}>{fmtRelative(c.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Cron last runs */}
      <div style={S.section}>
        <div style={S.sHead}>Cron Jobs — Last Execution</div>
        {cronJobs.length === 0
          ? <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.85rem" }}>No cron run history found.</div>
          : (
            <table style={S.tbl}>
              <thead><tr>
                <th style={S.th}>Job</th>
                <th style={S.th}>Date</th>
                <th style={S.th}>Status</th>
                <th style={S.th}>Ran</th>
              </tr></thead>
              <tbody>
                {cronJobs.map(([name, run]) => (
                  <tr key={name}>
                    <td style={S.td}><code style={{ fontSize: "0.8rem" }}>{name}</code></td>
                    <td style={S.td}>{run.date}</td>
                    <td style={S.td}><StatusBadge status={run.status} /></td>
                    <td style={S.td}>{fmtRelative(run.ran_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </div>

      {/* Recent campaigns (last 10) */}
      {data.recent_campaigns.length > 0 && (
        <div style={S.section}>
          <div style={S.sHead}>Recent Campaigns</div>
          <table style={S.tbl}>
            <thead><tr>
              <th style={S.th}>Status</th>
              <th style={S.th}>Sent</th>
              <th style={S.th}>Failed</th>
              <th style={S.th}>Total</th>
              <th style={S.th}>Created</th>
            </tr></thead>
            <tbody>
              {data.recent_campaigns.map((c, i) => (
                <tr key={i}>
                  <td style={S.td}><StatusBadge status={c.status} /></td>
                  <td style={S.td}>{c.sent_count ?? 0}</td>
                  <td style={{ ...S.td, color: (c.failed_count ?? 0) > 0 ? "#f87171" : "inherit" }}>{c.failed_count ?? 0}</td>
                  <td style={S.td}>{c.total_recipients ?? 0}</td>
                  <td style={S.td}>{fmtRelative(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
