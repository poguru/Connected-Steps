import React from "react";
import { color, font } from "./tokens";

// Page title (h1 equivalent)
export function PageTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <h1 style={{ margin: 0, fontSize: "clamp(1.5rem, 3vw, 2rem)", fontWeight: 700, color: color.textPrimary, fontFamily: font.body, lineHeight: 1.2, ...style }}>
      {children}
    </h1>
  );
}

// Section heading (h2)
export function SectionTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: color.textPrimary, fontFamily: font.body, ...style }}>
      {children}
    </h2>
  );
}

// Micro label (all-caps, orange)
export function Label({ children, style, color: c }: { children: React.ReactNode; style?: React.CSSProperties; color?: string }) {
  return (
    <div style={{ fontSize: "10px", fontWeight: 700, color: c ?? color.orange, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: font.body, ...style }}>
      {children}
    </div>
  );
}

// Body text
export function Text({ children, size = "md", muted = false, style }: { children: React.ReactNode; size?: "sm" | "md" | "lg"; muted?: boolean; style?: React.CSSProperties }) {
  const sizes = { sm: "12px", md: "14px", lg: "16px" };
  return (
    <p style={{ margin: 0, fontSize: sizes[size], color: muted ? color.textMuted : color.textSecondary, fontFamily: font.body, lineHeight: 1.6, ...style }}>
      {children}
    </p>
  );
}

// Display headline (Cormorant Garamond)
export function Display({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span style={{ fontFamily: font.display, fontWeight: 300, color: color.textPrimary, ...style }}>
      {children}
    </span>
  );
}
