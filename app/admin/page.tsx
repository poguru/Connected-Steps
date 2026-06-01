"use client";

import Link from "next/link";
import Image from "next/image";

const cards = [
  {
    href:  "/admin/sessions",
    title: "Training Sessions",
    desc:  "Create sessions, mark attendance, award competition points, sync to leaderboard.",
    icon:  "🏃",
  },
  {
    href:  "/admin/runs",
    title: "Run Registrations",
    desc:  "View and download registrations for weekend special runs.",
    icon:  "📋",
  },
  {
    href:  "/admin/leaderboard",
    title: "Monthly Leaderboard",
    desc:  "Save end-of-month standings. View all-time archives and top 3 winners per month.",
    icon:  "🏆",
  },
  {
    href:  "/admin/membership",
    title: "Memberships",
    desc:  "View all paid members, active/expired status, revenue summary and expiring soon alerts.",
    icon:  "💳",
  },
  {
    href:  "/admin/users",
    title: "All Users",
    desc:  "View every registered user with their goal, location, Strava stats, sessions and membership status.",
    icon:  "👥",
  },
  {
    href:  "/admin/stories",
    title: "Runner Stories",
    desc:  "Review and approve user-submitted stories shown on the homepage carousel.",
    icon:  "✍️",
  },
  {
    href:  "/admin/community",
    title: "Community Q&A",
    desc:  "Review and approve questions, tips, and discussions posted by community members.",
    icon:  "💬",
  },
  {
    href:  "/admin/coach-ratings",
    title: "Coach Ratings",
    desc:  "View all coach ratings and feedback submitted by members.",
    icon:  "⭐",
  },
  {
    href:  "/admin/training-plans",
    title: "Training Plans",
    desc:  "Write personalised weekly training schedules for individual members. Updated every Sunday.",
    icon:  "📋",
  },
  {
    href:  "/admin/coach-questions",
    title: "Coach Questions",
    desc:  "Answer injury, training, and recovery questions submitted by members from their dashboard.",
    icon:  "🩺",
  },
  {
    href:  "/admin/events",
    title: "Events & Coupons",
    desc:  "Create and publish weekend run events, manage promo codes and member discount coupons.",
    icon:  "🎟️",
  },
];

export default function AdminHub() {
  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none", marginBottom: "3rem" }}>
        <Image src="/logo.png" alt="Connected Steps" width={40} height={40} className="rounded-full" />
        <div>
          <div style={{ fontSize: "1.1rem", fontWeight: 600, color: "#fff" }}>Connected Steps</div>
          <div style={{ fontSize: "10px", color: "#e8620a", letterSpacing: "0.1em", textTransform: "uppercase" }}>Admin</div>
        </div>
      </Link>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: "1.25rem", width: "100%", maxWidth: "640px" }}>
        {cards.map((c) => (
          <Link key={c.href} href={c.href} style={{ textDecoration: "none" }}>
            <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", padding: "1.75rem", transition: "border-color 0.2s, transform 0.2s", cursor: "pointer" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(232,98,10,0.4)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLDivElement).style.transform = "none"; }}>
              <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>{c.icon}</div>
              <div style={{ fontSize: "1rem", fontWeight: 600, color: "#fff", marginBottom: "0.4rem" }}>{c.title}</div>
              <div style={{ fontSize: "0.8rem", color: "#888", lineHeight: 1.5 }}>{c.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
