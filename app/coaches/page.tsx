import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { fetchCoachProfiles } from "@/lib/coach-db";
import CoachListCard from "@/components/coaches/CoachListCard";

export const metadata: Metadata = {
  title: "Our Coaches — Connected Steps",
  description: "Meet Hyderabad's elite running coaches — national medallists, NIS-certified professionals dedicated to your personal running goals.",
  alternates: { canonical: "/coaches" },
};

export default async function CoachesPage() {
  const coaches = await fetchCoachProfiles();
  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--foreground)" }}>

      {/* Nav */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "oklch(0.12 0.015 270 / 90%)", backdropFilter: "blur(18px)", borderBottom: "1px solid var(--border)", padding: "0 1.5rem", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none" }}>
          <Image src="/logo.png" alt="Connected Steps" width={30} height={30} className="rounded-full" />
          <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--foreground)", fontFamily: "var(--font-display)" }}>Connected Steps</span>
        </Link>
        <Link href="/pricing" style={{ fontSize: "0.8rem", padding: "6px 16px", background: "var(--gradient-accent)", color: "#fff", borderRadius: 6, textDecoration: "none", fontWeight: 600 }}>
          Get a coach →
        </Link>
      </header>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "3rem 1.5rem 5rem" }}>

        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
          <div style={{ fontSize: 10, color: "var(--cs-orange)", textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 700, marginBottom: "0.75rem" }}>
            The coaching team
          </div>
          <h1 className="font-display" style={{ fontSize: "clamp(2rem, 5vw, 3.2rem)", fontWeight: 300, lineHeight: 1.1, marginBottom: "1rem" }}>
            Trained by champions.<br />
            <em className="not-italic" style={{ color: "var(--cs-orange)" }}>Coached by the best.</em>
          </h1>
          <p style={{ fontSize: "0.95rem", color: "var(--muted-foreground)", maxWidth: 520, margin: "0 auto", lineHeight: 1.7 }}>
            National-level athletes and certified professionals who compete, win, and teach — with a combined 50+ years of athletic experience.
          </p>
        </div>

        {/* Coach cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {coaches.map(coach => (
            <CoachListCard key={coach.slug} coach={coach} />
          ))}
        </div>

        {/* CTA */}
        <div style={{ marginTop: "3.5rem", textAlign: "center" }}>
          <p style={{ fontSize: "0.9rem", color: "var(--muted-foreground)", marginBottom: "1.25rem" }}>
            Every premium member gets a personalised training plan written by one of these coaches.
          </p>
          <Link href="/pricing" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 32px", background: "var(--gradient-accent)", color: "#fff", borderRadius: 8, textDecoration: "none", fontSize: "0.9rem", fontWeight: 700, boxShadow: "var(--shadow-orange)" }}>
            Start with a coach →
          </Link>
        </div>

      </div>
    </div>
  );
}
