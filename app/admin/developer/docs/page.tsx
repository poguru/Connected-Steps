"use client";

import { useState } from "react";

interface Endpoint {
  method: string; path: string; auth: string; description: string;
  params?: { name: string; type: string; required?: boolean; note?: string }[];
  response: string;
}

const ENDPOINTS: { section: string; items: Endpoint[] }[] = [
  {
    section: "Events",
    items: [
      { method: "GET", path: "/api/v1/events", auth: "events:read", description: "List events for your organization", params: [{ name: "page", type: "number" }, { name: "per_page", type: "number", note: "max 100" }, { name: "status", type: "string", note: "upcoming | past | live | draft" }, { name: "date_from", type: "date" }, { name: "date_to", type: "date" }], response: '{ "data": [...], "meta": { "total": 42, "page": 1, "per_page": 25, "pages": 2 } }' },
      { method: "GET", path: "/api/v1/events/:id", auth: "events:read", description: "Get a single event with race categories", response: '{ "data": { "id": "...", "title": "...", "event_races": [...] } }' },
      { method: "GET", path: "/api/v1/events/:id/registrations", auth: "registrations:read", description: "List registrations for a specific event", response: '{ "data": [...], "meta": { ... } }' },
    ],
  },
  {
    section: "Registrations",
    items: [
      { method: "GET", path: "/api/v1/registrations", auth: "registrations:read", description: "List all registrations across your events", params: [{ name: "status", type: "string" }, { name: "payment_status", type: "string" }], response: '{ "data": [...], "meta": { ... } }' },
      { method: "GET", path: "/api/v1/registrations/:id", auth: "registrations:read", description: "Get a single registration with event + participants", response: '{ "data": { ..., "events": {...}, "event_participants": [...] } }' },
    ],
  },
  {
    section: "Participants",
    items: [
      { method: "GET", path: "/api/v1/participants", auth: "participants:read", description: "List all participants across your events", response: '{ "data": [...], "meta": { ... } }' },
    ],
  },
  {
    section: "Memberships",
    items: [
      { method: "GET", path: "/api/v1/memberships", auth: "memberships:read", description: "List memberships for your organization", params: [{ name: "status", type: "string" }, { name: "plan", type: "string" }], response: '{ "data": [...], "meta": { ... } }' },
    ],
  },
  {
    section: "Merchandise",
    items: [
      { method: "GET", path: "/api/v1/merchandise/products", auth: "merchandise:read", description: "List merchandise products with variants", response: '{ "data": [...], "meta": { ... } }' },
    ],
  },
  {
    section: "Finance",
    items: [
      { method: "GET", path: "/api/v1/finance/summary", auth: "finance:read", description: "Revenue summary for your organization", response: '{ "data": { "total_revenue_inr": 100000, "total_refunds_inr": 5000, "net_revenue_inr": 95000, "total_registrations": 250 } }' },
    ],
  },
];

const METHOD_COLOR: Record<string, string> = { GET: "#34d399", POST: "#60a5fa", PATCH: "#fbbf24", DELETE: "#f87171", PUT: "#a78bfa" };

