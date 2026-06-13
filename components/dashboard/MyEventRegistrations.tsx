"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Reg {
  registration_code: string;
  payment_status: string;
  status: string;
  final_price: number;
  created_at: string;
  events: {
    title: string; event_type: string; start_date: string;
    start_time: string | null; location: string; share_slug: string | null;
  } | null;
}

const TYPE_ICON: Record<string, string> = {
  running: "🏃", cycling: "🚴", training: "💪",
  race: "🏆", community: "🤝", workshop: "📚",
};

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function StatusBadge({ status, payment }: { status: string; payment: string }) {
  if (status === "cancelled") return <span style={badge("#ef4444")}>Cancelled</span>;
  if (payment === "paid")     return <span style={badge("#4ade80")}>Paid ✓</span>;
  if (payment === "free")     return <span style={badge("#60a5fa")}>Free</span>;
  if (payment === "pending")  return <span style={badge("#eab308")}>Payment Pending</span>;
  return <span style={badge("#888")}>{payment}</span>;
}
const badge = (c: string): React.CSSProperties => ({
  fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: 999,
  background: `${c}18`, border: `1px solid ${c}30`, color: c,
});

export default function MyEventRegistrations() {
  const [regs,    setRegs]    = useState<Reg[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiErr,  setApiErr]  = useState<string | null>(null);
  const [tab,     setTab]     = useState<"upcoming" | "past">("upcoming");

  useEffect(() => {
    const token = localStorage.getItem("cs_user_token") ?? "";
    if (!token) { setLoading(false); return; }
    fetch("/api/events/my-registrations", { headers: { "x-user-token": token } })
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
        setRegs(d.registrations ?? []);
      })
      .catch(err => setApiErr(String(err)))
      .finally(() => setLoading(false));
  }, []);

  const today = new Date().toISOString().split("T")[0];
  // Defensive: include registration even if events join returned null (treat as upcoming)
  const upcoming = regs.filter(r => r.status !== "cancelled" && (!r.events || r.events.start_date >= today));
  const past     = regs.filter(r => r.status !== "cancelled" && r.events && r.events.start_date < today);
  const shown    = tab === "upcoming" ? upcoming : past;

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "1.25rem", marginBottom: "1.5rem" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--foreground)" }}>My Event Registrations</div>
        <Link href="/events" style={{ fontSize: "0.75rem", color: "var(--cs-orange)", textDecoration: "none", fontWeight: 600 }}>
          Browse Events →
        </Link>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, padding: 3, background: "rgba(255,255,255,0.04)", borderRadius: 8, width: "fit-content", marginBottom: "1rem" }}>
        {(["upcoming", "past"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: "5px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600, background: tab === t ? "#e8620a" : "transparent", color: tab === t ? "#fff" : "var(--muted-foreground)", fontFamily: "inherit" }}>
            {t === "upcoming" ? `Upcoming (${upcoming.length})` : `Past (${past.length})`}
          </button>
        ))}
      </div>

      {apiErr ? (
        <div style={{ padding: "0.75rem", borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171", fontSize: "0.78rem" }}>
          Could not load registrations. Please refresh or try again.
        </div>
      ) : loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
          {[0,1].map(i => <div key={i} style={{ height: "60px", borderRadius: "8px", background: "rgba(255,255,255,0.04)", animation: "pulse 1.4s infinite" }} />)}
        </div>
      ) : shown.length === 0 ? (
        <div style={{ textAlign: "center", padding: "1.5rem 0", color: "var(--muted-foreground)", fontSize: "0.82rem" }}>
          {tab === "upcoming" ? (
            <>No upcoming registrations. <Link href="/events" style={{ color: "var(--cs-orange)", textDecoration: "none" }}>Browse events →</Link></>
          ) : "No past registrations."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
          {shown.map(r => {
            const ev = r.events;
            const href = ev?.share_slug ? `/events/${ev.share_slug}` : "#";
            return (
              <Link key={r.registration_code} href={href} style={{ textDecoration: "none" }}>
                <div style={{ padding: "0.75rem 0.875rem", borderRadius: "10px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", gap: "0.75rem", transition: "border-color 0.2s" }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(232,98,10,0.35)")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)")}>
                  <div style={{ fontSize: "1.4rem", flexShrink: 0 }}>{TYPE_ICON[ev?.event_type ?? ""] ?? "🏃"}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev?.title ?? "Event"}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--muted-foreground)" }}>
                      {ev ? `${fmtDate(ev.start_date)} · ${ev.location}` : "Details loading…"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <StatusBadge status={r.status} payment={r.payment_status} />
                    <div style={{ fontSize: "10px", color: "var(--muted-foreground)", marginTop: "3px", fontFamily: "monospace" }}>
                      {r.registration_code}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100% { opacity:0.5; } 50% { opacity:1; } }`}</style>
    </div>
  );
}
