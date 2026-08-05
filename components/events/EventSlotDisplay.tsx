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

function barColor(filled: number, max: number): string {
  const pct = filled / max;
  if (pct >= 1)    return "#6b7280";
  if (pct >= 0.90) return "#ef4444";
  if (pct >= 0.75) return "#f97316";
  if (pct >= 0.50) return "#eab308";
  return "#4ade80";
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

  const hasCap = data.max_participants !== null && data.max_participants > 0;
  const left   = hasCap ? Math.max(0, data.max_participants! - data.participant_count) : null;
  const filled = hasCap ? data.participant_count / data.max_participants! : null;
  const isFull = left === 0;

  const accentColor = hasCap
    ? barColor(data.participant_count, data.max_participants!)
    : "#4ade80";

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
        marginBottom: "12px",
      }}>
        Registration Status
      </div>

      {/* Progress bar — only when a cap is configured */}
      {hasCap && (
        <div style={{
          height: "6px", borderRadius: "3px",
          background: "rgba(255,255,255,0.06)",
          overflow: "hidden", marginBottom: "12px",
        }}>
          <div style={{
            height: "100%",
            width: `${Math.min(100, (filled ?? 0) * 100).toFixed(1)}%`,
            background: accentColor,
            borderRadius: "3px",
            transition: "width 0.6s ease",
          }} />
        </div>
      )}

      {/* Count row */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", fontSize: "14px" }}>
        <span style={{ color: "rgba(255,255,255,0.6)" }}>
          <span style={{ fontWeight: 800, fontSize: "18px", color: "#fff" }}>
            {data.participant_count}
          </span>
          {hasCap && (
            <span style={{ color: "rgba(255,255,255,0.35)" }}>
              {" / "}{data.max_participants}
            </span>
          )}
          {" "}
          <span style={{ color: "rgba(255,255,255,0.45)", fontSize: "13px" }}>registered</span>
        </span>

        {hasCap && !isFull && left !== null && (
          <span style={{
            fontWeight: 700, fontSize: "13px",
            color: accentColor,
          }}>
            · {left} {left === 1 ? "slot" : "slots"} left
          </span>
        )}
        {isFull && (
          <span style={{ fontWeight: 700, fontSize: "13px", color: "#6b7280" }}>
            · ⚫ Sold Out
          </span>
        )}
      </div>
    </div>
  );
}
