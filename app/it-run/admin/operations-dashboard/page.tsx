"use client";

import { useEffect, useState } from "react";

interface Stats {
  totalParticipants: number;
  bibCollected: number;
  checkedIn: number;
  breakfastIssued: number;
  goodiesIssued: number;
  tshirtIssued: number;
  medalIssued: number;
  certificateIssued: number;
  staffActive: number;
}

export default function OperationsDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const res = await fetch("/api/it-run/admin/operations-stats");
        if (res.ok) {
          const data = (await res.json()) as { stats: Stats };
          setStats(data.stats);
        }
      } catch {
        console.error("Failed to load stats");
      } finally {
        setLoading(false);
      }
    };

    loadStats();
    if (autoRefresh) {
      const interval = setInterval(loadStats, 5000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  if (loading || !stats) {
    return <div style={{ color: "#888", textAlign: "center", padding: 40 }}>Loading…</div>;
  }

  const ACCENT = "#e8620a";
  const cards = [
    { label: "Total Participants", value: stats.totalParticipants, color: "#60a5fa" },
    { label: "Checked In", value: stats.checkedIn, color: "#10b981" },
    { label: "BIB Collected", value: stats.bibCollected, color: ACCENT },
    { label: "Breakfast", value: stats.breakfastIssued, color: "#ec4899" },
    { label: "Goodies", value: stats.goodiesIssued, color: "#8b5cf6" },
    { label: "T-Shirts", value: stats.tshirtIssued, color: "#06b6d4" },
    { label: "Medals", value: stats.medalIssued, color: "#fbbf24" },
    { label: "Certificates", value: stats.certificateIssued, color: "#60a5fa" },
    { label: "Active Staff", value: stats.staffActive, color: "#10b981" },
  ];

  const completion = {
    checkin: stats.totalParticipants > 0 ? Math.round((stats.checkedIn / stats.totalParticipants) * 100) : 0,
    bib: stats.totalParticipants > 0 ? Math.round((stats.bibCollected / stats.totalParticipants) * 100) : 0,
    breakfast: stats.totalParticipants > 0 ? Math.round((stats.breakfastIssued / stats.totalParticipants) * 100) : 0,
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: 0 }}>
          Live Operations Dashboard
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

      {/* Overview Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 32 }}>
        {cards.map(card => (
          <div
            key={card.label}
            style={{
              background: `${card.color}15`,
              border: `1px solid ${card.color}40`,
              borderRadius: 12,
              padding: 16,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 900, color: card.color, marginBottom: 4 }}>
              {card.value}
            </div>
            <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {card.label}
            </div>
          </div>
        ))}
      </div>

      {/* Completion Rates */}
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginTop: 0 }}>
          Completion Rate
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
          {[
            { label: "Check-In", pct: completion.checkin, color: "#10b981" },
            { label: "BIB Collection", pct: completion.bib, color: ACCENT },
            { label: "Breakfast", pct: completion.breakfast, color: "#ec4899" },
          ].map(item => (
            <div key={item.label}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#ccc" }}>{item.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: item.color }}>
                  {item.pct}%
                </span>
              </div>
              <div style={{ height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${item.pct}%`,
                    background: item.color,
                    transition: "width 0.3s",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 11, color: "#666", marginTop: 16, textAlign: "center" }}>
        Last updated: {new Date().toLocaleTimeString()}
      </div>
    </div>
  );
}
