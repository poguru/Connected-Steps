/**
 * Reusable layout templates.
 * These are pure structural components — no routing, no business logic.
 * Import and compose to build consistent page layouts.
 */
import React from "react";
import { color, font, maxWidth, zIndex } from "./tokens";

// ── Shared sticky header shell ────────────────────────────────────────────────

export function StickyHeader({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <header style={{
      position:    "sticky",
      top:         0,
      zIndex:      zIndex.sticky,
      height:      "56px",
      display:     "flex",
      alignItems:  "center",
      background:  "rgba(10,10,10,0.97)",
      borderBottom:`1px solid rgba(255,255,255,0.07)`,
      backdropFilter: "blur(12px)",
      padding:     "0 20px",
      gap:         "12px",
      fontFamily:  font.body,
      ...style,
    }}>
      {children}
    </header>
  );
}

// ── Auth Layout ───────────────────────────────────────────────────────────────
// Centred card on dark background — for login, register, OTP pages.

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: color.black, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: maxWidth.xs }}>
        {children}
      </div>
    </div>
  );
}

// ── Public Layout ─────────────────────────────────────────────────────────────
// Full-width page with no sidebar — homepage, events listing, pricing.

export function PublicLayout({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ minHeight: "100vh", background: color.black, color: "#fff", fontFamily: font.body, ...style }}>
      {children}
    </div>
  );
}

// ── Dashboard Layout ──────────────────────────────────────────────────────────
// Constrained content width, padded, with optional sidebar.

export function DashboardLayout({ children, sidebar, style }: { children: React.ReactNode; sidebar?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ minHeight: "100vh", background: color.black, color: "#fff", fontFamily: font.body }}>
      <div style={{ maxWidth: maxWidth.xl, margin: "0 auto", padding: "20px 20px 80px", display: sidebar ? "grid" : "block", gridTemplateColumns: sidebar ? "260px 1fr" : undefined, gap: sidebar ? "24px" : undefined, alignItems: "flex-start", ...style }}>
        {sidebar && <aside style={{ position: "sticky", top: "72px" }}>{sidebar}</aside>}
        <main>{children}</main>
      </div>
    </div>
  );
}

// ── Admin Layout content area ─────────────────────────────────────────────────
// Used inside app/admin/layout.tsx — provides consistent content padding.

export function AdminContent({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ padding: "24px 24px 80px", maxWidth: maxWidth.xl, margin: "0 auto", ...style }}>
      {children}
    </div>
  );
}

// ── Settings Layout ───────────────────────────────────────────────────────────
// Two-column: narrow nav sidebar + content.

export function SettingsLayout({ nav, children }: { nav: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "24px", maxWidth: maxWidth.lg, margin: "0 auto", padding: "24px 20px 80px" }}>
      <nav style={{ position: "sticky", top: "72px" }}>{nav}</nav>
      <main>{children}</main>
    </div>
  );
}

// ── Event Layout ──────────────────────────────────────────────────────────────
// Full-bleed hero + constrained content body.

export function EventLayout({ hero, children }: { hero: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: color.black, color: "#fff", fontFamily: font.body }}>
      {hero}
      <div style={{ maxWidth: maxWidth.lg, margin: "0 auto", padding: "0 20px 80px" }}>
        {children}
      </div>
    </div>
  );
}
