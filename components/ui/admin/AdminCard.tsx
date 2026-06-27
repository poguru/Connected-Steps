import React from "react";

interface AdminCardProps {
  children:    React.ReactNode;
  accent?:     string;
  noPadding?:  boolean;
  style?:      React.CSSProperties;
}

export function AdminCard({ children, accent, noPadding = false, style }: AdminCardProps) {
  return (
    <div style={{
      background:   "#111",
      border:       `1px solid ${accent ? `${accent}22` : "rgba(255,255,255,0.07)"}`,
      borderRadius: 12,
      padding:      noPadding ? 0 : "1.25rem",
      overflow:     noPadding ? "hidden" : undefined,
      ...style,
    }}>
      {children}
    </div>
  );
}
