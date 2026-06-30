/**
 * Design Tokens — single source of truth for the Connected Steps design system.
 * All values reference CSS variables defined in globals.css.
 * Use these in React inline styles instead of hardcoding hex values.
 */

export const color = {
  // Brand
  orange:        "var(--cs-orange)",
  orangeLight:   "#ff7a24",
  orangeMuted:   "rgba(232,98,10,0.12)",
  orangeBorder:  "rgba(232,98,10,0.25)",
  orangeGlow:    "rgba(232,98,10,0.15)",

  // Backgrounds
  black:         "#0a0a0a",
  dark:          "#111111",
  charcoal:      "#1a1a1a",
  surface:       "rgba(255,255,255,0.04)",
  surfaceHover:  "rgba(255,255,255,0.07)",
  surfaceActive: "rgba(255,255,255,0.10)",

  // Borders
  border:        "rgba(255,255,255,0.08)",
  borderHover:   "rgba(255,255,255,0.14)",
  borderFocus:   "rgba(232,98,10,0.5)",

  // Text
  textPrimary:   "#ffffff",
  textSecondary: "rgba(255,255,255,0.7)",
  textMuted:     "rgba(255,255,255,0.45)",
  textDisabled:  "rgba(255,255,255,0.25)",

  // Semantic
  success:       "#4ade80",
  successBg:     "rgba(74,222,128,0.10)",
  successBorder: "rgba(74,222,128,0.25)",
  warning:       "#fbbf24",
  warningBg:     "rgba(251,191,36,0.10)",
  warningBorder: "rgba(251,191,36,0.25)",
  error:         "#f87171",
  errorBg:       "rgba(248,113,113,0.10)",
  errorBorder:   "rgba(248,113,113,0.25)",
  info:          "#60a5fa",
  infoBg:        "rgba(96,165,250,0.10)",
  infoBorder:    "rgba(96,165,250,0.25)",
} as const;

export const radius = {
  sm:   "6px",
  md:   "10px",
  lg:   "14px",
  xl:   "20px",
  full: "999px",
} as const;

export const shadow = {
  sm:     "0 1px 3px rgba(0,0,0,0.4)",
  md:     "0 4px 16px rgba(0,0,0,0.4)",
  lg:     "0 8px 32px rgba(0,0,0,0.5)",
  orange: "0 4px 20px rgba(232,98,10,0.35)",
  card:   "0 2px 8px rgba(0,0,0,0.3)",
} as const;

export const font = {
  display: "var(--font-cormorant), Georgia, serif",
  body:    "var(--font-dm-sans), system-ui, sans-serif",
} as const;

export const transition = {
  fast:   "all 0.12s ease",
  base:   "all 0.2s ease",
  slow:   "all 0.35s ease",
} as const;

export const spacing = {
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
  16: "64px",
} as const;
