"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function UnauthorizedContent() {
  const params = useSearchParams();
  const from   = params.get("from") ?? "";

  // Attempt to detect which portal they were heading to so we show the right
  // "log in with a different account" suggestion.
  const isAdminPath = from.startsWith("/admin") || from.startsWith("/analytics") || from.startsWith("/payments");
  const isCoachPath = from.startsWith("/coach");

  return (
    <div style={{
      minHeight:       "100vh",
      display:         "flex",
      alignItems:      "center",
      justifyContent:  "center",
      background:      "var(--background, #0a0a0a)",
      padding:         "2rem",
    }}>
      <div style={{
        maxWidth:       "420px",
        width:          "100%",
        textAlign:      "center",
      }}>
        {/* Icon */}
        <div style={{ fontSize: "3.5rem", marginBottom: "1.25rem", lineHeight: 1 }}>
          🔒
        </div>

        {/* Heading */}
        <h1 style={{
          fontSize:     "1.5rem",
          fontWeight:   700,
          color:        "var(--foreground, #fff)",
          marginBottom: "0.75rem",
          fontFamily:   "var(--font-display, inherit)",
        }}>
          Access denied
        </h1>

        {/* Body */}
        <p style={{
          fontSize:     "0.925rem",
          color:        "var(--muted-foreground, rgba(255,255,255,0.55))",
          lineHeight:   1.6,
          marginBottom: "2rem",
        }}>
          {isAdminPath
            ? "This page is restricted to administrators. Please log in with an admin account."
            : isCoachPath
              ? "This page is for coaches only. If you are a coach, please log in with your coach account."
              : "You don’t have permission to view this page. If you think this is a mistake, please contact support."}
        </p>

        {/* Actions */}
        <div style={{
          display:        "flex",
          flexDirection:  "column",
          gap:            "0.75rem",
        }}>
          {isAdminPath ? (
            <Link href="/admin/login" style={btnStyle("primary")}>
              Log in as admin
            </Link>
          ) : isCoachPath ? (
            <Link href="/coach/login" style={btnStyle("primary")}>
              Log in as coach
            </Link>
          ) : (
            <Link href="/dashboard" style={btnStyle("primary")}>
              Go to my dashboard
            </Link>
          )}

          <Link href="/" style={btnStyle("ghost")}>
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}

function btnStyle(variant: "primary" | "ghost"): React.CSSProperties {
  return variant === "primary" ? {
    display:        "block",
    padding:        "12px 24px",
    borderRadius:   "10px",
    background:     "var(--gradient-accent, #e8620a)",
    color:          "#fff",
    fontWeight:     700,
    fontSize:       "0.9rem",
    textDecoration: "none",
    textAlign:      "center",
  } : {
    display:        "block",
    padding:        "12px 24px",
    borderRadius:   "10px",
    border:         "1px solid rgba(255,255,255,0.12)",
    color:          "var(--muted-foreground, rgba(255,255,255,0.55))",
    fontSize:       "0.875rem",
    textDecoration: "none",
    textAlign:      "center",
  };
}

export default function UnauthorizedPage() {
  return (
    <Suspense>
      <UnauthorizedContent />
    </Suspense>
  );
}
