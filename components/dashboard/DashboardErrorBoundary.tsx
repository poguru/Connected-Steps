"use client";

import { unstable_catchError, type ErrorInfo } from "next/error";
import { useLayoutEffect } from "react";

// One silent auto-recovery attempt per browser session (module resets on full page reload).
// Prevents infinite retry loops if the error is persistent.
let _retryAttempted = false;

function DashboardErrorFallback(_props: {}, { error, unstable_retry }: ErrorInfo) {
  const willAutoRetry = !_retryAttempted;

  // useLayoutEffect fires before the browser paints, so the blank state
  // (return null below) is never visible to the user during auto-recovery.
  useLayoutEffect(() => {
    if (!_retryAttempted) {
      _retryAttempted = true;
      console.warn("[Dashboard] Caught render error, attempting silent recovery:", error?.message);
      unstable_retry();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // On the first error, render nothing while the auto-recovery is in flight.
  if (willAutoRetry) return null;

  // Persistent error after retry — show a user-facing error UI.
  return (
    <div
      style={{
        minHeight: "100svh",
        background: "var(--background)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "2.5rem" }}>⚠️</div>
      <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>Something went wrong</div>
      <div
        style={{
          fontSize: "0.85rem",
          color: "var(--muted-foreground, #6b7280)",
          maxWidth: "320px",
          lineHeight: 1.5,
        }}
      >
        Please reload the page. If the problem persists, log out and back in.
      </div>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: "11px 28px",
          background: "var(--gradient-accent, #e8620a)",
          color: "#fff",
          border: "none",
          borderRadius: 10,
          cursor: "pointer",
          fontWeight: 700,
          fontFamily: "inherit",
          fontSize: "0.9rem",
          boxShadow: "var(--shadow-orange, 0 4px 14px rgba(232,98,10,0.35))",
        }}
      >
        Reload
      </button>
    </div>
  );
}

export const DashboardErrorBoundary = unstable_catchError(DashboardErrorFallback);
