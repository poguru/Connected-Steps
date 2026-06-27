"use client";

import { useState, useEffect, useRef } from "react";
import { getLifecycle, msToCountdown, LIFECYCLE_BADGE, type LifecycleEvent } from "@/lib/event-lifecycle";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  event:       LifecycleEvent;
  /** Extra class/style for the outer wrapper */
  className?:  string;
  /** Compact mode: single line "Closes in 2d 3h 4m" — used on listing cards */
  compact?:    boolean;
  /** Called when lifecycle state transitions (e.g. registration just closed) */
  onTransition?: (newState: string) => void;
}

// ── Digit block ───────────────────────────────────────────────────────────────

function Digit({ value, label, compact }: { value: number; label: string; compact?: boolean }) {
  const str = String(value).padStart(2, "0");
  if (compact) {
    return (
      <span style={{ fontVariantNumeric: "tabular-nums" }}>
        <span style={{ fontWeight: 800, color: "#fff" }}>{str}</span>
        <span style={{ fontSize: 10, color: "#888", marginLeft: 1 }}>{label[0]}</span>
      </span>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 44 }}>
      <div style={{
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.09)",
        borderRadius: 8,
        padding: "6px 10px",
        fontSize: 22,
        fontWeight: 900,
        color: "#fff",
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1,
        minWidth: 44,
        textAlign: "center",
      }}>
        {str}
      </div>
      <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 700 }}>
        {label}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EventCountdown({ event, compact, onTransition, className }: Props) {
  const [lifecycle, setLifecycle] = useState(() => getLifecycle(event));
  const [parts,     setParts]     = useState(() =>
    lifecycle.nextTransitionMs ? msToCountdown(lifecycle.nextTransitionMs) : null
  );
  const onTransitionRef = useRef(onTransition);
  onTransitionRef.current = onTransition;

  useEffect(() => {
    // Recompute lifecycle whenever event prop changes
    const lc = getLifecycle(event);
    setLifecycle(lc);
    setParts(lc.nextTransitionMs ? msToCountdown(lc.nextTransitionMs) : null);
  }, [
    event.start_date, event.start_time, event.end_date, event.end_time,
    event.registration_closes_at, event.registration_opens_at,
  ]);

  useEffect(() => {
    if (!lifecycle.nextTransitionMs) return;

    const tick = () => {
      const now = Date.now();

      if (now >= lifecycle.nextTransitionMs!) {
        // State transition — recompute lifecycle
        const next = getLifecycle(event, now);
        setLifecycle(next);
        setParts(next.nextTransitionMs ? msToCountdown(next.nextTransitionMs, now) : null);
        onTransitionRef.current?.(next.state);
        return;
      }

      setParts(msToCountdown(lifecycle.nextTransitionMs!, now));
    };

    tick(); // immediate paint
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lifecycle.nextTransitionMs]);

  const badge = LIFECYCLE_BADGE[lifecycle.state];

  // ── Nothing to show once completed ─────────────────────────────────────────
  if (lifecycle.isCompleted) {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        fontSize: 11, fontWeight: 700, color: badge.color,
        background: badge.bg, border: `1px solid ${badge.border}`,
        padding: "3px 10px", borderRadius: 999,
      }}>
        ✓ {badge.label}
      </span>
    );
  }

  // ── Event is live ───────────────────────────────────────────────────────────
  if (lifecycle.isLive) {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        fontSize: 11, fontWeight: 800, color: badge.color,
        background: badge.bg, border: `1px solid ${badge.border}`,
        padding: "3px 12px", borderRadius: 999,
        animation: "pulse 2s ease-in-out infinite",
      }}>
        ● LIVE NOW
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}`}</style>
      </span>
    );
  }

  // ── Compact single-line (for card badges) ────────────────────────────────────
  if (compact) {
    if (!parts || !lifecycle.showCountdown) {
      return (
        <span style={{ fontSize: 11, fontWeight: 700, color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`, padding: "3px 9px", borderRadius: 999 }}>
          {badge.text}
        </span>
      );
    }

    // Choose which units to show based on remaining time
    const showDays = parts.days > 0;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`, padding: "3px 9px", borderRadius: 999 }}>
        {lifecycle.state === "registration_open" ? "Closes" : lifecycle.state === "registration_not_open" ? "Opens" : "Starts"}{" "}
        {showDays && <><Digit value={parts.days} label="d" compact />{" "}</>}
        <Digit value={parts.hours} label="h" compact />{" "}
        <Digit value={parts.minutes} label="m" compact />
        {!showDays && <>{" "}<Digit value={parts.seconds} label="s" compact /></>}
      </span>
    );
  }

  // ── Full countdown display ────────────────────────────────────────────────────
  return (
    <div className={className} style={{ textAlign: "center" }}>
      {/* Status badge */}
      <div style={{ marginBottom: 10 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          fontSize: 11, fontWeight: 700, color: badge.color,
          background: badge.bg, border: `1px solid ${badge.border}`,
          padding: "4px 12px", borderRadius: 999,
        }}>
          {badge.text}
        </span>
      </div>

      {/* Countdown label */}
      {lifecycle.showCountdown && lifecycle.countdownLabel && parts && (
        <>
          <div style={{ fontSize: 12, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>
            {lifecycle.countdownLabel}
          </div>

          {/* Digit blocks */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6, justifyContent: "center" }}>
            {parts.days > 0 && (
              <>
                <Digit value={parts.days} label="Days" />
                <span style={{ fontSize: 22, fontWeight: 900, color: "#333", paddingTop: 6 }}>:</span>
              </>
            )}
            <Digit value={parts.hours} label="Hours" />
            <span style={{ fontSize: 22, fontWeight: 900, color: "#333", paddingTop: 6 }}>:</span>
            <Digit value={parts.minutes} label="Min" />
            <span style={{ fontSize: 22, fontWeight: 900, color: "#333", paddingTop: 6 }}>:</span>
            <Digit value={parts.seconds} label="Sec" />
          </div>
        </>
      )}

      {/* No countdown — just the badge (already rendered above) */}
      {!lifecycle.showCountdown && lifecycle.state === "registration_not_open" && (
        <div style={{ fontSize: 12, color: "#555", marginTop: 6 }}>Check back soon</div>
      )}
    </div>
  );
}
