import React from "react";
import { color, font, spacing } from "./tokens";

// ── Page wrapper ──────────────────────────────────────────────────────────────

export function Page({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ minHeight: "100vh", background: color.black, color: color.textPrimary, fontFamily: font.body, ...style }}>
      {children}
    </div>
  );
}

// ── Page header (sticky title bar) ───────────────────────────────────────────

interface PageHeaderProps {
  title:        string;
  breadcrumb?:  React.ReactNode;
  actions?:     React.ReactNode;
  style?:       React.CSSProperties;
}

export function PageHeader({ title, breadcrumb, actions, style }: PageHeaderProps) {
  return (
    <div style={{
      display:        "flex",
      alignItems:     "center",
      justifyContent: "space-between",
      flexWrap:       "wrap" as const,
      gap:            "12px",
      marginBottom:   spacing[6],
      ...style,
    }}>
      <div>
        {breadcrumb && (
          <div style={{ fontSize: "12px", color: color.textMuted, fontFamily: font.body, marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
            {breadcrumb}
          </div>
        )}
        <h1 style={{ margin: 0, fontSize: "clamp(1.2rem, 2.5vw, 1.5rem)", fontWeight: 700, color: color.textPrimary, fontFamily: font.body }}>
          {title}
        </h1>
      </div>
      {actions && <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0 }}>{actions}</div>}
    </div>
  );
}

// ── Content container ─────────────────────────────────────────────────────────

export function Container({ children, maxWidth = 960, style }: { children: React.ReactNode; maxWidth?: number; style?: React.CSSProperties }) {
  return (
    <div style={{ maxWidth, margin: "0 auto", padding: "0 20px", ...style }}>
      {children}
    </div>
  );
}

// ── Two-column layout ─────────────────────────────────────────────────────────

export function TwoCol({ left, right, leftWidth = "260px", gap = "20px", style }: {
  left:       React.ReactNode;
  right:      React.ReactNode;
  leftWidth?: string;
  gap?:       string;
  style?:     React.CSSProperties;
}) {
  return (
    <div style={{ display: "flex", gap, alignItems: "flex-start", ...style }}>
      <div style={{ width: leftWidth, flexShrink: 0 }}>{left}</div>
      <div style={{ flex: 1, minWidth: 0 }}>{right}</div>
    </div>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────

export function Divider({ style }: { style?: React.CSSProperties }) {
  return <hr style={{ border: "none", borderTop: `1px solid ${color.border}`, margin: "20px 0", ...style }} />;
}

// ── Section Divider with label (used between content groups) ──────────────────

export function SectionDivider({ label, style }: { label?: string; style?: React.CSSProperties }) {
  if (!label) return <Divider style={style} />;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "24px 0", ...style }}>
      <div style={{ flex: 1, height: 1, background: color.border }} />
      <span style={{ fontSize: "10px", fontWeight: 700, color: color.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: font.body, whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: color.border }} />
    </div>
  );
}

// ── Section header row ────────────────────────────────────────────────────────

export function SectionRow({ title, action, style }: { title: string; action?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", ...style }}>
      <div style={{ fontSize: "10px", fontWeight: 700, color: color.textMuted, textTransform: "uppercase", letterSpacing: "0.1em" }}>{title}</div>
      {action && <div>{action}</div>}
    </div>
  );
}

// ── Stat strip ────────────────────────────────────────────────────────────────

interface StatItem { label: string; value: string | number; color?: string }

export function StatStrip({ stats, style }: { stats: StatItem[]; style?: React.CSSProperties }) {
  return (
    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" as const, ...style }}>
      {stats.map(s => (
        <div key={s.label} style={{ background: color.dark, border: `1px solid ${color.border}`, borderRadius: "10px", padding: "14px 20px", minWidth: "110px" }}>
          <div style={{ fontSize: "1.5rem", fontWeight: 800, color: s.color ?? color.orange, lineHeight: 1 }}>{s.value}</div>
          <div style={{ fontSize: "10px", color: color.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "6px" }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}
