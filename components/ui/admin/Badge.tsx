import React from "react";

export type BadgeVariant = "green" | "red" | "yellow" | "blue" | "purple" | "orange" | "gray";

const COLORS: Record<BadgeVariant, { text: string; bg: string; border: string }> = {
  green:  { text: "#4ade80", bg: "rgba(74,222,128,0.10)",   border: "rgba(74,222,128,0.25)"   },
  red:    { text: "#f87171", bg: "rgba(248,113,113,0.10)",  border: "rgba(248,113,113,0.25)"  },
  yellow: { text: "#fbbf24", bg: "rgba(251,191,36,0.10)",   border: "rgba(251,191,36,0.25)"   },
  blue:   { text: "#60a5fa", bg: "rgba(96,165,250,0.10)",   border: "rgba(96,165,250,0.25)"   },
  purple: { text: "#a78bfa", bg: "rgba(167,139,250,0.10)",  border: "rgba(167,139,250,0.25)"  },
  orange: { text: "#e8620a", bg: "rgba(232,98,10,0.10)",    border: "rgba(232,98,10,0.25)"    },
  gray:   { text: "#888",    bg: "rgba(255,255,255,0.06)",   border: "rgba(255,255,255,0.12)"  },
};

interface BadgeProps {
  label:    string;
  variant?: BadgeVariant;
  dot?:     boolean;
  size?:    "xs" | "sm";
}

export function Badge({ label, variant = "gray", dot = false, size = "sm" }: BadgeProps) {
  const c = COLORS[variant];
  return (
    <span style={{
      display:       "inline-flex",
      alignItems:    "center",
      gap:           4,
      padding:       size === "xs" ? "1px 6px" : "3px 10px",
      borderRadius:  999,
      fontSize:      size === "xs" ? 9 : 10,
      fontWeight:    700,
      textTransform: "uppercase" as const,
      letterSpacing: ".06em",
      background:    c.bg,
      color:         c.text,
      border:        `1px solid ${c.border}`,
      whiteSpace:    "nowrap" as const,
    }}>
      {dot && <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.text, flexShrink: 0 }} />}
      {label}
    </span>
  );
}
