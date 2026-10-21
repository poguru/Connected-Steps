"use client";

import { useState, useEffect, useCallback } from "react";

// Registration monitoring: how many people started registering, where they are, and where they stop. Counts only; no
// names, contact details or OTP values are shown or stored here.

interface Summary {
  total: number;
  active: number;
  abandoned: number;
  completed: number;
  conversionPercent: number | null;
  byStage: Record<string, number>;
}
interface FailureRow { endpoint: string; httpStatus: number; count: number }
interface Failures {
  total: number;
  lastHour: number;
  byEndpoint: FailureRow[];
  alert: boolean;
}
interface MonitoringResponse {
  periodDays: number;
  activeWindowMinutes: number;
  abandonAfterMinutes: number;
  alertThreshold: number;
  stages: string[];
  generatedAt: string;
  summary: Summary;
  errors: Failures;
}

const STAGE_LABEL: Record<string, string> = {
  landing: "Opened the registration page",
  category_selected: "Chose categories",
  details_submitted: "Entered participant details",
  otp_requested: "Requested a verification code",
  otp_verified: "Verified",
  validation_passed: "Checked and reviewed",
  payment_initiated: "Started payment",
  payment_succeeded: "Payment received",
  confirmed: "Registration confirmed",
};

const ENDPOINT_LABEL: Record<string, string> = {
  "/api/auth/send-otp": "Sending the sign-in code",
  "/api/auth/complete-event-verify": "Checking the sign-in code",
  "/api/it-run/register": "Saving the registration",
  "/api/it-run/payment/create-order": "Starting payment",
  "/api/it-run/payment/verify": "Confirming payment",
};

// 0 means no response reached the browser (a network failure)
function statusLabel(status: number): string {
  return status === 0 ? "No response" : String(status);
}

const PERIODS = [
  { days: 1, label: "Last 24 hours" },
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
];

const S = {
  card: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "16px 18px" },
  label: { fontSize: 11, color: "#888", textTransform: "uppercase" as const, letterSpacing: "0.08em" },
  value: { fontSize: 26, fontWeight: 900, color: "#fff", marginTop: 6 },
};

export default function MonitoringPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<MonitoringResponse | null>(null);
  const [error, setError] = useState<string>("");
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/it-run/admin/monitoring?days=${days}`, { cache: "no-store" });
      if (res.status === 401 || res.status === 403) { setDenied(true); setData(null); return; }
      if (!res.ok) { setError("We couldn't load monitoring data. Try again."); return; }
      setDenied(false);
      setData(await res.json() as MonitoringResponse);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  if (denied) {
    return (
      <div style={{ padding: 24, color: "#fca5a5" }}>
        You don&apos;t have permission to view registration monitoring. Ask an event admin.
      </div>
    );
  }

  const s = data?.summary;
  const stages = data?.stages ?? [];

  return (
    <div style={{ padding: "8px 4px", color: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>Registration Monitoring</h1>
          <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>
            {data
              ? `${PERIODS.find(p => p.days === data.periodDays)?.label ?? `Last ${data.periodDays} days`} · Updated ${new Date(data.generatedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })} IST`
              : "Loading…"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {PERIODS.map(p => (
            <button key={p.days} type="button" onClick={() => setDays(p.days)} style={{
              padding: "8px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
              background: days === p.days ? "#e8620a" : "transparent", color: days === p.days ? "#fff" : "#aaa",
              border: `1px solid ${days === p.days ? "#e8620a" : "rgba(255,255,255,0.15)"}`,
            }}>{p.label}</button>
          ))}
          <button type="button" onClick={() => void load()} disabled={loading} style={{
            padding: "8px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
            background: "transparent", color: "#aaa", border: "1px solid rgba(255,255,255,0.15)", opacity: loading ? 0.5 : 1,
          }}>Refresh</button>
        </div>
      </div>

      {error && <div role="alert" style={{ color: "#fca5a5", marginBottom: 14, fontSize: 14 }}>{error}</div>}
      {loading && !data && <div style={{ color: "#888" }}>Loading monitoring data…</div>}

      {s && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 22 }}>
            <div style={S.card}><div style={S.label}>Registration journeys</div><div style={S.value}>{s.total}</div></div>
            <div style={S.card}><div style={S.label}>Active now</div><div style={S.value}>{s.active}</div>
              <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>Activity in the last {data?.activeWindowMinutes} min</div></div>
            <div style={S.card}><div style={S.label}>Abandoned</div><div style={S.value}>{s.abandoned}</div>
              <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>Inactive over {data?.abandonAfterMinutes} min</div></div>
            <div style={S.card}><div style={S.label}>Completed</div><div style={S.value}>{s.completed}</div></div>
            <div style={S.card}><div style={S.label}>Conversion</div>
              <div style={S.value}>{s.conversionPercent === null ? "—" : `${s.conversionPercent}%`}</div></div>
          </div>

          {data && (
            <div style={{ ...S.card, marginBottom: 22, borderColor: data.errors.alert ? "rgba(239,68,68,0.6)" : S.card.border }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, alignItems: "baseline" }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Failed requests</div>
                <div style={{ fontSize: 12, color: data.errors.alert ? "#fca5a5" : "#888" }}>
                  {data.errors.alert
                    ? `Alert: ${data.errors.lastHour} failures in the last hour (threshold ${data.alertThreshold})`
                    : `${data.errors.lastHour} in the last hour · threshold ${data.alertThreshold}`}
                </div>
              </div>
              {data.errors.total === 0 ? (
                <div style={{ color: "#888", fontSize: 14, marginTop: 12 }}>No failed requests in this period.</div>
              ) : (
                <div style={{ overflowX: "auto", marginTop: 12 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "#888", fontSize: 12 }}>
                        <th style={{ padding: "8px 6px" }}>Step</th>
                        <th style={{ padding: "8px 6px" }}>Response</th>
                        <th style={{ padding: "8px 6px" }}>Failures</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.errors.byEndpoint.map(row => (
                        <tr key={`${row.endpoint} ${row.httpStatus}`} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                          <td style={{ padding: "10px 6px" }}>{ENDPOINT_LABEL[row.endpoint] ?? row.endpoint}</td>
                          <td style={{ padding: "10px 6px" }}>{statusLabel(row.httpStatus)}</td>
                          <td style={{ padding: "10px 6px", fontWeight: 700 }}>{row.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div style={S.card}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Where journeys are now</div>
            {s.total === 0 ? (
              <div style={{ color: "#888", fontSize: 14 }}>No registration journeys in this period yet.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "#888", fontSize: 12 }}>
                      <th style={{ padding: "8px 6px" }}>Stage</th>
                      <th style={{ padding: "8px 6px" }}>Journeys here now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stages.map(stage => (
                      <tr key={stage} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <td style={{ padding: "10px 6px" }}>{STAGE_LABEL[stage] ?? stage}</td>
                        <td style={{ padding: "10px 6px", fontWeight: 700 }}>{s.byStage[stage] ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
