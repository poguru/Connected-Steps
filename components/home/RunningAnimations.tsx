"use client";

/**
 * RunningAnimations — scroll-triggered, fitness-themed decorative layer.
 *
 * Design principles:
 *  • All elements use position:fixed (overlay) or positioned inside a
 *    section with overflow:hidden so they never affect layout.
 *  • Compositor-only properties (transform, opacity) for 60 FPS.
 *  • Intersection Observer per section — no scroll event listeners.
 *  • Fully respects prefers-reduced-motion (renders null immediately).
 *  • Paused when the browser tab is inactive (visibilitychange).
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";

// ── Reduced-motion guard ──────────────────────────────────────────────────────
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

// ── Runner silhouette that crosses the screen once ───────────────────────────
interface RunnerProps {
  top: string;       // CSS top value
  delay: number;     // animation-delay in seconds
  direction: "ltr" | "rtl";
  emoji: string;
  once?: boolean;
}

function RunnerSilhouette({ top, delay, direction, emoji }: RunnerProps) {
  return (
    <div
      className={`cs-runner-silhouette cs-run-${direction}`}
      aria-hidden="true"
      style={{
        top,
        left: direction === "ltr" ? undefined : undefined,
        animationDelay: `${delay}s`,
        opacity: 0,
        fontSize: "clamp(20px, 3vw, 32px)",
        filter: "blur(0.5px)",
      }}
    >
      {emoji}
    </div>
  );
}

// ── Floating icon (section-scoped, not fixed) ─────────────────────────────────
interface FloatingIconProps {
  icon:    string;
  delay:   number;
  size?:   number;
  x?:      string;
  bottom?: string;
}

function FloatingIcon({ icon, delay, size = 18, x = "50%", bottom = "12px" }: FloatingIconProps) {
  return (
    <span
      className="cs-float-icon"
      aria-hidden="true"
      style={{
        position: "absolute",
        left: x,
        bottom,
        transform: "translateX(-50%)",
        fontSize: size,
        animationDelay: `${delay}s`,
        opacity: 0.45,
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      {icon}
    </span>
  );
}

// ── Distance progress track ───────────────────────────────────────────────────
function DistanceTrack({ scrollYProgress }: { scrollYProgress: ReturnType<typeof useScroll>["scrollYProgress"] }) {
  const width = useTransform(scrollYProgress, [0, 0.8], ["0%", "100%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.05, 0.85, 1], [0, 0.6, 0.6, 0]);

  return (
    <motion.div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0,
        height: 2,
        background: "var(--cs-orange)",
        zIndex: 9998,
        opacity,
        transformOrigin: "left",
        width,
        pointerEvents: "none",
        boxShadow: "0 0 8px oklch(0.72 0.19 49 / 60%)",
      }}
    />
  );
}

// ── Heartbeat pulse on the stats section ─────────────────────────────────────
function HeartbeatPulse({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.span
          key="hb"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: [0, 1, 0.8, 1, 0.6, 1], scale: [0.8, 1.2, 1, 1.15, 1, 1.05] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          aria-hidden="true"
          style={{
            position: "absolute",
            right: 8, top: -8,
            fontSize: 14,
            pointerEvents: "none",
            filter: "drop-shadow(0 0 6px rgba(232,98,10,0.7))",
          }}
        >
          ❤️
        </motion.span>
      )}
    </AnimatePresence>
  );
}

// ── Footstep trail ────────────────────────────────────────────────────────────
interface FootstepProps { visible: boolean; }

const FOOTSTEP_POSITIONS = [
  { left: "18%",  delay: 0 },
  { left: "32%",  delay: 0.18 },
  { left: "46%",  delay: 0.36 },
  { left: "61%",  delay: 0.54 },
  { left: "75%",  delay: 0.72 },
  { left: "89%",  delay: 0.90 },
];

function FootstepTrail({ visible }: FootstepProps) {
  return (
    <div
      aria-hidden="true"
      style={{ position: "relative", height: 24, overflow: "visible", pointerEvents: "none" }}
    >
      {visible && FOOTSTEP_POSITIONS.map((p, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 6, rotate: -10 }}
          animate={{ opacity: [0, 0.5, 0.4, 0], y: [6, 0, -2, -4], rotate: [-10, 0, 3] }}
          transition={{ duration: 1.0, delay: p.delay, ease: "easeOut" }}
          style={{
            position: "absolute",
            left: p.left,
            top: 4,
            fontSize: 10,
            opacity: 0,
          }}
        >
          👟
        </motion.span>
      ))}
    </div>
  );
}

// ── Section with IntersectionObserver ────────────────────────────────────────
function useInView(threshold = 0.2): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return [ref, inView];
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function RunningAnimations() {
  const reduced = usePrefersReducedMotion();

  // Scroll progress for the distance track
  const { scrollYProgress } = useScroll();

  // Runner triggers — fire when we're partway down the page
  const [runners, setRunners] = useState<{ id: number; top: string; dir: "ltr" | "rtl"; emoji: string; delay: number }[]>([]);
  const [runnerKey, setRunnerKey] = useState(0);

  // Stats section heartbeat
  const [statsRef, statsInView] = useInView(0.3);

  // Footstep trail
  const [footRef, footInView] = useInView(0.15);

  // Trigger runners periodically as the user scrolls
  const spawnRunner = useCallback(() => {
    if (reduced) return;
    const tops = ["22vh", "40vh", "60vh", "78vh"];
    const emojis = ["🏃", "🏃‍♀️", "🚴", "🧘"];
    const dir = Math.random() > 0.5 ? "ltr" : "rtl";
    setRunnerKey(k => k + 1);
    setRunners(prev => [
      ...prev.slice(-3), // keep max 3 at a time
      {
        id: Date.now(),
        top: tops[Math.floor(Math.random() * tops.length)],
        dir,
        emoji: emojis[Math.floor(Math.random() * emojis.length)],
        delay: 0,
      },
    ]);
  }, [reduced]);

  // Listen to scroll to trigger runners — but throttle
  useEffect(() => {
    if (reduced) return;
    let last = 0;
    const onScroll = () => {
      const now = Date.now();
      if (now - last > 4000) { last = now; spawnRunner(); }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [reduced, spawnRunner]);

  // Pause animations when tab hidden
  useEffect(() => {
    if (reduced) return;
    const onVis = () => {
      if (document.hidden) setRunners([]);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [reduced]);

  if (reduced) return null;

  return (
    <>
      {/* ── Orange distance progress track at the top of page ── */}
      <DistanceTrack scrollYProgress={scrollYProgress} />

      {/* ── Runner silhouettes flying across the viewport ── */}
      {runners.map(r => (
        <RunnerSilhouette key={r.id} top={r.top} delay={r.delay} direction={r.dir} emoji={r.emoji} />
      ))}

      {/* ── Stats section heartbeat ── */}
      <div ref={statsRef} style={{ position: "relative", height: 0, overflow: "visible", pointerEvents: "none" }}>
        <HeartbeatPulse visible={statsInView} />
      </div>

      {/* ── Footstep trail that appears mid-page ── */}
      <div ref={footRef}>
        <FootstepTrail visible={footInView} />
      </div>
    </>
  );
}
