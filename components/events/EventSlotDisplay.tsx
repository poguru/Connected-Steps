"use client";

import { useState, useEffect } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RaceSlot {
  race_id: string; name: string; distance: string;
  slot_reserved: number; max_slots: number | null;
}

export interface SlotData {
  participant_count: number;
  max_participants:  number | null;
  races:             RaceSlot[];
}

// ── FOMO config ───────────────────────────────────────────────────────────────

interface FomoConfig { emoji: string; label: string; color: string; bg: string }

function getFomo(pctLeft: number | null, isSoldOut: boolean): FomoConfig {
  if (isSoldOut)        return { emoji: "❌", label: "Sold Out",                color: "#6b7280", bg: "rgba(107,114,128,0.08)" };
  if (pctLeft === null) return { emoji: "🟢", label: "Registration Open",       color: "#4ade80", bg: "rgba(74,222,128,0.05)" };
  if (pctLeft <= 0.05)  return { emoji: "🚨", label: "Last Few Spots",          color: "#ef4444", bg: "rgba(239,68,68,0.12)" };
  if (pctLeft <= 0.10)  return { emoji: "🔴", label: "Almost Sold Out",         color: "#ef4444", bg: "rgba(239,68,68,0.08)" };
  if (pctLeft <= 0.25)  return { emoji: "🟠", label: "Few Spots Left",          color: "#f97316", bg: "rgba(249,115,22,0.08)" };
  if (pctLeft <= 0.50)  return { emoji: "🟡", label: "Filling Fast",            color: "#eab308", bg: "rgba(234,179,8,0.07)" };
  return                       { emoji: "🟢", label: "Plenty of Spots",         color: "#4ade80", bg: "rgba(74,222,128,0.04)" };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function EventSlotDisplay({
  eventId,
  initial,
  featured,
}: {
  eventId:  string;
  initial:  SlotData;
  featured?: boolean;
}) {
  const [data,     setData]     = useState<SlotData>(initial);
  const [barReady, setBarReady] = useState(false);

  // Trigger bar animation after first paint
  useEffect(() => {
    const t = setTimeout(() => setBarReady(true), 120);
    return () => clearTimeout(t);
  }, []);

  // Poll for live slot updates (skip when tab is hidden)
  useEffect(() => {
    const poll = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/events/${eventId}/slots`);
        if (res.ok) setData(await res.json() as SlotData);
      } catch { /* stale data is acceptable */ }
    };
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, [eventId]);

  const hasCap    = data.max_participants !== null && data.max_participants > 0;
  const count     = data.participant_count;
  const max       = data.max_participants ?? 0;
  const left      = hasCap ? Math.max(0, max - count) : null;
  const pctFilled = hasCap && max > 0 ? count / max : 0;
  const pctLeft   = hasCap && max > 0 ? left! / max : null;
  const isSoldOut = hasCap && left === 0;

  const fomo     = getFomo(pctLeft, isSoldOut);
  const isPulse  = !isSoldOut && pctLeft !== null && pctLeft <= 0.10;

  // Bar color tracks fill level (green → yellow → orange → red)
  const barColor = isSoldOut
    ? "#6b7280"
    : pctFilled >= 0.95 ? "#ef4444"
    : pctFilled >= 0.75 ? "#f97316"
    : pctFilled >= 0.50 ? "#eab308"
    : "#4ade80";

  const barWidth = barReady ? +(Math.min(100, pctFilled * 100)).toFixed(2) : 0;

  const fmt = (n: number) => n.toLocaleString("en-IN");

  return (
    <div style={{
      marginBottom: "20px",
      padding: "18px 20px 16px",
      background: fomo.bg,
      border: `1px solid ${isSoldOut ? "rgba(107,114,128,0.18)" : "rgba(255,255,255,0.1)"}`,
      borderRadius: "14px",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Keyframe animations injected once */}
      <style>{`
        @keyframes cs-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.3;transform:scale(.7)} }
        @keyframes cs-fadein { from{opacity:0;transform:translateY(3px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* Top accent stripe */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: "2px",
        background: fomo.color, opacity: isSoldOut ? 0.4 : 0.75,
      }} />

      {/* Header row — status label + optional featured badge */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {isPulse && (
            <span style={{
              display: "inline-block", width: 6, height: 6, borderRadius: "50%",
              background: fomo.color, flexShrink: 0,
              animation: "cs-pulse 1.6s ease-in-out infinite",
            }} />
          )}
          <span style={{
            fontSize: "10px", fontWeight: 700, letterSpacing: ".12em",
            textTransform: "uppercase", color: fomo.color,
          }}>
            {hasCap
              ? (isSoldOut ? "❌ Sold Out" : "🔥 Limited Slots Available")
              : "🟢 Registration Open"}
          </span>
        </div>

        {featured && (
          <span style={{
            fontSize: "10px", fontWeight: 700, letterSpacing: ".06em",
            color: "#e8620a", background: "rgba(232,98,10,0.1)",
            border: "1px solid rgba(232,98,10,0.25)",
            padding: "2px 9px", borderRadius: 999,
          }}>
            ★ FEATURED
          </span>
        )}
      </div>

      {/* Main stat */}
      {hasCap ? (
        isSoldOut ? (
          /* ── Sold out ── */
          <div style={{ marginBottom: "14px", animation: "cs-fadein 0.4s ease" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: "36px", fontWeight: 800, color: "#6b7280", lineHeight: 1, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
                {fmt(max)}
              </span>
              <span style={{ fontSize: "14px", color: "#6b7280", fontWeight: 600 }}>
                / {fmt(max)}
              </span>
            </div>
            <div style={{ fontSize: "12px", color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", marginTop: 3 }}>
              Fully Booked
            </div>
          </div>
        ) : (
          /* ── Spots remaining ── */
          <div style={{ marginBottom: "12px", animation: "cs-fadein 0.35s ease" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{
                  fontSize: "42px", fontWeight: 800, color: "#fff", lineHeight: 1,
                  fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em",
                }}>
                  {fmt(left!)}
                </div>
                <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.45)", fontWeight: 500, marginTop: 3 }}>
                  spots left
                </div>
              </div>
              <div style={{ paddingBottom: 6 }}>
                <div style={{
                  fontSize: "11px", fontWeight: 800, color: fomo.color,
                  textTransform: "uppercase", letterSpacing: ".08em",
                }}>
                  {fomo.emoji} {fomo.label}
                </div>
              </div>
            </div>
          </div>
        )
      ) : (
        /* ── No cap configured ── */
        <div style={{ marginBottom: "14px", animation: "cs-fadein 0.35s ease" }}>
          <div style={{ fontSize: "42px", fontWeight: 800, color: "#4ade80", lineHeight: 1, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em" }}>
            {fmt(count)}
          </div>
          <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.45)", fontWeight: 500, marginTop: 3 }}>
            registered
          </div>
        </div>
      )}

      {/* Sub-stats row */}
      {hasCap && (
        <div style={{
          fontSize: "12px", color: "rgba(255,255,255,0.32)",
          marginBottom: "14px", display: "flex", gap: 8,
          flexWrap: "wrap", alignItems: "center",
        }}>
          <span>{fmt(count)} already registered</span>
          <span style={{ color: "rgba(255,255,255,0.14)" }}>·</span>
          <span>{fmt(max)} total capacity</span>
        </div>
      )}

      {/* Progress bar */}
      {hasCap && (
        <div>
          <div style={{
            height: "7px", borderRadius: "4px",
            background: "rgba(255,255,255,0.06)", overflow: "hidden",
            marginBottom: "7px",
          }}>
            <div style={{
              height: "100%",
              width: `${barWidth}%`,
              background: isSoldOut
                ? "#6b7280"
                : `linear-gradient(90deg, ${barColor}88 0%, ${barColor} 100%)`,
              borderRadius: "4px",
              transition: "width 1.5s cubic-bezier(0.22, 1, 0.36, 1)",
              boxShadow: isSoldOut ? "none" : `0 0 10px ${barColor}45`,
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.2)", fontVariantNumeric: "tabular-nums" }}>
              {fmt(count)} / {fmt(max)} registered
            </span>
            {!isSoldOut && (
              <span style={{ fontSize: "10px", fontWeight: 700, color: fomo.color, fontVariantNumeric: "tabular-nums" }}>
                {Math.round((pctLeft ?? 0) * 100)}% remaining
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