const S: Record<string, React.CSSProperties> = {
  page:  { padding: "28px 24px", maxWidth: 860, margin: "0 auto" },
  title: { fontSize: "1.3rem", fontWeight: 700, color: "#fff", margin: "0 0 6px" },
  sub:   { color: "rgba(255,255,255,0.45)", fontSize: "0.85rem", marginBottom: 28 },
  sec:   { marginBottom: 28 },
  shd:   { fontWeight: 600, color: "rgba(255,255,255,0.7)", fontSize: "0.88rem", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid rgba(255,255,255,0.07)" },
  ep:    { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, marginBottom: 8, overflow: "hidden" },
  epH:   { display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer" },
  badge: { fontSize: "0.72rem", fontWeight: 700, padding: "2px 8px", borderRadius: 4, fontFamily: "monospace", letterSpacing: "0.04em" } as React.CSSProperties,
  path:  { fontFamily: "monospace", fontSize: "0.85rem", color: "#e2e8f0", flex: 1 },
  desc:  { fontSize: "0.78rem", color: "rgba(255,255,255,0.45)" },
  body:  { padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.2)" },
  pre:   { fontFamily: "monospace", fontSize: "0.78rem", color: "#a5b4fc", background: "rgba(0,0,0,0.4)", padding: "10px 12px", borderRadius: 6, overflowX: "auto" as const, margin: 0 },
  ptable:{ width: "100%", borderCollapse: "collapse" as const, fontSize: "0.78rem", marginBottom: 12 },
  authCh:{ display: "inline-block", background: "rgba(99,102,241,0.15)", color: "#a5b4fc", padding: "1px 7px", borderRadius: 4, fontSize: "0.72rem", fontFamily: "monospace" },
};

export default function ApiDocsPage() {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggleKey = (k: string) => setOpen(prev => ({ ...prev, [k]: !prev[k] }));

  return (
    <div style={S.page}>
      <h1 style={S.title}>📚 API Reference</h1>
      <p style={S.sub}>
        All endpoints are under <code style={{ color: "#a5b4fc" }}>https://connectedsteps.in/api/v1</code> and require
        {" "}<code style={{ color: "#fbbf24" }}>Authorization: Bearer {"<api-key>"}</code> with the matching scope.
        Responses follow <code style={{ color: "#a5b4fc" }}>{`{ data: T, meta: { total, page, per_page, pages } }`}</code> for lists.
      </p>

      {ENDPOINTS.map(group => (
        <div key={group.section} style={S.sec}>
          <div style={S.shd}>{group.section}</div>
          {group.items.map(ep => {
            const key = `${ep.method}-${ep.path}`;
            const isOpen = !!open[key];
            return (
              <div key={key} style={S.ep}>
                <div style={S.epH} onClick={() => toggleKey(key)}>
                  <span style={{ ...S.badge, background: `${METHOD_COLOR[ep.method]}20`, color: METHOD_COLOR[ep.method] }}>{ep.method}</span>
                  <span style={S.path}>{ep.path}</span>
                  <span style={S.authCh}>{ep.auth}</span>
                  <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.78rem" }}>{ep.description}</span>
                  <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.8rem" }}>{isOpen ? "▲" : "▼"}</span>
                </div>
                {isOpen && (
                  <div style={S.body}>
                    {ep.params && ep.params.length > 0 && (
                      <>
                        <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Query Parameters</div>
                        <table style={S.ptable}>
                          <thead>
                            <tr>
                              {["Name", "Type", "Note"].map(h => <th key={h} style={{ textAlign: "left", color: "rgba(255,255,255,0.35)", paddingBottom: 4, fontWeight: 500 }}>{h}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {ep.params.map(p => (
                              <tr key={p.name}>
                                <td style={{ color: "#e2e8f0", fontFamily: "monospace", paddingRight: 16, paddingBottom: 3 }}>{p.name}</td>
                                <td style={{ color: "rgba(255,255,255,0.45)", paddingRight: 16, paddingBottom: 3 }}>{p.type}{p.required ? " *" : ""}</td>
                                <td style={{ color: "rgba(255,255,255,0.35)", paddingBottom: 3 }}>{p.note ?? ""}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}
                    <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Response Example</div>
                    <pre style={S.pre}>{ep.response}</pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <div style={{ marginTop: 24, padding: "16px 18px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: 10 }}>Error Format</div>
        <pre style={S.pre}>{`{ "error": { "code": "forbidden", "message": "Insufficient scope" } }`}</pre>
        <div style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.4)", marginTop: 10 }}>
          Common codes: <code>unauthorized</code> · <code>expired</code> · <code>forbidden</code> · <code>not_found</code> · <code>bad_request</code> · <code>rate_limit</code>
        </div>
      </div>
    </div>
  );
}
