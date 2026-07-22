"use client";

import { useState, useEffect, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import OpsHeader from "@/components/ops/OpsHeader";
import { OPS_ROLE_LABELS, ROLE_DEFAULT_MODULE } from "@/lib/ops-auth";
import type { OpsRole } from "@/lib/ops-auth";

const ACCENT = "#e8620a";
const POLL_MS = 6000;

interface Session { uid: string; eid: string; role: OpsRole; email: string; name: string; }

interface ServiceStat { done: number; label: string; }

interface LiveStats {
  stats: {
    total: number;
    checkin:   ServiceStat;
    tshirt:    ServiceStat;
    breakfast: ServiceStat;
    medal:     ServiceStat;
    bib:       ServiceStat;
  };
  enabled_services: string[];
  recent_activity: { service_name: string; action: string; volunteer_email: string | null; volunteer_role: string | null; created_at: string }[];
  fetched_at: string;
}

const SERVICE_META: Record<string, { label: string; module: string; color: string; emoji: string }> = {
  checkin:   { label: "Check-In",     module: "checkin",   color: "#10b981", emoji: "✅" },
  tshirt:    { label: "T-Shirts",     module: "tshirt",    color: "#f59e0b", emoji: "👕" },
  breakfast: { label: "Breakfast",    module: "breakfast", color: "#f97316", emoji: "🍽️" },
  bib:       { label: "BIB",          module: "bib",       color: "#60a5fa", emoji: "🏷️" },
  medal:     { label: "Medals",       module: "medal",     color: "#fbbf24", emoji: "🏅" },
};

export default function DashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router   = useRouter();

  const [session,    setSession]    = useState<Session | null>(null);
  const [eventTitle, setEventTitle] = useState("");
  const [stats,      setStats]      = useState<LiveStats | null>(null);
  const [lastUpdated, setLastUpdated] = useState("");

  const fetchStats = useCallback(async (eid: string) => {
    try {
      const res = await fetch(`/api/ops/events/${eid}/live-stats`);
      if (!res.ok) return;
      const data = await res.json() as LiveStats;
      setStats(data);
      setLastUpdated(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch { /* network blip — keep showing last data */ }
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    fetch("/api/ops/auth")
      .then(r => r.ok ? r.json() : null)
      .then((s: Session | null) => {
        if (!s) { router.replace(`/ops/${slug}/login`); return; }
        setSession(s);
        void fetchStats(s.eid);
        interval = setInterval(() => void fetchStats(s.eid), POLL_MS);
      })
      .catch(() => router.replace(`/ops/${slug}/login`));

    fetch(`/api/events/by-slug?slug=${encodeURIComponent(slug)}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { event?: { title: string } } | null) => { if (d?.event?.title) setEventTitle(d.event.title); })
      .catch(() => {});

    return () => clearInterval(interval);
  }, [slug, router, fetchStats]);

  if (!session) return <Spinner />;

  const total    = stats?.stats.total ?? 0;
  const services = Object.entries(SERVICE_META).filter(([key]) =>
    !stats || stats.enabled_services.length === 0 || stats.enabled_services.includes(key)
  );

  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#fff", fontFamily: "'Inter',system-ui,sans-serif" }}>
      <OpsHeader slug={slug} eventTitle={eventTitle} role={session.role} volunteerName={session.name} accentColor={ACCENT} />

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "clamp(1rem,4vw,1.5rem) 16px 60px" }}>

        {/* Header row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Live Dashboard</h1>
          {lastUpdated && (
            <span style={{ fontSize: 11, color: "#555" }}>Updated {lastUpdated}</span>
          )}
        </div>

        {/* Total participants */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "18px 20px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, color: "#aaa" }}>Total Participants</span>
          <span style={{ fontSize: 32, fontWeight: 900, color: ACCENT }}>{stats ? total : "—"}</span>
        </div>

        {/* Service stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: 24 }}>
          {services.map(([key, meta]) => {
            const stat = stats?.stats[key as keyof typeof stats.stats] as ServiceStat | undefined;
            const pct  = total > 0 && stat ? Math.round((stat.done / total) * 100) : 0;
            return (
              <Link key={key} href={`/ops/${slug}/${meta.module}`} style={{ textDecoration: "none" }}>
                <div style={{
                  background: "rgba(255,255,255,0.03)",
                  border: `1px solid ${meta.color}25`,
                  borderRadius: 12, padding: "14px 16px",
                  cursor: "pointer", transition: "border-color 0.15s",
                }}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>{meta.emoji}</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: meta.color, lineHeight: 1 }}>
                    {stat ? stat.done : "—"}
                  </div>
                  <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>{meta.label}</div>
                  {stat && total > 0 && (
                    <div style={{ marginTop: 8, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 99 }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: meta.color, borderRadius: 99, transition: "width 0.4s" }} />
                    </div>
                  )}
                  {stat && total > 0 && (
                    <div style={{ fontSize: 10, color: "#555", marginTop: 3 }}>{pct}%</div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>

        {/* Quick-access module grid for event_admin */}
        {session.role === "event_admin" && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
              Quick Access
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(Object.entries(ROLE_DEFAULT_MODULE) as [OpsRole, string][])
                .filter(([, mod]) => mod !== "dashboard")
                .map(([role, mod]) => (
                  <Link key={role} href={`/ops/${slug}/${mod}`}
                    style={{ fontSize: 12, fontWeight: 600, color: "#aaa", textDecoration: "none",
                      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 8, padding: "6px 12px" }}>
                    {OPS_ROLE_LABELS[role]}
                  </Link>
                ))}
            </div>
          </div>
        )}

        {/* Recent activity */}
        {(stats?.recent_activity ?? []).length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
              Recent Activity
            </div>
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, overflow: "hidden" }}>
              {(stats?.recent_activity ?? []).map((log, i) => {
                const meta = SERVICE_META[log.service_name];
                return (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                    borderBottom: i < (stats?.recent_activity.length ?? 0) - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                  }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{meta?.emoji ?? "📋"}</span>
                    <span style={{ fontSize: 12, color: meta?.color ?? "#aaa", fontWeight: 600, minWidth: 70 }}>
                      {meta?.label ?? log.service_name}
                    </span>
                    <span style={{ fontSize: 11, color: "#666", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {log.volunteer_email ?? "unknown"}
                    </span>
                    <span style={{ fontSize: 10, color: "#444", flexShrink: 0 }}>
                      {new Date(log.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #222", borderTopColor: "#e8620a", animation: "spin .7s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
