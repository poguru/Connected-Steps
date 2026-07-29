"use client";

import { useState, useEffect, useCallback } from "react";

interface Analytics {
  total:          number;
  days:           number;
  platformCounts: Record<string, number>;
  typeCounts:     Record<string, number>;
  topContent:     { type: string; id: string; count: number }[];
  dailyTrend:     { date: string; count: number }[];
}

const PLATFORM_ICON: Record<string, string> = {
  whatsapp: "💬", twitter: "🐦", facebook: "📘", linkedin: "💼",
  telegram: "✈️", copy: "🔗", download: "⬇️", native: "📱", instagram: "📸",
};

const TYPE_ICON: Record<string, string> = {
  post: "📝", event: "📅", session: "🏃", achievement: "🏅",
  certificate: "🎽", leaderboard: "🏆", registration: "🎫",
};

function pct(n: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

export default function ShareAnalyticsPage() {
  const [data,    setData]    = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [days,    setDays]    = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch(`/api/admin/share-analytics?days=${days}`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const maxDay = data ? Math.max(...data.dailyTrend.map(d => d.count), 1) : 1;

  return (
    <div style={{ padding: "1.5rem", maxWidth: 960, margin: "0 auto" }}>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800 }}>Share Analytics</h1>
          <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "rgba(255,255,255,0.4)" }}>
            Track content shares across all platforms
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[7, 14, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)}
              style={{
                padding: "6px 14px", borderRadius: 20, cursor: "pointer", fontFamily: "inherit",
                fontSize: "0.78rem", fontWeight: days === d ? 700 : 400,
                border: `1px solid ${days === d ? "#e8620a" : "rgba(255,255,255,0.15)"}`,
                background: days === d ? "rgba(232,98,10,0.15)" : "transparent",
                color: days === d ? "#e8620a" : "rgba(255,255,255,0.5)",
              }}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "rgba(255,255,255,0.3)" }}>Loading…</div>
      ) : !data ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "rgba(255,255,255,0.3)" }}>No data</div>
      ) : (
        <>
          {/* Total card */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 12, marginBottom: 24 }}>
            <div style={{ background: "var(--surface,#161b22)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "1rem", textAlign: "center" }}>
              <div style={{ fontSize: "2.2rem", fontWeight: 800, color: "#e8620a" }}>{data.total.toLocaleString()}</div>
              <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 4 }}>Total Shares ({days}d)</div>
            </div>
            {Object.entries(data.typeCounts).map(([type, count]) => (
              <div key={type} style={{ background: "var(--surface,#161b22)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "1rem", textAlign: "center" }}>
                <div style={{ fontSize: "1.5rem", marginBottom: 4 }}>{TYPE_ICON[type] ?? "📤"}</div>
                <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#fff" }}>{count}</div>
                <div style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginTop: 2 }}>{type}</div>
              </div>
            ))}
          </div>

          {/* Daily trend chart */}
          <div style={{ background: "var(--surface,#161b22)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "1.25rem", marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: 16 }}>Daily Trend — Last 14 days</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80 }}>
              {data.dailyTrend.map(d => (
                <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div
                    title={`${d.date}: ${d.count}`}
                    style={{
                      width: "100%", background: d.count ? "#e8620a" : "rgba(255,255,255,0.06)",
                      borderRadius: "3px 3px 0 0",
                      height: `${Math.max((d.count / maxDay) * 64, d.count ? 4 : 2)}px`,
                      transition: "height 0.3s",
                    }}
                  />
                  <div style={{ fontSize: "0.55rem", color: "rgba(255,255,255,0.3)", textAlign: "center", transform: "rotate(-45deg)", transformOrigin: "top left", width: 20 }}>
                    {fmtDate(d.date)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Platform + Top content */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>

            {/* Platform breakdown */}
            <div style={{ background: "var(--surface,#161b22)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "1.25rem" }}>
              <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: 14 }}>By Platform</div>
              {Object.entries(data.platformCounts).sort((a, b) => b[1] - a[1]).map(([platform, count]) => (
                <div key={platform} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: "1rem", flexShrink: 0 }}>{PLATFORM_ICON[platform] ?? "📤"}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: 4 }}>
                      <span style={{ textTransform: "capitalize", color: "rgba(255,255,255,0.8)" }}>{platform}</span>
                      <span style={{ color: "rgba(255,255,255,0.5)" }}>{count} · {pct(count, data.total)}</span>
                    </div>
                    <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", background: "#e8620a", borderRadius: 2, width: pct(count, data.total) }} />
                    </div>
                  </div>
                </div>
              ))}
              {Object.keys(data.platformCounts).length === 0 && (
                <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.3)" }}>No data yet.</div>
              )}
            </div>

            {/* Top shared content */}
            <div style={{ background: "var(--surface,#161b22)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "1.25rem" }}>
              <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: 14 }}>Top Shared Content</div>
              {data.topContent.length === 0 ? (
                <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.3)" }}>No data yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {data.topContent.map((item, i) => (
                    <div key={`${item.type}-${item.id}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "rgba(255,255,255,0.04)", borderRadius: 8 }}>
                      <span style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.3)", fontWeight: 700, minWidth: 16 }}>#{i + 1}</span>
                      <span style={{ fontSize: "0.9rem" }}>{TYPE_ICON[item.type] ?? "📤"}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "0.73rem", color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{item.type}</div>
                        <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.id}</div>
                      </div>
                      <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#e8620a", flexShrink: 0 }}>{item.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
