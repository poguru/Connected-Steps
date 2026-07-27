"use client";

import { useState, useEffect } from "react";

interface ApiUsageData {
  monthly_by_key: { api_key_id: string; month_bucket: string; request_count: number; avg_latency_ms: number; error_count: number; api_keys: { name: string; is_active: boolean } }[];
  last_24h: { total: number; errors: number; endpoints: { endpoint: string; count: number; errors: number; avg_latency: number }[] };
}

interface WebhookData {
  subscriptions: { id: string; name: string; url: string; is_active: boolean; last_7_days: { total: number; success: number; failed: number; pending: number }; success_rate: number | null }[];
  summary: { total: number; active: number; deliveries_last_7d: number; failures_last_7d: number; success_rate: number | null };
}

interface RateLimitData {
  keys: { id: string; name: string; is_active: boolean; rate_limit_stats: { rpm: number; rph: number; at_limit: boolean } }[];
  summary: { active_keys: number; at_limit_now: number; total_rpm: number; total_rph: number };
}

const S: Record<string, React.CSSProperties> = {
  page:   { padding: "28px 24px", maxWidth: 920, margin: "0 auto" },
  title:  { fontSize: "1.3rem", fontWeight: 700, color: "#fff", margin: "0 0 24px" },
  tabs:   { display: "flex", gap: 4, marginBottom: 24, borderBottom: "1px solid rgba(255,255,255,0.09)" },
  tabBase: { padding: "8px 16px", fontSize: "0.85rem", background: "none", border: "none", cursor: "pointer", marginBottom: -1 } as React.CSSProperties,
  stat:   { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 10, padding: "14px 16px", flex: "1 1 140px" },
  snum:   { fontSize: "1.5rem", fontWeight: 700, color: "#fff" },
  slbl:   { fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", marginTop: 2 },
  row:    { display: "flex", gap: 10, flexWrap: "wrap" as const, marginBottom: 20 },
  card:   { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 10, padding: "14px 16px", marginBottom: 8 },
  mono:   { fontFamily: "monospace", fontSize: "0.82rem", color: "#a5b4fc" },
};

function StatCard({ num, label, warn }: { num: number | string; label: string; warn?: boolean }) {
  return (
    <div style={S.stat}>
      <div style={{ ...S.snum, color: warn ? "#f87171" : "#fff" }}>{num}</div>
      <div style={S.slbl}>{label}</div>
    </div>
  );
}

export default function MonitoringPage() {
  const [tab, setTab] = useState<"api" | "webhooks" | "limits">("api");
  const [apiData,   setApiData]   = useState<ApiUsageData | null>(null);
  const [whData,    setWhData]    = useState<WebhookData  | null>(null);
  const [rlData,    setRlData]    = useState<RateLimitData | null>(null);
  const [loading,   setLoading]   = useState(false);

  async function load(t: "api" | "webhooks" | "limits") {
    setLoading(true);
    try {
      if (t === "api") {
        const r = await fetch("/api/admin/monitoring/api-usage");
        const d = await r.json();
        setApiData(d.data ?? null);
      } else if (t === "webhooks") {
        const r = await fetch("/api/admin/monitoring/webhooks");
        const d = await r.json();
        setWhData(d.data ?? null);
      } else {
        const r = await fetch("/api/admin/monitoring/rate-limits");
        const d = await r.json();
        setRlData(d.data ?? null);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(tab); }, [tab]);

  return (
    <div style={S.page}>
      <h1 style={S.title}>📊 Monitoring</h1>

      <div style={S.tabs}>
        {(["api", "webhooks", "limits"] as const).map(t => (
          <button key={t} style={{ ...S.tabBase, fontWeight: tab === t ? 600 : 400, color: tab === t ? "#fff" : "rgba(255,255,255,0.45)", borderBottom: tab === t ? "2px solid #6366f1" : "2px solid transparent" }} onClick={() => setTab(t)}>
            {t === "api" ? "API Usage" : t === "webhooks" ? "Webhook Health" : "Rate Limits"}
          </button>
        ))}
      </div>

      {loading && <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.85rem" }}>Loading…</div>}

      {/* API Usage tab */}
      {!loading && tab === "api" && apiData && (
        <>
          <div style={S.row}>
            <StatCard num={apiData.last_24h.total} label="Requests (24h)" />
            <StatCard num={apiData.last_24h.errors} label="Errors (24h)" warn={apiData.last_24h.errors > 0} />
            <StatCard num={apiData.last_24h.total > 0 ? `${Math.round((1 - apiData.last_24h.errors / apiData.last_24h.total) * 100)}%` : "—"} label="Success Rate (24h)" />
          </div>

          <div style={{ fontWeight: 600, color: "rgba(255,255,255,0.6)", fontSize: "0.83rem", marginBottom: 10 }}>Top Endpoints (24h)</div>
          {apiData.last_24h.endpoints.slice(0, 10).map(ep => (
            <div key={ep.endpoint} style={S.card}>
              <div style={{ ...S.row, justifyContent: "space-between" }}>
                <span style={S.mono}>{ep.endpoint}</span>
                <div style={S.row}>
                  <span style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.5)" }}>{ep.count} reqs</span>
                  {ep.errors > 0 && <span style={{ fontSize: "0.78rem", color: "#f87171" }}>{ep.errors} errors</span>}
                  <span style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.4)" }}>{ep.avg_latency}ms avg</span>
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Webhook health tab */}
      {!loading && tab === "webhooks" && whData && (
        <>
          <div style={S.row}>
            <StatCard num={whData.summary.total} label="Total Subscriptions" />
            <StatCard num={whData.summary.active} label="Active" />
            <StatCard num={whData.summary.deliveries_last_7d} label="Deliveries (7d)" />
            <StatCard num={whData.summary.failures_last_7d} label="Failures (7d)" warn={whData.summary.failures_last_7d > 0} />
            <StatCard num={whData.summary.success_rate !== null ? `${whData.summary.success_rate}%` : "—"} label="Success Rate (7d)" />
          </div>

          {whData.subscriptions.map(s => (
            <div key={s.id} style={{ ...S.card, opacity: s.is_active ? 1 : 0.5 }}>
              <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: "#fff" }}>{s.name}</span>
                <span style={{ fontSize: "0.75rem", color: s.is_active ? "#34d399" : "rgba(255,255,255,0.4)" }}>{s.is_active ? "active" : "disabled"}</span>
              </div>
              <div style={{ fontSize: "0.8rem", color: "#a5b4fc", fontFamily: "monospace", marginBottom: 6 }}>{s.url}</div>
              <div style={S.row}>
                <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" }}>{s.last_7_days.total} deliveries</span>
                <span style={{ fontSize: "0.75rem", color: "#34d399" }}>{s.last_7_days.success} ok</span>
                {s.last_7_days.failed > 0 && <span style={{ fontSize: "0.75rem", color: "#f87171" }}>{s.last_7_days.failed} failed</span>}
                {s.success_rate !== null && <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.5)" }}>{s.success_rate}% success</span>}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Rate limits tab */}
      {!loading && tab === "limits" && rlData && (
        <>
          <div style={S.row}>
            <StatCard num={rlData.summary.active_keys} label="Active Keys" />
            <StatCard num={rlData.summary.at_limit_now} label="At Limit Now" warn={rlData.summary.at_limit_now > 0} />
            <StatCard num={rlData.summary.total_rpm} label="Total RPM" />
            <StatCard num={rlData.summary.total_rph} label="Total RPH" />
          </div>

          {rlData.keys.map(k => (
            <div key={k.id} style={S.card}>
              <div style={{ ...S.row, justifyContent: "space-between" }}>
                <span style={{ fontWeight: 600, color: "#fff" }}>{k.name}</span>
                <div style={S.row}>
                  <span style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.5)" }}>{k.rate_limit_stats.rpm} RPM</span>
                  <span style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.35)" }}>{k.rate_limit_stats.rph} RPH</span>
                  {k.rate_limit_stats.at_limit && <span style={{ fontSize: "0.75rem", color: "#f87171", fontWeight: 600 }}>AT LIMIT</span>}
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
