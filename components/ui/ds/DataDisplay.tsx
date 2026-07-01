"use client";
import React, { useState, useRef, useEffect } from "react";
import { color, radius, font, zIndex, shadow } from "./tokens";
import { ease } from "./motion";

// ── Progress Bar ──────────────────────────────────────────────────────────────

interface ProgressBarProps {
  value:    number;    // 0–100
  max?:     number;
  color?:   string;
  height?:  number;
  label?:   string;
  showPct?: boolean;
  style?:   React.CSSProperties;
}

export function ProgressBar({ value, max = 100, color: c, height = 6, label, showPct = false, style }: ProgressBarProps) {
  const pct   = Math.min(100, Math.max(0, Math.round((value / max) * 100)));
  const track = pct >= 90 ? "#f87171" : pct >= 70 ? "#fbbf24" : (c ?? color.orange);

  return (
    <div style={style}>
      {(label || showPct) && (
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
          {label && <span style={{ fontSize: "12px", color: color.textMuted, fontFamily: font.body }}>{label}</span>}
          {showPct && <span style={{ fontSize: "12px", color: track, fontWeight: 700, fontFamily: font.body }}>{pct}%</span>}
        </div>
      )}
      <div style={{ height, background: color.surface, borderRadius: radius.full, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: track, borderRadius: radius.full, transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────

export interface AvatarProps {
  name?:   string;
  src?:    string | null;
  size?:   number;
  color?:  string;
  /** Leaderboard rank overlay — shows number badge in bottom-right corner */
  rank?:   number;
  style?:  React.CSSProperties;
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
}

const avatarColors = ["#e8620a", "#4ade80", "#60a5fa", "#a78bfa", "#fbbf24", "#f87171", "#34d399"];
function pickColor(name: string) { return avatarColors[name.charCodeAt(0) % avatarColors.length]; }

const MEDAL: Record<number, string> = { 1: "#f59e0b", 2: "#9ca3af", 3: "#b45309" };

export function Avatar({ name = "?", src, size = 36, color: c, rank, style }: AvatarProps) {
  const bg = c ?? (name ? pickColor(name) : color.orange);
  const rankColor = rank ? (MEDAL[rank] ?? color.orange) : null;
  return (
    // borderRadius on the outer container ensures any `border` passed via the
    // `style` prop (e.g. from Leaderboard podium cards) also appears circular
    // rather than as a square frame around the inner circle.
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0, display: "inline-flex", borderRadius: radius.full, ...style }}>
      <div style={{ width: size, height: size, borderRadius: radius.full, overflow: "hidden", background: src ? "transparent" : `${bg}22`, border: `2px solid ${bg}44`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {src ? (
          <img src={src} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ fontSize: size * 0.36, fontWeight: 700, color: bg, fontFamily: font.body, userSelect: "none" }}>{initials(name)}</span>
        )}
      </div>
      {rank && (
        <div style={{ position: "absolute", bottom: -2, right: -2, width: size * 0.42, height: size * 0.42, borderRadius: "50%", background: rankColor!, border: `2px solid ${color.dark}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.22, fontWeight: 800, color: "#fff", fontFamily: font.body }}>
          {rank}
        </div>
      )}
    </div>
  );
}

export function AvatarGroup({ avatars, max = 4, size = 32, style }: {
  avatars: AvatarProps[];
  max?:    number;
  size?:   number;
  style?:  React.CSSProperties;
}) {
  const visible = avatars.slice(0, max);
  const extra   = avatars.length - max;
  return (
    <div style={{ display: "flex", ...style }}>
      {visible.map((a, i) => (
        <div key={i} style={{ marginLeft: i === 0 ? 0 : -size * 0.3, zIndex: visible.length - i }}>
          <Avatar {...a} size={size} style={{ boxShadow: `0 0 0 2px ${color.dark}` }} />
        </div>
      ))}
      {extra > 0 && (
        <div style={{ width: size, height: size, borderRadius: radius.full, background: color.surface, border: `2px solid ${color.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.3, color: color.textMuted, fontFamily: font.body, fontWeight: 700, marginLeft: -size * 0.3, boxShadow: `0 0 0 2px ${color.dark}` }}>
          +{extra}
        </div>
      )}
    </div>
  );
}

// ── Chip / Tag ────────────────────────────────────────────────────────────────

interface ChipProps {
  label:       string;
  onRemove?:   () => void;
  onClick?:    () => void;
  color?:      string;
  icon?:       string;
  size?:       "xs" | "sm" | "md";
  style?:      React.CSSProperties;
  title?:      string;   // native HTML tooltip
}

export function Chip({ label, onRemove, onClick, color: c = color.orange, icon, size = "sm", style, title }: ChipProps) {
  const sm = size === "sm" || size === "xs";
  const xs = size === "xs";
  return (
    <span title={title} onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: xs ? "1px 6px" : sm ? "2px 8px" : "4px 12px", background: `${c}14`, border: `1px solid ${c}30`, borderRadius: radius.full, fontSize: xs ? "10px" : sm ? "11px" : "12px", fontWeight: 600, color: c, fontFamily: font.body, whiteSpace: "nowrap", ...style }}>
      {icon && <span style={{ fontSize: sm ? "11px" : "13px" }}>{icon}</span>}
      {label}
      {onRemove && (
        <button onClick={onRemove} style={{ background: "none", border: "none", color: c, cursor: "pointer", padding: "0 1px", fontSize: sm ? "13px" : "15px", lineHeight: 1, opacity: 0.7, fontFamily: font.body }}>×</button>
      )}
    </span>
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

export function Tooltip({ children, label, placement = "top", style }: {
  children:   React.ReactNode;
  label:      string;
  placement?: "top" | "bottom" | "left" | "right";
  style?:     React.CSSProperties;
}) {
  const [visible, setVisible] = useState(false);

  const placementStyle: Record<string, React.CSSProperties> = {
    top:    { bottom: "100%", left: "50%", transform: "translateX(-50%)", marginBottom: "6px" },
    bottom: { top:    "100%", left: "50%", transform: "translateX(-50%)", marginTop:    "6px" },
    left:   { right:  "100%", top:  "50%", transform: "translateY(-50%)", marginRight:  "6px" },
    right:  { left:   "100%", top:  "50%", transform: "translateY(-50%)", marginLeft:   "6px" },
  };

  return (
    <div style={{ position: "relative", display: "inline-flex", ...style }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}>
      {children}
      {visible && (
        <div role="tooltip" style={{
          position:     "absolute",
          zIndex:       zIndex.tooltip,
          background:   color.charcoal,
          border:       `1px solid ${color.border}`,
          borderRadius: radius.sm,
          padding:      "5px 10px",
          fontSize:     "11px",
          color:        color.textSecondary,
          fontFamily:   font.body,
          whiteSpace:   "nowrap",
          boxShadow:    shadow.md,
          pointerEvents:"none",
          animation:    "cs-fade-in 0.1s ease",
          ...placementStyle[placement],
        }}>
          {label}
        </div>
      )}
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

export function StatCard({ label, value, sub, delta, icon, color: c, style, onClick }: {
  label:    string;
  value:    string | number;
  sub?:     string;
  delta?:   { value: string; positive: boolean };
  icon?:    string;
  color?:   string;
  style?:   React.CSSProperties;
  onClick?: () => void;
}) {
  const vc = c ?? color.orange;
  return (
    <div onClick={onClick} style={{ background: color.dark, border: `1px solid ${color.border}`, borderRadius: "10px", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "4px", ...style }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "10px", fontWeight: 700, color: color.textMuted, textTransform: "uppercase", letterSpacing: "0.09em", fontFamily: font.body }}>{label}</span>
        {icon && <span style={{ fontSize: "18px", opacity: 0.6 }}>{icon}</span>}
      </div>
      <div style={{ fontSize: "1.6rem", fontWeight: 800, color: vc, lineHeight: 1, fontFamily: font.body }}>{value}</div>
      {(sub || delta) && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {sub && <span style={{ fontSize: "11px", color: color.textMuted, fontFamily: font.body }}>{sub}</span>}
          {delta && (
            <span style={{ fontSize: "11px", fontWeight: 600, color: delta.positive ? color.success : color.error }}>
              {delta.positive ? "↑" : "↓"} {delta.value}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Timeline ──────────────────────────────────────────────────────────────────

interface TimelineItem {
  icon?:   string;
  title:   string;
  time?:   string;
  detail?: string;
  color?:  string;
}

export function Timeline({ items, style }: { items: TimelineItem[]; style?: React.CSSProperties }) {
  return (
    <div style={{ position: "relative", paddingLeft: "28px", ...style }}>
      <div style={{ position: "absolute", left: "9px", top: 0, bottom: 0, width: "2px", background: `linear-gradient(to bottom, ${color.border}, transparent)` }} />
      {items.map((item, i) => (
        <div key={i} style={{ position: "relative", marginBottom: "16px", paddingBottom: "4px" }}>
          <div style={{ position: "absolute", left: "-23px", top: "3px", width: "14px", height: "14px", borderRadius: "50%", background: color.dark, border: `2px solid ${item.color ?? color.orange}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "7px" }}>
            {item.icon && <span>{item.icon}</span>}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: color.textPrimary, fontFamily: font.body }}>{item.title}</span>
            {item.time && <span style={{ fontSize: "11px", color: color.textMuted, fontFamily: font.body, flexShrink: 0 }}>{item.time}</span>}
          </div>
          {item.detail && <div style={{ fontSize: "11px", color: color.textMuted, marginTop: "2px", fontFamily: font.body }}>{item.detail}</div>}
        </div>
      ))}
    </div>
  );
}
