import React from "react";
import { color, radius, font } from "./tokens";

export type BadgeColor = "orange" | "green" | "red" | "yellow" | "blue" | "purple" | "gray";
export type BadgeSize  = "xs" | "sm" | "md";

const colorMap: Record<BadgeColor, { bg: string; text: string; border: string }> = {
  orange: { bg: color.orangeMuted,  text: color.orange,   border: color.orangeBorder  },
  green:  { bg: color.successBg,    text: color.success,   border: color.successBorder },
  red:    { bg: color.errorBg,      text: color.error,     border: color.errorBorder   },
  yellow: { bg: color.warningBg,    text: color.warning,   border: color.warningBorder },
  blue:   { bg: color.infoBg,       text: color.info,      border: color.infoBorder    },
  purple: { bg: "rgba(167,139,250,0.12)", text: "#a78bfa", border: "rgba(167,139,250,0.3)" },
  gray:   { bg: color.surface,       text: color.textMuted, border: color.border        },
};

const sizeMap: Record<BadgeSize, React.CSSProperties> = {
  xs: { fontSize: "9px",  padding: "1px 6px",  fontWeight: 700 },
  sm: { fontSize: "10px", padding: "2px 8px",  fontWeight: 700 },
  md: { fontSize: "11px", padding: "3px 10px", fontWeight: 700 },
};

interface BadgeProps {
  children:  React.ReactNode;
  color?:    BadgeColor;
  size?:     BadgeSize;
  dot?:      boolean;
  style?:    React.CSSProperties;
}

export function Badge({ children, color: c = "gray", size = "sm", dot = false, style }: BadgeProps) {
  const { bg, text, border } = colorMap[c];
  return (
    <span style={{
      display:       "inline-flex",
      alignItems:    "center",
      gap:           dot ? 5 : 0,
      background:    bg,
      color:         text,
      border:        `1px solid ${border}`,
      borderRadius:  radius.full,
      textTransform: "uppercase" as const,
      letterSpacing: "0.07em",
      fontFamily:    font.body,
      whiteSpace:    "nowrap",
      ...sizeMap[size],
      ...style,
    }}>
      {dot && <span style={{ width: 5, height: 5, borderRadius: "50%", background: text, flexShrink: 0 }} />}
      {children}
    </span>
  );
}

// Status badge shorthand
interface StatusBadgeProps { status: string; style?: React.CSSProperties }

export function StatusBadge({ status, style }: StatusBadgeProps) {
  const lower = status.toLowerCase();
  const c: BadgeColor =
    lower.includes("paid") || lower.includes("confirm") || lower.includes("active") || lower.includes("success") ? "green" :
    lower.includes("pend")  || lower.includes("await")   || lower.includes("process")  ? "yellow" :
    lower.includes("cancel") || lower.includes("fail")   || lower.includes("error")    ? "red"    :
    lower.includes("draft")  || lower.includes("archive")                              ? "gray"   :
    lower.includes("live")   || lower.includes("open")                                 ? "orange" : "gray";

  return <Badge color={c} dot style={style}>{status}</Badge>;
}
