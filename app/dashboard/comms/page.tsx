"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { isTokenValid, handleAuthExpiry } from "@/lib/client-auth";

interface CommItem {
  id: string; type: "email" | "whatsapp"; channel: string; subject: string | null;
  status: string; sent_at: string | null; delivered_at?: string | null;
  opened_at?: string | null; clicked_at?: string | null; bounce_type?: string | null;
  event_id: string | null; event_title: string | null; event_slug: string | null;
}

function fmtDate(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  delivered: { color: "#4ade80", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)" },
  sent:      { color: "#4ade80", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)" },
  read:      { color: "#60a5fa", background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)" },
  opened:    { color: "#60a5fa", background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)" },
  clicked:   { color: "#a78bfa", background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.2)" },
  failed:    { color: "#f87171", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" },
  queued:    { color: "#fb923c", background: "rgba(251,146,60,0.08)",  border: "1px solid rgba(251,146,60,0.2)" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { color: "#666", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" };
  return (
    <span style={{ ...s, fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 999, textTransform: "uppercase" as const, letterSpacing: "0.06em", flexShrink: 0, whiteSpace: "nowrap" as const }}>
      {status}
    </span>
  );
}

export default function MyCommsPage() {
  const [items,     setItems]     = useState<CommItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [userToken, setUserToken] = useState("");
  const [filter,    setFilter]    = useState<"all" | "email" | "whatsapp">("all");
  const [expanded,  setExpanded]  = useState<string | null>(null);

  const load = useCallback((tok: string) => {
    setLoading(true); setError(null);
    fetch("/api/user/comms", { headers: { "x-user-token": tok } })
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Failed");
        setItems(d.timeline ?? []);
      })
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const raw   = localStorage.getItem("cs_user");
    const token = localStorage.getItem("cs_user_token") ?? "";
    if (!raw || !isTokenValid(token)) { handleAuthExpiry("/dashboard/comms"); return; }
    setUserToken(token);
    load(token);
  }, [load]);

  const visible = items.filter(i => filter === "all" || i.type === filter);

  const ICONS: Record<string, string> = { email: "📧", whatsapp: "💬" };

  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#f0f0f0", fontFamily: "'Inter',system-ui,sans-serif" }}>
      {/* Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(8,8,8,0.97)", backdropFilter: "blur(10px)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 16px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/dashboard" style={{ fontSize: 13, color: "#888", textDecoration: "none" }}>← Dashboard</Link>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>My Messages</span>
        <Link href="/notifications/preferences" style={{ fontSize: 11, color: "#e8620a", textDecoration: "none", fontWeight: 600 }}>Preferences</Link>
      </nav>

      <div style={{ maxWidth: 700, margin: "0 auto", padding: "20px 16px 100px" }}>
        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
          {(["all", "email", "whatsapp"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600,
                background: filter === f ? "rgba(232,98,10,0.12)" : "transparent",
                borderColor: filter === f ? "#e8620a" : "rgba(255,255,255,0.1)",
                color: filter === f ? "#e8620a" : "#888" }}>
              {f === "all" ? `All (${items.length})` : f === "email" ? `📧 Email (${items.filter(i => i.type === "email").length})` : `💬 WhatsApp (${items.filter(i => i.type === "whatsapp").length})`}
            </button>
          ))}
        </div>

        {error && (
          <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", color: "#f87171", fontSize: 13 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{ height: 64, borderRadius: 12, background: "rgba(255,255,255,0.04)", animation: "pulse 1.4s infinite" }} />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#555" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>{filter === "email" ? "📧" : filter === "whatsapp" ? "💬" : "📨"}</div>
            <div>No messages found</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {visible.map(item => {
              const open = expanded === item.id;
              return (
                <div key={item.id}
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", cursor: "pointer" }}
                  onClick={() => setExpanded(open ? null : item.id)}>
                  {/* Row */}
                  <div style={{ display: "flex", gap: 10, padding: "12px 0", alignItems: "flex-start" }}>
                    <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{ICONS[item.type] ?? "📨"}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: "#ddd", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {item.subject ?? "—"}
                          </div>
                          {item.event_title && (
                            <div style={{ fontSize: 11, color: "#555", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {item.event_title}
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                          <StatusBadge status={item.status} />
                          <span style={{ fontSize: 10, color: "#444", whiteSpace: "nowrap" }}>
                            {item.sent_at ? new Date(item.sent_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {open && (
                    <div style={{ padding: "0 0 14px 26px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "rgba(255,255,255,0.025)", borderRadius: 10, padding: "12px 14px" }}>
                        {[
                          { label: "Sent",       ts: item.sent_at,       show: true },
                          { label: "Delivered",  ts: item.delivered_at,  show: !!item.delivered_at },
                          { label: "Opened",     ts: item.opened_at,     show: !!item.opened_at },
                          { label: "Clicked",    ts: item.clicked_at,    show: !!item.clicked_at },
                        ].filter(r => r.show).map((row, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                            <span style={{ color: "#666" }}>{row.label}</span>
                            <span style={{ color: "#ddd", fontVariantNumeric: "tabular-nums" }}>{fmtDate(row.ts ?? null)}</span>
                          </div>
                        ))}
                        {item.bounce_type && (
                          <div style={{ fontSize: 11, color: "#f87171", marginTop: 4 }}>
                            Bounce: {item.bounce_type}
                          </div>
                        )}
                        {item.event_slug && (
                          <Link href={`/events/${item.event_slug}`}
                            style={{ fontSize: 11, color: "#e8620a", textDecoration: "none", marginTop: 4 }}>
                            View event →
                          </Link>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:.5} 50%{opacity:1} }`}</style>
    </div>
  );
}
