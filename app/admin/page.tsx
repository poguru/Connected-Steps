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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.25rem", width: "100%", maxWidth: "640px" }}>
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
