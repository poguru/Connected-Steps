"use client";

import { useState, useEffect } from "react";

interface RaceSlot {
  race_id: string;
  name: string;
  distance: string;
  slot_reserved: number;
  max_slots: number | null;
}

export interface SlotData {
  participant_count: number;
  max_participants: number | null;
  races: RaceSlot[];
}

type SlotState = "plenty" | "filling" | "limited" | "critical" | "full";

function raceState(reserved: number, max: number): SlotState {
  const left = max - reserved;
  if (left <= 0)          return "full";
  const pct = left / max;
  if (pct > 0.5)          return "plenty";
  if (pct > 0.25)         return "filling";
  if (pct > 0.10)         return "limited";
  return "critical";
}

const STATE: Record<SlotState, { icon: string; color: string; bg: string; border: string }> = {
  plenty:   { icon: "🟢", color: "#4ade80", bg: "rgba(74,222,128,0.08)",  border: "rgba(74,222,128,0.18)"  },
  filling:  { icon: "🟡", color: "#eab308", bg: "rgba(234,179,8,0.08)",   border: "rgba(234,179,8,0.18)"   },
  limited:  { icon: "🟠", color: "#f97316", bg: "rgba(249,115,22,0.08)",  border: "rgba(249,115,22,0.18)"  },
  critical: { icon: "🔴", color: "#ef4444", bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.18)"   },
  full:     { icon: "⚫", color: "#6b7280", bg: "rgba(107,114,128,0.08)", border: "rgba(107,114,128,0.18)" },
};

function barColor(left: number, max: number): string {
  const pct = left / max;
  if (pct <= 0)    return "#6b7280";
  if (pct <= 0.10) return "#ef4444";
  if (pct <= 0.25) return "#f97316";
  if (pct <= 0.50) return "#eab308";
  return "#4ade80";
}

function raceLabel(state: SlotState, left: number, max: number): string {
  if (state === "full")     return "Sold Out";
  if (state === "critical") return `Only ${left} left`;
  if (state === "limited")  return `${left} slots left`;
  if (state === "filling")  return `${left} slots available`;
  return `${left} / ${max} available`;
}

export default function EventSlotDisplay({
  eventId,
  initial,
}: {
  eventId: string;
  initial: SlotData;
}) {
  const [data, setData] = useState<SlotData>(initial);

  useEffect(() => {
    const poll = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/events/${eventId}/slots`);
        if (res.ok) setData((await res.json()) as SlotData);
      } catch { /* stale data is acceptable */ }
    };
    const id = setInterval(poll, 45_000);
    return () => clearInterval(id);
  }, [eventId]);

  const hasEventCap  = data.max_participants !== null && data.max_participants > 0;
  const racesWithCap = data.races.filter(r => r.max_slots !== null && r.max_slots > 0);

  if (!hasEventCap && racesWithCap.length === 0) return null;

  const evLeft = hasEventCap
    ? Math.max(0, data.max_participants! - data.participant_count)
    : null;
  const evPct  = hasEventCap ? data.participant_count / data.max_participants! : null;
  const evFull = evLeft === 0;

  return (
    <div style={{
      marginBottom: "20px",
      padding: "16px 18px",
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: "12px",
    }}>
      <div style={{
        fontSize: "10px", fontWeight: 700, letterSpacing: ".12em",
        textTransform: "uppercase", color: "rgba(255,255,255,0.28)",
        marginBottom: "14px",
      }}>
        Registration Status
      </div>

      {/* Event-level progress bar */}
      {hasEventCap && (
        <div style={{ marginBottom: racesWithCap.length > 0 ? "16px" : 0 }}>
          <div style={{
            height: "8px", borderRadius: "4px",
            background: "rgba(255,255,255,0.06)",
            overflow: "hidden", marginBottom: "10px",
          }}>
            <div style={{
              height: "100%",
              width: `${Math.min(100, (evPct ?? 0) * 100).toFixed(1)}%`,
              background: barColor(evLeft!, data.max_participants!),
              borderRadius: "4px",
              transition: "width 0.6s ease",
            }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", fontSize: "13px" }}>
            <span style={{ color: "rgba(255,255,255,0.6)" }}>
              <span style={{ fontWeight: 700, color: "#fff" }}>{data.participant_count}</span>
              {" / "}
              <span style={{ fontWeight: 700, color: "#fff" }}>{data.max_participants}</span>
              {" registered"}
            </span>
            {!evFull && evLeft !== null && (
              <span style={{
                fontWeight: 700,
                color: barColor(evLeft, data.max_participants!),
              }}>
                · {evLeft} {evLeft === 1 ? "slot" : "slots"} left
              </span>
            )}
            {evFull && (
              <span style={{ fontWeight: 700, color: "#6b7280" }}>· ⚫ Sold Out</span>
            )}
          </div>
        </div>
      )}

      {/* Per-race availability */}
      {racesWithCap.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {racesWithCap.map(race => {
            const left  = Math.max(0, race.max_slots! - race.slot_reserved);
            const state = raceState(race.slot_reserved, race.max_slots!);
            const cfg   = STATE[state];
            return (
              <div key={race.race_id} style={{
                display: "flex", alignItems: "center",
                justifyContent: "space-between", gap: "12px",
              }}>
                <div style={{ minWidth: 0 }}>
                  <span style={{
                    fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.7)",
                    display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {race.name}
                  </span>
                  <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)" }}>
                    {race.distance}
                  </span>
                </div>
                <div style={{
                  display: "flex", alignItems: "center", gap: "5px",
                  padding: "3px 10px", borderRadius: 999,
                  background: cfg.bg, border: `1px solid ${cfg.border}`,
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: "11px", lineHeight: 1 }}>{cfg.icon}</span>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: cfg.color, whiteSpace: "nowrap" }}>
                    {raceLabel(state, left, race.max_slots!)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
