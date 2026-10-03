"use client";

import { useEffect, useState } from "react";

const ACCENT = "#e8620a";
const GREEN = "#10b981";
const RED = "#ef4444";
const YELLOW = "#f59e0b";

interface Stats {
  kpis: {
    totalEligibleParticipants: number;
    bibsAllocated: number;
    bibsCollected: number;
    bibsPending: number;
    tshirtIssued: number;
    tshirtPending: number;
    exceptionCount: number;
  };
  progress: {
    bibCollection: { collected: number; total: number; percent: number };
    tshirtIssuance: { issued: number; total: number; percent: number };
  };
  inventory: {
    sizeBreakdown: Array<{
      size: string;
      required: number;
      issued: number;
      remaining: number;
    }>;
  };
  categories: Array<{
    name: string;
    participants: number;
    collected: number;
    tshirts: number;
    collectionPercent: number;
  }>;
  exceptions: Array<{
    type: string;
    participantId: string;
    participantName: string;
    detail: string;
  }>;
  lastUpdated: string;
}

export default function BIBCollectionDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/it-run/admin/bib-collection-stats");
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (err) {
        console.error("Failed to load stats:", err);
      } finally {
        setLoading(false);
      }
    };

    load();
    if (autoRefresh) {
      const interval = setInterval(load, 5000); // Refresh every 5 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  if (loading || !stats) {
    return (
      <div style={{ color: "#888", textAlign: "center", padding: 40 }}>
        Loading collection dashboard…
      </div>
    );
  }

  const { kpis, progress, inventory, categories, exceptions } = stats;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: "#fff", margin: 0 }}>
            BIB Collection Operations
          </h1>
          <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#888", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            Auto-refresh (5s)
          </label>
        </div>
        <div style={{ fontSize: 12, color: "#666" }}>
          Last updated: {new Date(stats.lastUpdated).toLocaleTimeString("en-IN")}
        </div>
      </div>

      {/* KPI Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          marginBottom: 28,
        }}
      >
        <KPICard label="Total Participants" value={kpis.totalEligibleParticipants} color={GREEN} />
        <KPICard label="BIBs Allocated" value={kpis.bibsAllocated} color={ACCENT} />
        <KPICard label="BIBs Collected" value={kpis.bibsCollected} color={GREEN} />
        <KPICard label="BIBs Pending" value={kpis.bibsPending} color={YELLOW} />
        <KPICard label="T-Shirts Issued" value={kpis.tshirtIssued} color={ACCENT} />
        <KPICard label="T-Shirts Pending" value={kpis.tshirtPending} color={YELLOW} />
        <KPICard label="Exceptions" value={kpis.exceptionCount} color={RED} />
      </div>

      {/* Live Progress Section */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
        {/* BIB Collection Progress */}
        <div
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14,
            padding: 20,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 16 }}>
            BIB Collection Progress
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 900,
                  color: ACCENT,
                  marginBottom: 4,
                }}
              >
                {progress.bibCollection.collected} / {progress.bibCollection.total}
              </div>
              <div style={{ fontSize: 12, color: "#888" }}>Collected</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 48,
                  fontWeight: 900,
                  color: progress.bibCollection.percent >= 75 ? GREEN : YELLOW,
                }}
              >
                {progress.bibCollection.percent}%
              </div>
              <div style={{ height: 8, width: 120, background: "rgba(255,255,255,0.1)", borderRadius: 4, overflow: "hidden", marginTop: 8 }}>
                <div
                  style={{
                    height: "100%",
                    width: `${progress.bibCollection.percent}%`,
                    background: ACCENT,
                    transition: "width 0.3s",
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* T-Shirt Issuance Progress */}
        <div
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14,
            padding: 20,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 16 }}>
            T-Shirt Issuance Progress
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 900,
                  color: ACCENT,
                  marginBottom: 4,
                }}
              >
                {progress.tshirtIssuance.issued} / {progress.tshirtIssuance.total}
              </div>
              <div style={{ fontSize: 12, color: "#888" }}>Issued</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 48,
                  fontWeight: 900,
                  color: progress.tshirtIssuance.percent >= 75 ? GREEN : YELLOW,
                }}
              >
                {progress.tshirtIssuance.percent}%
              </div>
              <div style={{ height: 8, width: 120, background: "rgba(255,255,255,0.1)", borderRadius: 4, overflow: "hidden", marginTop: 8 }}>
                <div
                  style={{
                    height: "100%",
                    width: `${progress.tshirtIssuance.percent}%`,
                    background: ACCENT,
                    transition: "width 0.3s",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* T-Shirt Inventory Breakdown */}
      <div
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          padding: 20,
          marginBottom: 28,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 16 }}>
          T-Shirt Inventory Breakdown
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                <th style={{ padding: "12px 0", textAlign: "left", fontSize: 11, color: "#666", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Size
                </th>
                <th style={{ padding: "12px 0", textAlign: "center", fontSize: 11, color: "#666", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Required
                </th>
                <th style={{ padding: "12px 0", textAlign: "center", fontSize: 11, color: "#666", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Issued
                </th>
                <th style={{ padding: "12px 0", textAlign: "center", fontSize: 11, color: "#666", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Remaining
                </th>
              </tr>
            </thead>
            <tbody>
              {inventory.sizeBreakdown.map(row => (
                <tr key={row.size} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <td style={{ padding: "12px 0", fontSize: 13, color: "#fff", fontWeight: 600 }}>
                    {row.size}
                  </td>
                  <td style={{ padding: "12px 0", textAlign: "center", fontSize: 13, color: "#ccc" }}>
                    {row.required}
                  </td>
                  <td
                    style={{
                      padding: "12px 0",
                      textAlign: "center",
                      fontSize: 13,
                      color: GREEN,
                      fontWeight: 700,
                    }}
                  >
                    {row.issued}
                  </td>
                  <td
                    style={{
                      padding: "12px 0",
                      textAlign: "center",
                      fontSize: 13,
                      color: row.remaining === 0 ? RED : row.remaining < 5 ? YELLOW : "#ccc",
                      fontWeight: 600,
                    }}
                  >
                    {row.remaining}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Category Breakdown */}
      <div
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          padding: 20,
          marginBottom: 28,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 16 }}>
          Collection Status by Category
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 16 }}>
          {categories.map(cat => (
            <div
              key={cat.name}
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 10,
                padding: 14,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: ACCENT, marginBottom: 8 }}>
                {cat.name}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Participants
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>
                    {cat.participants}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    T-Shirts
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: GREEN }}>
                    {cat.tshirts}
                  </div>
                </div>
              </div>
              <div style={{ height: 6, background: "rgba(255,255,255,0.1)", borderRadius: 3, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${cat.collectionPercent}%`,
                    background: ACCENT,
                    transition: "width 0.3s",
                  }}
                />
              </div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 6, textAlign: "center" }}>
                {cat.collectionPercent}% Collected
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Exceptions */}
      {exceptions.length > 0 && (
        <div
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 14,
            padding: 20,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: RED, marginBottom: 12 }}>
            Exceptions ({exceptions.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {exceptions.slice(0, 10).map((exc, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "10px 12px",
                  background: "rgba(0,0,0,0.3)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              >
                <div style={{ color: RED, fontWeight: 700, minWidth: 20 }}>⚠</div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#fff", fontWeight: 600 }}>{exc.participantName}</div>
                  <div style={{ color: "#aaa", fontSize: 11, marginTop: 2 }}>
                    {exc.type.replace(/_/g, " ")} — {exc.detail}
                  </div>
                </div>
              </div>
            ))}
            {exceptions.length > 10 && (
              <div style={{ fontSize: 11, color: "#888", textAlign: "center", paddingTop: 8 }}>
                +{exceptions.length - 10} more exceptions
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function KPICard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        background: `${color}15`,
        border: `1px solid ${color}40`,
        borderRadius: 12,
        padding: 16,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 900, color, marginBottom: 4 }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </div>
    </div>
  );
}
