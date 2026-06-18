"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Metrics {
  totalMembers:     number;
  activeMembers:    number;
  upcomingEvents:   number;
  revenueThisMonth: number;
  pendingStories:   number;
  pendingPosts:     number;
}

const QUICK_ACTIONS = [
  { label: "Mark Session Attendance", href: "/admin/sessions",              desc: "Log today's training session" },
  { label: "Create Event",            href: "/admin/events",                desc: "Publish a new event or run" },
  { label: "Review Community Posts",  href: "/admin/community",             desc: "Approve or reject pending posts" },
  { label: "Write Training Plans",    href: "/admin/training-plans",        desc: "Weekly plans for members" },
  { label: "Event Registrations",     href: "/admin/events/registrations",  desc: "View registrations & revenue" },
  { label: "Coach Operations",        href: "/admin/coach-ops",             desc: "Athlete roster & bulk actions" },
  { label: "Coach Assignments",       href: "/admin/coach-assignments",     desc: "Assign coaches to users" },
];

function fmt(n: number) {
  return n.toLocaleString("en-IN");
}

function fmtRupees(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)   return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n}`;
}

function today() {
  return new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setMetrics(d); })
      .finally(() => setLoading(false));
  }, []);

  const pending = (metrics?.pendingStories ?? 0) + (metrics?.pendingPosts ?? 0);

  return (
    <div style={{ padding: "2rem 2rem 3rem", maxWidth: 960, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700, color: "#fff" }}>Dashboard</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#444" }}>{today()}</p>
      </div>

      {/* Metric cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        {[
          { label: "Total Members",      value: loading ? "—" : fmt(metrics?.totalMembers ?? 0),     sub: "All registered" },
          { label: "Active Members",     value: loading ? "—" : fmt(metrics?.activeMembers ?? 0),    sub: "Valid membership" },
          { label: "Upcoming Events",    value: loading ? "—" : fmt(metrics?.upcomingEvents ?? 0),   sub: "Scheduled ahead" },
          { label: "Revenue This Month", value: loading ? "—" : fmtRupees(metrics?.revenueThisMonth ?? 0), sub: "New memberships" },
        ].map(card => (
          <div key={card.label} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "1.25rem 1.5rem" }}>
            <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#e8620a", letterSpacing: "-0.02em", lineHeight: 1 }}>
              {card.value}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc", marginTop: 6 }}>{card.label}</div>
            <div style={{ fontSize: 11, color: "#3a3a3a", marginTop: 2 }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Pending approvals banner */}
      {!loading && pending > 0 && (
        <div style={{ background: "rgba(232,98,10,0.07)", border: "1px solid rgba(232,98,10,0.2)", borderRadius: 10, padding: "1rem 1.25rem", marginBottom: "1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#e8620a" }}>
              {pending} item{pending !== 1 ? "s" : ""} awaiting review
            </div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 3 }}>
              {metrics!.pendingStories > 0 && `${metrics!.pendingStories} runner ${metrics!.pendingStories === 1 ? "story" : "stories"}`}
              {metrics!.pendingStories > 0 && metrics!.pendingPosts > 0 && " · "}
              {metrics!.pendingPosts > 0 && `${metrics!.pendingPosts} community ${metrics!.pendingPosts === 1 ? "post" : "posts"}`}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {metrics!.pendingStories > 0 && (
              <Link href="/admin/stories" style={{ fontSize: 12, fontWeight: 600, color: "#e8620a", textDecoration: "none", background: "rgba(232,98,10,0.15)", borderRadius: 6, padding: "5px 12px" }}>
                Review Stories
              </Link>
            )}
            {metrics!.pendingPosts > 0 && (
              <Link href="/admin/community" style={{ fontSize: 12, fontWeight: 600, color: "#e8620a", textDecoration: "none", background: "rgba(232,98,10,0.15)", borderRadius: 6, padding: "5px 12px" }}>
                Review Posts
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div style={{ marginBottom: "0.75rem" }}>
        <div style={{ fontSize: 11, color: "#333", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: "0.75rem" }}>
          Quick Actions
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.75rem" }}>
          {QUICK_ACTIONS.map(action => (
            <Link key={action.href} href={action.href} style={{ textDecoration: "none" }}>
              <div
                style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "1rem 1.25rem", cursor: "pointer", transition: "border-color 0.15s" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(232,98,10,0.3)")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)")}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: "#e0e0e0", marginBottom: 3 }}>{action.label}</div>
                <div style={{ fontSize: 12, color: "#444" }}>{action.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}
