"use client";

import Link from "next/link";

const CARDS = [
  {
    href:        "/admin/developer/api-keys",
    icon:        "🔑",
    title:       "API Keys",
    description: "Create and manage keys for programmatic access to your organization's data via the v1 REST API.",
    badge:       "REST API",
  },
  {
    href:        "/admin/developer/webhooks",
    icon:        "📡",
    title:       "Webhooks",
    description: "Subscribe to real-time events (payment, registration, check-in) and receive signed HTTP POST deliveries.",
    badge:       "Real-time",
  },
  {
    href:        "/admin/developer/import",
    icon:        "📥",
    title:       "Import / Export",
    description: "Bulk-import participants, registrations, coupons, and more via CSV with inline validation.",
    badge:       "CSV",
  },
  {
    href:        "/admin/developer/automations",
    icon:        "⚡",
    title:       "Automations",
    description: "Trigger actions automatically when events occur — send webhooks, notify the team, or generate certificates.",
    badge:       "Rules",
  },
  {
    href:        "/admin/developer/docs",
    icon:        "📚",
    title:       "API Reference",
    description: "Interactive documentation for every v1 endpoint, with request/response examples and authentication guide.",
    badge:       "Docs",
  },
  {
    href:        "/admin/developer/monitoring",
    icon:        "📊",
    title:       "Monitoring",
    description: "Track API usage, webhook delivery health, error rates, and per-key request counts.",
    badge:       "Observability",
  },
];

const S: Record<string, React.CSSProperties> = {
  page:   { padding: "32px 24px", maxWidth: 960, margin: "0 auto" },
  hero:   { marginBottom: 32 },
  title:  { fontSize: "1.6rem", fontWeight: 700, color: "#fff", margin: 0 },
  sub:    { color: "rgba(255,255,255,0.55)", fontSize: "0.9rem", marginTop: 8 },
  grid:   { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 },
  card:   { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "24px 20px", textDecoration: "none", display: "block", transition: "background 0.15s" },
  cIcon:  { fontSize: "1.8rem", marginBottom: 12 },
  ctitle: { fontSize: "1rem", fontWeight: 600, color: "#fff", margin: 0 },
  cdesc:  { fontSize: "0.82rem", color: "rgba(255,255,255,0.55)", marginTop: 6, lineHeight: 1.5 },
  badge:  { display: "inline-block", marginTop: 12, fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.04em", padding: "2px 8px", borderRadius: 99, background: "rgba(99,102,241,0.2)", color: "#a5b4fc" },
};

export default function DeveloperHomePage() {
  return (
    <div style={S.page}>
      <div style={S.hero}>
        <h1 style={S.title}>Developer Platform</h1>
        <p style={S.sub}>
          Connect Connected Steps with your external systems. Access data via REST API, receive real-time events via webhooks,
          bulk-import records via CSV, and automate actions with rule-based triggers — all secured at the organization level.
        </p>
      </div>

      <div style={S.grid}>
        {CARDS.map(c => (
          <Link key={c.href} href={c.href} style={S.card}>
            <div style={S.cIcon}>{c.icon}</div>
            <div style={S.ctitle}>{c.title}</div>
            <div style={S.cdesc}>{c.description}</div>
            <div style={S.badge}>{c.badge}</div>
          </Link>
        ))}
      </div>

      <div style={{ marginTop: 40, padding: "20px 24px", background: "rgba(255,255,255,0.03)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ fontWeight: 600, color: "#fff", marginBottom: 8 }}>Base URL</div>
        <code style={{ fontSize: "0.85rem", color: "#a5b4fc" }}>https://connectedsteps.in/api/v1</code>
        <div style={{ marginTop: 12, fontSize: "0.82rem", color: "rgba(255,255,255,0.5)" }}>
          Authenticate with <code style={{ color: "#fbbf24" }}>Authorization: Bearer {"<api-key>"}</code> or <code style={{ color: "#fbbf24" }}>X-API-Key: {"<api-key>"}</code>
        </div>
      </div>
    </div>
  );
}
