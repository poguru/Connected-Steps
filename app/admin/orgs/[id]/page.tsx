"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface OrgStats {
  events:        { total: number; published: number; upcoming: number; past: number };
  registrations: { total: number; last_30d: number; active: number };
  revenue:       { total_inr: number; currency: string };
  communications:{ last_30d: number; email_sent: number; wa_sent: number; delivery_rate: number | null };
  members:       { total: number; active: number; owners: number };
  health_score:  number;
  as_of:         string;
}

interface Org {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string;
  plan: string;
  plan_status: string;
  is_active: boolean;
  is_default: boolean;
  contact_email: string | null;
  domain: string | null;
  created_at: string;
  member_count: number;
}

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div style={{ background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "18px 20px" }}>
      <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: accent ?? "#fff", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

export default function OrgDashboardPage() {
  const params = useParams<{ id: string }>();
  const id     = params.id;

  const [org,     setOrg]     = useState<Org | null>(null);
  const [stats,   setStats]   = useState<OrgStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/admin/orgs/${id}`).then(r => r.json()),
      fetch(`/api/admin/orgs/${id}/dashboard`).then(r => r.json()),
    ]).then(([orgData, statsData]) => {
      setOrg(orgData.org ?? null);
      setStats(statsData);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div style={{ padding: 48, textAlign: "center", color: "#555" }}>Loading…</div>
  );

  if (!org) return (
    <div style={{ padding: 48, textAlign: "center", color: "#f87171" }}>Organization not found</div>
  );

  const healthColor = (stats?.health_score ?? 0) >= 80 ? "#4ade80" : (stats?.health_score ?? 0) >= 60 ? "#fb923c" : "#f87171";

  return (
    <div style={{ padding: "28px 24px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: "#555", marginBottom: 20 }}>
        <Link href="/admin/orgs" style={{ color: "#555", textDecoration: "none" }}>Organizations</Link>
        {" / "}
        <span style={{ color: "#888" }}>{org.name}</span>
      </div>

      {/* Org header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32, gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {org.logo_url ? (
            <img src={org.logo_url} alt="" style={{ width: 52, height: 52, borderRadius: 12, objectFit: "cover" }} />
          ) : (
            <div style={{ width: 52, height: 52, borderRadius: 12, background: org.primary_color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: "#fff" }}>
              {org.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>
              {org.name}
              {org.is_default && <span style={{ marginLeft: 8, fontSize: 10, background: "rgba(232,98,10,0.15)", color: "#e8620a", padding: "2px 8px", borderRadius: 4, fontWeight: 700, verticalAlign: "middle" }}>DEFAULT</span>}
            </div>
            <div style={{ fontSize: 12, color: "#555", marginTop: 3 }}>
              {org.slug} · {org.contact_email ?? "no contact"} · {org.plan} plan
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href={`/admin/orgs/${id}/members`}
            style={{ padding: "8px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#ccc", textDecoration: "none", fontSize: 12, fontWeight: 600 }}>
            Members
          </Link>
          <Link href={`/admin/orgs/${id}/settings`}
            style={{ padding: "8px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#ccc", textDecoration: "none", fontSize: 12, fontWeight: 600 }}>
            Settings
          </Link>
          <Link href={`/admin/orgs/${id}/features`}
            style={{ padding: "8px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#ccc", textDecoration: "none", fontSize: 12, fontWeight: 600 }}>
            Features
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      {stats && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginBottom: 20 }}>
            <StatCard label="Health Score" value={`${stats.health_score}/100`} accent={healthColor} />
            <StatCard label="Events" value={stats.events.total} sub={`${stats.events.upcoming} upcoming`} />
            <StatCard label="Registrations" value={stats.registrations.total.toLocaleString()} sub={`${stats.registrations.last_30d} last 30d`} />
            <StatCard label="Revenue" value={`₹${stats.revenue.total_inr.toLocaleString()}`} />
            <StatCard label="Members" value={stats.members.active} sub={`${stats.members.owners} owner(s)`} />
            <StatCard label="Comms (30d)" value={stats.communications.last_30d} sub={stats.communications.delivery_rate !== null ? `${stats.communications.delivery_rate}% delivery` : undefined} />
          </div>

          {/* Communication breakdown */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
            <div style={{ background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "18px 20px" }}>
              <div style={{ fontSize: 12, color: "#888", fontWeight: 600, marginBottom: 14 }}>Communication Channels (30d)</div>
              {[
                { label: "📧 Email sent",     value: stats.communications.email_sent },
                { label: "💬 WhatsApp sent",  value: stats.communications.wa_sent },
              ].map(r => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 13 }}>
                  <span style={{ color: "#888" }}>{r.label}</span>
                  <span style={{ color: "#fff", fontWeight: 600 }}>{r.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div style={{ background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "18px 20px" }}>
              <div style={{ fontSize: 12, color: "#888", fontWeight: 600, marginBottom: 14 }}>Quick Links</div>
              {[
                { label: "All Events",       href: `/admin/events?org_id=${id}` },
                { label: "Registrations",    href: `/admin/events/registrations` },
                { label: "Communication Hub",href: `/admin/communication` },
                { label: "Audit Log",        href: `/admin/orgs/${id}/audit` },
              ].map(l => (
                <Link key={l.href} href={l.href}
                  style={{ display: "block", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 13, color: "#e8620a", textDecoration: "none" }}>
                  {l.label} →
                </Link>
              ))}
            </div>
          </div>

          <div style={{ fontSize: 11, color: "#333", textAlign: "right" }}>
            Last updated {new Date(stats.as_of).toLocaleTimeString()}
          </div>
        </>
      )}
    </div>
  );
}
