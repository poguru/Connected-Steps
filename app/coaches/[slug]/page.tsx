import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { fetchCoachBySlug, fetchCoachSlugs } from "@/lib/coach-db";
import { getSupabaseServer } from "@/lib/supabase-server";

// Revalidate every hour so newly added coaches appear without a full redeploy
export const revalidate = 3600;

// Pre-generate all active coach slugs at build time (falls back to hardcoded list)
export async function generateStaticParams() {
  const slugs = await fetchCoachSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const coach    = await fetchCoachBySlug(slug);
  if (!coach) return { title: "Coach not found — Connected Steps" };
  return {
    title:       `${coach.name} — Connected Steps Coach`,
    description: coach.bio.slice(0, 160),
  };
}

async function getRating(email: string): Promise<{ avg: number; count: number } | null> {
  try {
    const db = getSupabaseServer();
    const { data } = await db
      .from("coach_ratings")
      .select("rating")
      .eq("coach_email", email.toLowerCase());
    if (!data?.length) return null;
    const avg = data.reduce((s, r) => s + r.rating, 0) / data.length;
    return { avg: Math.round(avg * 10) / 10, count: data.length };
  } catch {
    return null;
  }
}

export default async function CoachProfilePage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const coach    = await fetchCoachBySlug(slug);
  if (!coach) notFound();

  const rating = await getRating(coach.email);

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--foreground)" }}>

      {/* Nav */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "oklch(0.12 0.015 270 / 90%)", backdropFilter: "blur(18px)", borderBottom: "1px solid var(--border)", padding: "0 1.5rem", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/coaches" style={{ display: "flex", alignItems: "center", gap: "0.5rem", textDecoration: "none", fontSize: "0.82rem", color: "var(--muted-foreground)" }}>
          ← All coaches
        </Link>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.5rem", textDecoration: "none" }}>
          <Image src="/logo.png" alt="Connected Steps" width={28} height={28} className="rounded-full" />
          <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--foreground)", fontFamily: "var(--font-display)" }}>Connected Steps</span>
        </Link>
        <Link href="/pricing" style={{ fontSize: "0.8rem", padding: "6px 16px", background: "var(--gradient-accent)", color: "#fff", borderRadius: 6, textDecoration: "none", fontWeight: 600 }}>
          Get a coach →
        </Link>
      </header>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "2.5rem 1.5rem 5rem" }}>

        {/* Hero */}
        <div style={{ display: "flex", gap: "1.75rem", alignItems: "flex-start", marginBottom: "2rem", flexWrap: "wrap" }}>

          {/* Photo */}
          <div style={{ flexShrink: 0 }}>
            {coach.photo ? (
              <img src={coach.photo} alt={coach.name}
                style={{ width: 120, height: 150, objectFit: "cover", objectPosition: "top center", borderRadius: 12, border: "2px solid oklch(0.72 0.19 49 / 30%)" }} />
            ) : (
              <div style={{ width: 120, height: 150, borderRadius: 12, background: "oklch(0.72 0.19 49 / 10%)", border: "2px solid oklch(0.72 0.19 49 / 20%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2rem", fontWeight: 800, color: "var(--cs-orange)" }}>
                {coach.initials}
              </div>
            )}
          </div>

          {/* Identity */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 10, color: "var(--cs-orange)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, marginBottom: "0.3rem" }}>
              {coach.role}
            </div>
            <h1 className="font-display" style={{ fontSize: "clamp(1.6rem, 4vw, 2.4rem)", fontWeight: 300, lineHeight: 1.15, marginBottom: "0.4rem" }}>
              {coach.name}
            </h1>
            <div style={{ fontSize: "0.82rem", color: "var(--muted-foreground)", marginBottom: "0.875rem" }}>
              📍 {coach.location}
            </div>

            {/* Rating badge */}
            {rating && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 20, padding: "4px 12px", fontSize: "0.8rem", fontWeight: 600, color: "#fbbf24", marginBottom: "0.875rem" }}>
                ★ {rating.avg}
                <span style={{ color: "var(--muted-foreground)", fontWeight: 400 }}>({rating.count} {rating.count === 1 ? "review" : "reviews"})</span>
              </div>
            )}

            {/* Stats strip */}
            <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
              {[
                { value: `${coach.sessionsCoached}+`, label: "Sessions" },
                { value: `${coach.certifications.length}`,  label: "Credentials" },
                { value: `${coach.medals.length}`,          label: "Honours" },
              ].map(s => (
                <div key={s.label}>
                  <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--cs-orange)", lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: "10px", color: "var(--muted-foreground)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "1.5rem 0" }} />

        {/* Bio */}
        <section style={{ marginBottom: "1.75rem" }}>
          <h2 style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, color: "var(--cs-orange)", marginBottom: "0.625rem" }}>About</h2>
          <p style={{ fontSize: "0.9rem", lineHeight: 1.8, color: "var(--muted-foreground)" }}>{coach.bio}</p>
        </section>

        {/* Qualifications */}
        <section style={{ marginBottom: "1.75rem" }}>
          <h2 style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, color: "var(--cs-orange)", marginBottom: "0.625rem" }}>Qualifications</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {coach.qualifications.map(q => (
              <div key={q.text} style={{ display: "flex", gap: "0.6rem", fontSize: "0.85rem", alignItems: "flex-start" }}>
                <span style={{ flexShrink: 0 }}>{q.icon}</span>
                <span style={{ color: "var(--foreground)" }}>{q.text}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Certifications */}
        <section style={{ marginBottom: "1.75rem" }}>
          <h2 style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, color: "var(--cs-orange)", marginBottom: "0.625rem" }}>Experience & Credentials</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {coach.certifications.map(c => (
              <div key={c} style={{ display: "flex", gap: "0.6rem", fontSize: "0.85rem", alignItems: "flex-start" }}>
                <span style={{ color: "var(--cs-orange)", flexShrink: 0, marginTop: 2 }}>›</span>
                <span style={{ color: "var(--muted-foreground)" }}>{c}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Achievements */}
        <section style={{ background: "oklch(0.72 0.19 49 / 5%)", border: "1px solid oklch(0.72 0.19 49 / 15%)", borderRadius: 12, padding: "1.25rem 1.5rem", marginBottom: "1.75rem" }}>
          <h2 style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, color: "var(--cs-orange)", marginBottom: "0.75rem" }}>Athletic Achievements</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
            {coach.medals.map(m => (
              <div key={m.text} style={{ display: "flex", gap: "0.6rem", fontSize: "0.85rem", alignItems: "flex-start" }}>
                <span style={{ flexShrink: 0 }}>{m.icon}</span>
                <span style={{ color: "var(--foreground)" }}>{m.text}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Testimonials */}
        {coach.testimonials.length > 0 && (
          <section style={{ marginBottom: "2.5rem" }}>
            <h2 style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, color: "var(--cs-orange)", marginBottom: "1rem" }}>What athletes say</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
              {coach.testimonials.map(t => (
                <div key={t.name} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.125rem 1.25rem", borderTop: "2px solid var(--cs-orange)" }}>
                  <div style={{ display: "flex", gap: 2, marginBottom: 8 }}>
                    {"★★★★★".split("").map((s, i) => <span key={i} style={{ fontSize: 12, color: "var(--cs-orange)" }}>{s}</span>)}
                  </div>
                  <p style={{ fontSize: "0.83rem", color: "var(--muted-foreground)", lineHeight: 1.7, margin: "0 0 0.75rem", fontStyle: "italic" }}>"{t.quote}"</p>
                  <div>
                    <div style={{ fontSize: "0.8rem", fontWeight: 700 }}>{t.name}</div>
                    <div style={{ fontSize: 10, color: "var(--cs-orange)", fontWeight: 600 }}>{t.goal}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Instagram */}
        {coach.instagram && (
          <div style={{ fontSize: "0.82rem", color: "var(--muted-foreground)", marginBottom: "2rem" }}>
            Instagram: <span style={{ color: "var(--cs-orange)", fontWeight: 600 }}>{coach.instagram}</span>
          </div>
        )}

        {/* CTA */}
        <div style={{ background: "oklch(0.16 0.025 40)", border: "1px solid oklch(0.72 0.19 49 / 30%)", borderRadius: 14, padding: "1.5rem 1.75rem", textAlign: "center" }}>
          <div style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.4rem" }}>
            Train with {coach.name.split(" ")[0]}
          </div>
          <p style={{ fontSize: "0.82rem", color: "var(--muted-foreground)", marginBottom: "1.25rem", lineHeight: 1.6 }}>
            Premium members get a personalised training plan written by this coach — updated every week.
          </p>
          <Link href="/pricing"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 28px", background: "var(--gradient-accent)", color: "#fff", borderRadius: 8, textDecoration: "none", fontSize: "0.85rem", fontWeight: 700, boxShadow: "var(--shadow-orange)" }}>
            Get my training plan →
          </Link>
        </div>

      </div>
    </div>
  );
}
