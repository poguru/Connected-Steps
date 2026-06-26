"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Metrics {
  // Counts
  totalMembers:          number;
  activeMembers:         number;
  newMembersThisMonth:   number;
  upcomingEvents:        number;
  upcomingRegistrations: number;
  totalParticipants:     number;
  pendingStories:        number;
  pendingPosts:          number;
  // Revenue (rupees)
  membershipRevenueMonth: number;
  eventRevenueMonth:      number;
  totalRevenueMonth:      number;
}

const QUICK_ACTIONS = [
  { label: "Mark Session Attendance", href: "/admin/sessions",             desc: "Log today's training session" },
  { label: "Create Event",            href: "/admin/events/new",           desc: "Launch the event creation wizard" },
  { label: "📈 Analytics & Reports",  href: "/admin/analytics",            desc: "Revenue trends, growth, insights" },
  { label: "Review Community Posts",  href: "/admin/community",            desc: "Approve or reject pending posts" },
  { label: "Write Training Plans",    href: "/admin/training-plans",       desc: "Weekly plans for members" },
  { label: "Event Registrations",     href: "/admin/events/registrations", desc: "View registrations & revenue" },
  { label: "Coach Operations",        href: "/admin/coach-ops",            desc: "Athlete roster & bulk actions" },
];

function fmt(n: number) { return n.toLocaleString("en-IN"); }

function fmtRupees(n: number) {
  if (n >= 10_00_000) return `₹${(n / 10_00_000).toFixed(2)}Cr`;
  if (n >= 1_00_000)  return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1_000)     return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${fmt(n)}`;
}

function today() {
  return new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

type CardType = { label: string; value: string; sub: string; color?: string; href?: string };

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
  const v = (n: number | undefined, formatter: (n: number) => string) =>
    loading ? "—" : formatter(n ?? 0);

  const KPI_ROWS: { section: string; cards: CardType[] }[] = [
    {
      section: "Revenue — This Month",
      cards: [
        {
          label: "Total Revenue",
          value: v(metrics?.totalRevenueMonth, fmtRupees),
          sub:   "Events + Memberships",
          color: "#e8620a",
        },
        {
          label: "Event Revenue",
          value: v(metrics?.eventRevenueMonth, fmtRupees),
          sub:   "Paid event registrations",
          color: "#f97316",
          href:  "/admin/events/registrations",
        },
        {
          label: "Membership Revenue",
          value: v(metrics?.membershipRevenueMonth, fmtRupees),
          sub:   "New memberships activated",
          color: "#fb923c",
          href:  "/admin/membership",
        },
      ],
    },
    {
      section: "Members",
      cards: [
        {
          label: "Active Members",
          value: v(metrics?.activeMembers, fmt),
          sub:   "Valid membership now",
          color: "#4ade80",
          href:  "/admin/membership",
        },
        {
          label: "New This Month",
          value: v(metrics?.newMembersThisMonth, fmt),
          sub:   "Memberships started",
          color: "#86efac",
        },
        {
          label: "Total Registered",
          value: v(metrics?.totalMembers, fmt),
          sub:   "All-time signups",
          color: "#aaa",
          href:  "/admin/users",
        },
      ],
    },
    {
      section: "Events",
      cards: [
        {
          label: "Upcoming Events",
          value: v(metrics?.upcomingEvents, fmt),
          sub:   "Published & future",
          color: "#60a5fa",
          href:  "/admin/events",
        },
        {
          label: "Confirmed Registrations",
          value: v(metrics?.upcomingRegistrations, fmt),
          sub:   "All confirmed registrants",
          color: "#93c5fd",
          href:  "/admin/events/registrations",
        },
        {
          label: "Total Participants",
          value: v(metrics?.totalParticipants, fmt),
          sub:   "Unique users in events",
          color: "#bfdbfe",
          href:  "/admin/events/registrations",
        },
      ],
    },
  ];

  return (
    <div style={{ padding: "2rem 2rem 3rem", maxWidth: 1000, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700, color: "#fff" }}>Dashboard</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#444" }}>{today()}</p>
      </div>

      {/* KPI sections */}
      {KPI_ROWS.map(row => (
        <div key={row.section} style={{ marginBottom: "1.75rem" }}>
          <div style={{ fontSize: 10, color: "#333", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, marginBottom: "0.75rem" }}>
            {row.section}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.875rem" }}>
            {row.cards.map(card => {
              const inner = (
                <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "1.25rem 1.5rem", height: "100%", boxSizing: "border-box" as const }}>
                  <div style={{ fontSize: "1.6rem", fontWeight: 800, color: card.color ?? "#e8620a", letterSpacing: "-0.02em", lineHeight: 1 }}>
                    {card.value}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc", marginTop: 6 }}>{card.label}</div>
                  <div style={{ fontSize: 11, color: "#3a3a3a", marginTop: 2 }}>{card.sub}</div>
                </div>
              );
              return card.href ? (
                <Link key={card.label} href={card.href} style={{ textDecoration: "none" }}>{inner}</Link>
              ) : (
                <div key={card.label}>{inner}</div>
              );
            })}
          </div>
        </div>
      ))}

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
      <div>
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
