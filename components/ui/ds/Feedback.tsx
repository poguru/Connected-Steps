import React from "react";
import { color, radius, font } from "./tokens";

// ── Empty State ───────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?:    string | React.ReactNode;
  title:    string;
  body?:    string;
  action?:  React.ReactNode;
  style?:   React.CSSProperties;
}

export function EmptyState({ icon = "📭", title, body, action, style }: EmptyStateProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 24px", textAlign: "center", ...style }}>
      <div style={{ fontSize: "2.5rem", marginBottom: "14px", opacity: 0.6 }}>{icon}</div>
      <div style={{ fontSize: "15px", fontWeight: 700, color: color.textSecondary, fontFamily: font.body, marginBottom: body ? "8px" : 0 }}>{title}</div>
      {body && <div style={{ fontSize: "13px", color: color.textMuted, lineHeight: 1.6, maxWidth: "320px", fontFamily: font.body }}>{body}</div>}
      {action && <div style={{ marginTop: "20px" }}>{action}</div>}
    </div>
  );
}

// ── Error State ───────────────────────────────────────────────────────────────

interface ErrorStateProps {
  title?:   string;
  message:  string;
  action?:  React.ReactNode;
  style?:   React.CSSProperties;
}

export function ErrorState({ title = "Something went wrong", message, action, style }: ErrorStateProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 24px", textAlign: "center", ...style }}>
      <div style={{ fontSize: "2rem", marginBottom: "12px" }}>⚠️</div>
      <div style={{ fontSize: "15px", fontWeight: 700, color: color.error, fontFamily: font.body, marginBottom: "8px" }}>{title}</div>
      <div style={{ fontSize: "13px", color: color.textMuted, lineHeight: 1.6, maxWidth: "320px", fontFamily: font.body }}>{message}</div>
      {action && <div style={{ marginTop: "20px" }}>{action}</div>}
    </div>
  );
}

// ── Alert / Toast-style inline message ────────────────────────────────────────

interface AlertProps {
  variant?:  "success" | "error" | "warning" | "info";
  children:  React.ReactNode;
  style?:    React.CSSProperties;
}

const alertMap = {
  success: { bg: color.successBg, border: color.successBorder, text: color.success, icon: "✅" },
  error:   { bg: color.errorBg,   border: color.errorBorder,   text: color.error,   icon: "❌" },
  warning: { bg: color.warningBg, border: color.warningBorder, text: color.warning, icon: "⚠️" },
  info:    { bg: color.infoBg,    border: color.infoBorder,    text: color.info,    icon: "ℹ️" },
};

export function Alert({ variant = "info", children, style }: AlertProps) {
  const s = alertMap[variant];
  return (
    <div style={{
      display:      "flex",
      alignItems:   "flex-start",
      gap:          "10px",
      padding:      "12px 14px",
      borderRadius: radius.sm,
      background:   s.bg,
      border:       `1px solid ${s.border}`,
      fontSize:     "13px",
      color:        s.text,
      fontFamily:   font.body,
      lineHeight:   1.5,
      ...style,
    }}>
      <span style={{ flexShrink: 0, marginTop: "1px" }}>{s.icon}</span>
      <span>{children}</span>
    </div>
  );
}

// ── Loading spinner ───────────────────────────────────────────────────────────

export function Spinner({ size = 24, color: c = color.orange }: { size?: number; color?: string }) {
  return (
    <span style={{
      display:      "inline-block",
      width:        size,
      height:       size,
      borderRadius: "50%",
      border:       `${Math.max(2, size / 10)}px solid rgba(255,255,255,0.1)`,
      borderTopColor: c,
      animation:    "cs-spin-kf 0.7s linear infinite",
      flexShrink:   0,
    }} />
  );
}

// ── Loading page overlay ──────────────────────────────────────────────────────

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "14px", padding: "48px", color: color.textMuted, fontFamily: font.body, fontSize: "13px" }}>
      <Spinner size={28} />
      {label}
    </div>
  );
}
