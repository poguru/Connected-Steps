import React from "react";
import { color, radius, shadow, transition, font } from "./tokens";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize    = "xs" | "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:  ButtonVariant;
  size?:     ButtonSize;
  loading?:  boolean;
  icon?:     React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
  as?: "button" | "div";
}

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  xs: { padding: "4px 10px",  fontSize: "11px", height: "28px", gap: "4px"  },
  sm: { padding: "6px 14px",  fontSize: "13px", height: "34px", gap: "6px"  },
  md: { padding: "9px 20px",  fontSize: "14px", height: "42px", gap: "7px"  },
  lg: { padding: "12px 28px", fontSize: "15px", height: "50px", gap: "8px"  },
};

const variantBase: Record<ButtonVariant, React.CSSProperties> = {
  primary:   { background: "linear-gradient(135deg,#e8620a,#f07c2a)", color: "#fff",          border: "none",                              boxShadow: shadow.orange },
  secondary: { background: color.surface,                             color: color.textPrimary, border: `1px solid ${color.border}`          },
  outline:   { background: "transparent",                             color: color.orange,     border: `1px solid ${color.orangeBorder}`     },
  ghost:     { background: "transparent",                             color: color.textMuted,  border: "1px solid transparent"               },
  danger:    { background: color.errorBg,                             color: color.error,      border: `1px solid ${color.errorBorder}`      },
};

export function Button({
  variant   = "primary",
  size      = "md",
  loading   = false,
  icon,
  iconRight,
  fullWidth = false,
  disabled,
  children,
  style,
  onMouseEnter,
  onMouseLeave,
  ...rest
}: ButtonProps) {
  const [hovered, setHovered] = React.useState(false);

  const isDisabled = disabled || loading;

  const hoverOverlay: Record<ButtonVariant, React.CSSProperties> = {
    primary:   { filter: "brightness(1.1)" },
    secondary: { background: color.surfaceHover, borderColor: color.borderHover },
    outline:   { background: color.orangeMuted  },
    ghost:     { background: color.surface       },
    danger:    { background: "rgba(248,113,113,0.18)" },
  };

  const base: React.CSSProperties = {
    display:        "inline-flex",
    alignItems:     "center",
    justifyContent: "center",
    fontFamily:     font.body,
    fontWeight:     600,
    borderRadius:   radius.sm,
    cursor:         isDisabled ? "not-allowed" : "pointer",
    opacity:        isDisabled ? 0.5 : 1,
    transition:     transition.base,
    whiteSpace:     "nowrap",
    width:          fullWidth ? "100%" : undefined,
    userSelect:     "none",
    textDecoration: "none",
    letterSpacing:  "0.01em",
    ...variantBase[variant],
    ...sizeStyles[size],
    ...(hovered && !isDisabled ? hoverOverlay[variant] : {}),
    ...style,
  };

  return (
    <button
      {...rest}
      disabled={isDisabled}
      style={base}
      onMouseEnter={e => { setHovered(true);  onMouseEnter?.(e); }}
      onMouseLeave={e => { setHovered(false); onMouseLeave?.(e); }}
    >
      {loading ? (
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Spinner size={size} />
          {children}
        </span>
      ) : (
        <>
          {icon && <span style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>{icon}</span>}
          {children}
          {iconRight && <span style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>{iconRight}</span>}
        </>
      )}
    </button>
  );
}

function Spinner({ size }: { size: ButtonSize }) {
  const s = size === "xs" || size === "sm" ? 12 : 14;
  return (
    <span style={{
      width: s, height: s, borderRadius: "50%",
      border: "2px solid rgba(255,255,255,0.25)",
      borderTopColor: "#fff",
      animation: "cs-spin-kf .6s linear infinite",
      flexShrink: 0,
    }} />
  );
}
