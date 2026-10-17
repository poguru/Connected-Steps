"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { FEATURED_EVENT, FEATURED_EVENT_VISIBLE, POPUP_SEEN_KEY, popupAllowedOnPath } from "@/lib/it-run-featured";

// Fallback for browsers that block sessionStorage: shown at most once per full page load
let shownThisPageLoad = false;

function alreadySeenThisSession(): boolean {
  try {
    return sessionStorage.getItem(POPUP_SEEN_KEY) === "1";
  } catch {
    return shownThisPageLoad;
  }
}

function markSeen() {
  shownThisPageLoad = true;
  try { sessionStorage.setItem(POPUP_SEEN_KEY, "1"); } catch { /* storage blocked: the module flag applies */ }
}

/**
 * The IT Run Sprint-2 announcement. Shown once per browsing session on public pages. Not shown on sign-in, dashboards,
 * checkout, payment or registration routes. Dismissing it keeps it closed for the rest of the session.
 */
export default function FlagshipPopup() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  // Decide after mount (no server/client mismatch). Re-checked on each route change, but shown at most once per session.
  useEffect(() => {
    setOpen(false);
    if (!FEATURED_EVENT_VISIBLE || !popupAllowedOnPath(pathname)) return;
    if (alreadySeenThisSession()) return;
    const timer = window.setTimeout(() => {
      if (alreadySeenThisSession()) return;
      returnFocusTo.current = document.activeElement as HTMLElement | null;
      markSeen();
      setOpen(true);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  // Scroll lock and focus handling while open. It stays open until Register Now or Cancel is tapped.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      returnFocusTo.current?.focus?.();
    };
    // close is stable for this component's purpose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    setOpen(false);
  }

  if (!open) return null;

  return (
    <>
      <style>{`
        @keyframes csFlagshipIn { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: none; } }
        .cs-flagship-card { animation: csFlagshipIn 0.35s ease-out both; }
        @media (prefers-reduced-motion: reduce) { .cs-flagship-card { animation: none; } }
      `}</style>
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.78)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="flagship-popup-title"
          className="cs-flagship-card"
          style={{
            position: "relative", width: "100%", maxWidth: 440, maxHeight: "calc(100vh - 32px)", overflowY: "auto",
            background: "linear-gradient(160deg, rgba(249,115,22,0.16), rgba(0,0,0,0) 55%), #0b0b0b",
            border: "1px solid rgba(249,115,22,0.4)", borderRadius: 16, padding: "28px 22px 22px", color: "#fff",
            boxSizing: "border-box",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <Image src={FEATURED_EVENT.logo} alt="" width={240} height={135}
              style={{ width: "70%", maxWidth: 240, height: "auto", margin: "0 auto 12px" }} />
            <div style={{ fontSize: 11, color: "#f97316", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase" }}>
              Flagship event
            </div>
            <h2 id="flagship-popup-title" style={{ fontSize: 24, fontWeight: 800, margin: "6px 0 4px", lineHeight: 1.15 }}>
              {FEATURED_EVENT.name} {FEATURED_EVENT.edition}
            </h2>
            <p style={{ fontSize: 15, color: "#f97316", fontStyle: "italic", margin: "0 0 10px" }}>{FEATURED_EVENT.tagline}</p>
            <p style={{ fontSize: 14, color: "#d4d4d4", fontWeight: 600, margin: "0 0 8px" }}>{FEATURED_EVENT.dateLabel}</p>
            <p style={{ fontSize: 13, color: "#a3a3a3", lineHeight: 1.6, margin: "0 0 18px" }}>
              A flagship running experience by Connected Steps. Choose your category and take your next step.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Link href={FEATURED_EVENT.href} onClick={close} style={{
              background: "#f97316", color: "#fff", fontWeight: 700, fontSize: 15, textAlign: "center",
              padding: "13px 18px", borderRadius: 10, textDecoration: "none",
            }}>
              Register Now →
            </Link>
            <button ref={closeRef} type="button" onClick={close} style={{
              background: "transparent", border: "none", color: "#a3a3a3", fontSize: 14, padding: "8px",
              cursor: "pointer", fontFamily: "inherit",
            }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
