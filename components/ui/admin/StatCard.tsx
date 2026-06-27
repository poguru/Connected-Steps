import React from "react";

interface StatCardProps {
  label:   string;
  value:   string | number;
  sub?:    string;
  color?:  string;
  accent?: boolean;
  href?:   string;
  onClick?: () => void;
}

export function StatCard({ label, value, sub, color = "#fff", accent = false, href, onClick }: StatCardProps) {
  const style: React.CSSProperties = {
    background:   accent ? `${color}0d` : "#111",
    border:       `1px solid ${accent ? `${color}22` : "rgba(255,255,255,0.07)"}`,
    borderRadius: 10,
    padding:      "1rem 1.15rem",
    textDecoration: "none",
    display:      "block",
    cursor:       (href || onClick) ? "pointer" : "default",
    transition:   "border-color 0.15s",
  };

  const inner = (
    <>
      <div style={{ fontSize: "1.65rem", fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>{sub}</div>}
      <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 6, fontWeight: 700 }}>{label}</div>
    </>
  );

  if (href) return <a href={href} style={style}>{inner}</a>;
  if (onClick) return <button onClick={onClick} style={{ ...style, fontFamily: "inherit", width: "100%", textAlign: "left" as const }}>{inner}</button>;
  return <div style={style}>{inner}</div>;
}

interface MetricRowProps {
  label:   string;
  value:   string | number;
  color?:  string;
  pct?:    number;
}

export function MetricRow({ label, value, color = "#ccc", pct }: MetricRowProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <span style={{ fontSize: 13, color: "#aaa" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color }}>{value}</span>
        {pct !== undefined && <span style={{ fontSize: 11, color, fontWeight: 600 }}>{pct}%</span>}
      </div>
    </div>
  );
}
