/**
 * Motion presets for the Connected Steps design system.
 * All values respect prefers-reduced-motion via globals.css.
 *
 * Usage (inline style):
 *   <div style={{ animation: motion.fadeUp }}>…</div>
 *
 * Usage (className):
 *   <div className="animate-fade-up">…</div>  ← already in globals.css
 */

export const motion = {
  // Entry animations — apply to element style.animation
  fadeIn:    "cs-fade-in 0.2s ease both",
  fadeUp:    "cs-slide-up 0.25s ease both",
  fadeUp1:   "cs-slide-up 0.25s ease 0.05s both",
  fadeUp2:   "cs-slide-up 0.25s ease 0.10s both",
  fadeUp3:   "cs-slide-up 0.25s ease 0.15s both",
  shimmer:   "cs-shimmer 1.4s ease-in-out infinite",
  spin:      "cs-spin-kf 0.7s linear infinite",
  modalOpen: "cs-fade-in 0.15s ease both",
  slideUp:   "cs-slide-up 0.18s ease both",
} as const;

/** Hover transforms — apply via onMouseEnter/onMouseLeave */
export const hover = {
  lift:       { transform: "translateY(-3px)" },
  liftSm:     { transform: "translateY(-1px)" },
  scale:      { transform: "scale(1.02)" },
  scaleSm:    { transform: "scale(1.01)" },
  scaleBtn:   { transform: "scale(1.03)" },
  brighten:   { filter: "brightness(1.1)" },
  none:       {},
} as const;

/** Transition presets — apply to style.transition */
export const ease = {
  fast:    "all 0.12s ease",
  base:    "all 0.20s ease",
  slow:    "all 0.35s ease",
  spring:  "all 0.3s cubic-bezier(0.34,1.56,0.64,1)",
  bounce:  "all 0.4s cubic-bezier(0.68,-0.55,0.265,1.55)",
} as const;
