import React from "react";

interface ProgressBarProps {
  value:  number;
  max:    number;
  color?: string;
  height?: number;
}

export function ProgressBar({ value, max, color = "#e8620a", height = 6 }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const c   = pct >= 90 ? "#f87171" : pct >= 70 ? "#fbbf24" : color;
  return (
    <div style={{ height, background: "rgba(255,255,255,0.06)", borderRadius: height, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: c, borderRadius: height, transition: "width 0.5s" }} />
    </div>
  );
}
