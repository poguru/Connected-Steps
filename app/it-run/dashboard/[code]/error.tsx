"use client";

import { useEffect } from "react";
import Link from "next/link";

// Error boundary for the participant dashboard only. A render exception shows the dashboard's own
// recovery options instead of the site-wide error screen. The raw message is not shown to the
// participant; only the error name and digest are logged so the cause can be found server-side.

export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[it-run/dashboard] render failed:", error.name, error.digest ?? "no-digest");
  }, [error]);

  const ACCENT = "#e8620a";
  const button = {
    display: "inline-block", padding: "11px 18px", borderRadius: 10, fontWeight: 700, fontSize: 14,
    textDecoration: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
  } as const;

  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div role="alert" style={{ maxWidth: 420, textAlign: "center" }}>
        <div style={{ fontSize: 15, color: "#f87171", lineHeight: 1.6, marginBottom: 6 }}>
          We couldn&apos;t load your dashboard right now.
        </div>
        <div style={{ fontSize: 14, color: "#ccc", lineHeight: 1.6, marginBottom: 20 }}>
          Your registration has not been changed. Please try again.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => unstable_retry()} style={{ ...button, background: ACCENT, color: "#fff" }}>Try again</button>
          <Link href="/auth" style={{ ...button, background: "rgba(255,255,255,0.08)", color: "#fff" }}>Sign in</Link>
          <Link href="/it-run" style={{ ...button, background: "transparent", border: `1px solid ${ACCENT}`, color: ACCENT }}>IT Run event page</Link>
        </div>
        {error.digest && (
          <div style={{ fontSize: 11, color: "#555", marginTop: 16, fontFamily: "monospace" }}>Reference: {error.digest}</div>
        )}
      </div>
    </div>
  );
}
