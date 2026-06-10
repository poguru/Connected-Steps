import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { COACHES } from "@/lib/coach-data";

export const metadata: Metadata = {
  title: "Our Coaches — Connected Steps",
  description: "Meet Hyderabad's elite running coaches — national medallists, NIS-certified professionals dedicated to your personal running goals.",
};

export default function CoachesPage() {
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
          {COACHES.map(coach => (
            <Link key={coach.slug} href={`/coaches/${coach.slug}`} style={{ textDecoration: "none" }}>
              <div style={{
                background:   "var(--surface)",
                border:       "1px solid var(--border)",
                borderRadius: 16,
                padding:      "1.75rem",
                display:      "flex",
                gap:          "1.75rem",
                alignItems:   "flex-start",
                cursor:       "pointer",
                transition:   "border-color 0.15s, box-shadow 0.15s",
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "oklch(0.72 0.19 49 / 40%)"; (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-glow)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}>

                {/* Photo */}
                <div style={{ flexShrink: 0 }}>
                  {coach.photo ? (
                    <img src={coach.photo} alt={coach.name} style={{ width: 88, height: 110, objectFit: "cover", objectPosition: "top center", borderRadius: 10, border: "2px solid oklch(0.72 0.19 49 / 25%)" }} />
                  ) : (
                    <div style={{ width: 88, height: 110, borderRadius: 10, background: "oklch(0.72 0.19 49 / 10%)", border: "2px solid oklch(0.72 0.19 49 / 20%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", fontWeight: 800, color: "var(--cs-orange)" }}>
                      {coach.initials}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: "var(--cs-orange)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: "0.25rem" }}>
                    {coach.role}
                  </div>
                  <div style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "0.5rem" }}>{coach.name}</div>
                  <p style={{ fontSize: "0.82rem", color: "var(--muted-foreground)", lineHeight: 1.65, marginBottom: "0.875rem", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
                    {coach.bio}
                  </p>

                  {/* Stats row */}
                  <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap" }}>
                    <div style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>
                      <span style={{ fontWeight: 700, color: "var(--foreground)", marginRight: 4 }}>{coach.certifications.length}</span>certifications
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>
                      <span style={{ fontWeight: 700, color: "var(--foreground)", marginRight: 4 }}>{coach.medals.length}</span>athletic honours
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>
                      <span style={{ fontWeight: 700, color: "var(--foreground)", marginRight: 4 }}>{coach.sessionsCoached}+</span>sessions coached
                    </div>
                  </div>
                </div>

                {/* CTA arrow */}
                <div style={{ flexShrink: 0, alignSelf: "center", color: "var(--cs-orange)", fontSize: "1.1rem" }}>→</div>
              </div>
            </Link>
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
