import React from "react";
import { color, radius, shadow, transition } from "./tokens";

interface CardProps {
  children:    React.ReactNode;
  variant?:    "default" | "elevated" | "glass" | "orange";
  padding?:    "none" | "sm" | "md" | "lg";
  hoverable?:  boolean;
  onClick?:    () => void;
  style?:      React.CSSProperties;
  className?:  string;
}

const paddingMap = { none: "0", sm: "12px 16px", md: "20px 24px", lg: "28px 32px" };

const variantStyles: Record<string, React.CSSProperties> = {
  default:  { background: color.dark,    border: `1px solid ${color.border}` },
  elevated: { background: color.dark,    border: `1px solid ${color.border}`, boxShadow: shadow.md },
  glass:    { background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)", border: `1px solid ${color.border}` },
  orange:   { background: color.orangeMuted, border: `1px solid ${color.orangeBorder}` },
};

export function Card({ children, variant = "default", padding = "md", hoverable = false, onClick, style, className }: CardProps) {
  const [hovered, setHovered] = React.useState(false);

  return (
    <div
      className={className}
      onClick={onClick}
      onMouseEnter={() => hoverable && setHovered(true)}
      onMouseLeave={() => hoverable && setHovered(false)}
      style={{
        borderRadius:  radius.lg,
        overflow:      "hidden",
        padding:       paddingMap[padding],
        transition:    hoverable ? transition.base : undefined,
        cursor:        onClick ? "pointer" : undefined,
        ...variantStyles[variant],
        ...(hoverable && hovered ? {
          borderColor: color.borderHover,
          transform:   "translateY(-2px)",
          boxShadow:   shadow.md,
        } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ borderBottom: `1px solid ${color.border}`, padding: "14px 20px", ...style }}>
      {children}
    </div>
  );
}

export function CardBody({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ padding: "16px 20px", ...style }}>{children}</div>;
}

export function CardFooter({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ borderTop: `1px solid ${color.border}`, padding: "12px 20px", ...style }}>
      {children}
    </div>
  );
}
