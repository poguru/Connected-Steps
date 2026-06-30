import React from "react";
import { radius } from "./tokens";

interface SkeletonProps {
  width?:  string | number;
  height?: string | number;
  radius?: string;
  style?:  React.CSSProperties;
}

export function Skeleton({ width = "100%", height = "16px", radius: r, style }: SkeletonProps) {
  return (
    <div style={{
      width,
      height,
      borderRadius: r ?? radius.sm,
      background:   "linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.05) 75%)",
      backgroundSize: "200% 100%",
      animation:    "cs-shimmer 1.4s ease-in-out infinite",
      flexShrink:   0,
      ...style,
    }} />
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: radius.lg, padding: "20px 24px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <Skeleton width="60%" height="18px" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? "40%" : "100%"} height="12px" />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
      {/* Header */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: "8px", padding: "12px 16px", background: "rgba(255,255,255,0.02)", borderRadius: `${radius.lg} ${radius.lg} 0 0` }}>
        {Array.from({ length: cols }).map((_, i) => <Skeleton key={i} height="10px" width="60%" />)}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, ri) => (
        <div key={ri} style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: "8px", padding: "12px 16px", background: ri % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
          {Array.from({ length: cols }).map((_, ci) => <Skeleton key={ci} height="14px" width={ci === 0 ? "80%" : "55%"} />)}
        </div>
      ))}
    </div>
  );
}
