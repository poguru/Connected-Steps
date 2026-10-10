"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { publishBottomBarHeight } from "@/lib/bottom-bar";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!localStorage.getItem("cs_cookie_consent")) setVisible(true);
  }, []);

  // Other bottom controls clear this banner's height (see lib/bottom-bar.ts)
  useEffect(() => publishBottomBarHeight(visible ? ref.current : null, "--cookie-banner-h"), [visible]);

  function accept() {
    localStorage.setItem("cs_cookie_consent", "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div ref={ref} style={{
      position:     "fixed",
      bottom:       0,
      left:         0,
      right:        0,
      zIndex:       1000,
      background:   "rgba(17,17,17,0.97)",
      backdropFilter: "blur(12px)",
      borderTop:    "1px solid rgba(255,255,255,0.08)",
      padding:      "1rem 1.5rem",
      display:      "flex",
      alignItems:   "center",
      justifyContent: "space-between",
      gap:          "1rem",
      flexWrap:     "wrap",
    }}>
      <p style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.6)", margin: 0, lineHeight: 1.6, maxWidth: "680px" }}>
        We use local storage to keep you signed in and remember your preferences. No tracking cookies, no ad networks.{" "}
        <Link href="/cookies" style={{ color: "var(--cs-orange)", textDecoration: "none" }}>Cookie policy</Link>
        {" "}·{" "}
        <Link href="/privacy" style={{ color: "var(--cs-orange)", textDecoration: "none" }}>Privacy policy</Link>
      </p>
      <button
        onClick={accept}
        style={{
          flexShrink:   0,
          padding:      "9px 24px",
          background:   "var(--cs-orange)",
          color:        "#fff",
          border:       "none",
          borderRadius: "6px",
          fontSize:     "0.8rem",
          fontWeight:   700,
          cursor:       "pointer",
          fontFamily:   "var(--font-body)",
          whiteSpace:   "nowrap",
        }}
      >
        Got it
      </button>
    </div>
  );
}
