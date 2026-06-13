import Link from "next/link";
import Image from "next/image";
import CoachCarouselSection from "@/components/coaches/CoachCarouselSection";

export const metadata = {
  title: "Running Club Hyderabad",
  description: "Join Hyderabad's most coached running club. Expert coaches, personalised training plans, and a community that shows up — for 5K beginners to marathon runners.",
};

const faqs = [
  { q: "Where do the running sessions take place?", a: "We run across multiple locations in Hyderabad including Necklace Road, KBR Park, and Gachibowli. Your exact meeting point is shared after you sign up." },
  { q: "Do I need to be fit to join?", a: "No. Our Starter plan is designed for complete beginners. If you can walk, you can start with us." },
  { q: "How is Connected Steps different from a regular running group?", a: "We're not just a group run — we're a structured training programme. Every member gets a personalised plan, a certified coach, and accountability tools to track progress." },
  { q: "How much does membership cost?", a: "From ₹1,200/month — less than ₹40/day. Active members get free entry to all weekend runs." },
  { q: "Can I try before committing?", a: "Yes — your first session is free. Join us for a weekend run with no obligation." },
];

export default function RunningClubHyderabadPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--cs-black)", color: "var(--cs-white)" }}>

      {/* Navbar */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "var(--bg-overlay)", backdropFilter: "blur(20px) saturate(140%)", borderBottom: "1px solid var(--border)", padding: "0 1.25rem", height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none", flexShrink: 0 }}>
          <Image src="/logo.png" alt="Connected Steps" width={36} height={36} className="rounded-full" />
          <span style={{ fontSize: "1rem", fontWeight: 600, color: "var(--cs-white)", whiteSpace: "nowrap" }}>Connected Steps</span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0 }}>
          <Link href="/pricing" className="hidden sm:block" style={{ fontSize: "0.8rem", color: "var(--cs-orange)", textDecoration: "none", fontWeight: 600 }}>View pricing</Link>
          <Link href="/auth" style={{ fontSize: "0.8rem", color: "var(--cs-muted)", textDecoration: "none", padding: "6px 14px", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", whiteSpace: "nowrap" }}>Join free</Link>
        </div>
      </header>

      {/* Hero */}
      <section style={{ padding: "5rem 2rem 4rem", textAlign: "center", background: "linear-gradient(180deg, rgba(232,98,10,0.08) 0%, transparent 100%)" }}>
        <div style={{ maxWidth: "760px", margin: "0 auto" }}>
          <div style={{ fontSize: "11px", color: "var(--cs-orange)", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700, marginBottom: "1rem" }}>
            Hyderabad's Running Community
          </div>
          <h1 style={{ fontSize: "clamp(2.2rem, 6vw, 4rem)", fontWeight: 300, lineHeight: 1.15, marginBottom: "1.25rem" }}>
            Hyderabad's Most Dedicated{" "}
            <em style={{ color: "var(--cs-orange)", fontStyle: "normal" }}>Running Club</em>
          </h1>
          <p style={{ fontSize: "1.05rem", color: "var(--cs-muted)", lineHeight: 1.7, marginBottom: "2rem", maxWidth: "580px", margin: "0 auto 2rem" }}>
            National-level coaches. Personalised training plans. Weekend runs across Hyderabad.
            Whether you're running your first 5K or targeting a sub-4 marathon — we have the plan.
          </p>
          <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/quiz" style={{ padding: "14px 32px", background: "var(--cs-orange)", color: "#fff", borderRadius: "6px", textDecoration: "none", fontWeight: 700, fontSize: "0.95rem" }}>
              Find my training plan →
            </Link>
            <a href="https://wa.me/9703620570?text=Hi%2C%20I%27m%20interested%20in%20joining%20the%20running%20club%20in%20Hyderabad!" target="_blank" rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "14px 24px", background: "rgba(255,255,255,0.05)", color: "var(--muted-foreground)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", textDecoration: "none", fontWeight: 500, fontSize: "0.875rem" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.556 4.122 1.528 5.855L.057 23.882a.5.5 0 00.61.61l6.086-1.461A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.9 0-3.7-.51-5.25-1.4l-.38-.22-3.9.94.97-3.82-.25-.4A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
              Chat on WhatsApp
            </a>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section style={{ padding: "3rem 2rem", borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: "800px", margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "2rem", textAlign: "center" }}>
          {[
            { n: "3", label: "Expert coaches" },
            { n: "30+", label: "Years combined experience" },
            { n: "5K–42K", label: "All distances covered" },
            { n: "₹40/day", label: "Starting from" },
          ].map((s) => (
            <div key={s.label}>
              <div style={{ fontSize: "2.2rem", fontWeight: 300, color: "var(--cs-orange)", lineHeight: 1 }}>{s.n}</div>
              <div style={{ fontSize: "0.78rem", color: "var(--cs-muted)", marginTop: "6px" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* What's included */}
      <section style={{ padding: "4rem 2rem", maxWidth: "900px", margin: "0 auto" }}>
        <h2 style={{ fontSize: "1.6rem", fontWeight: 300, textAlign: "center", marginBottom: "2.5rem" }}>
          What membership includes
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: "1rem" }}>
          {[
            { icon: "📋", title: "Personalised training plan",   desc: "Built for your goal, fitness level, and schedule. Updated weekly." },
            { icon: "🏃", title: "Weekend runs in Hyderabad",    desc: "Group runs at KBR Park, Necklace Road, Gachibowli and more — every Sunday." },
            { icon: "👨‍🏫", title: "Certified coach check-ins",  desc: "Weekly coaching with NIS-certified, nationally-decorated coaches." },
            { icon: "📊", title: "Analytics dashboard",          desc: "Track pace, distance, and training load from your phone." },
            { icon: "💬", title: "WhatsApp coach support",       desc: "Message your coach when you're struggling, injured, or just need advice." },
            { icon: "🏅", title: "Achievements & milestones",    desc: "Badges, streaks, and leaderboard rankings to keep motivation high." },
          ].map((f) => (
            <div key={f.title} style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px", padding: "1.25rem" }}>
              <div style={{ fontSize: "1.5rem", marginBottom: "0.6rem" }}>{f.icon}</div>
              <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--cs-white)", marginBottom: "0.35rem" }}>{f.title}</div>
              <div style={{ fontSize: "0.78rem", color: "var(--cs-muted)", lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Coaching team */}
      <section style={{ padding: "4rem 2rem", background: "rgba(232,98,10,0.04)", borderTop: "1px solid rgba(232,98,10,0.1)", borderBottom: "1px solid rgba(232,98,10,0.1)" }}>
        <div style={{ maxWidth: "960px", margin: "0 auto" }}>
          <CoachCarouselSection
            sectionLabel="MEET OUR COACHING TEAM"
            title="Trained by champions"
            subtitle="Our coaches are national-level athletes and certified professionals who've competed at the highest levels — now coaching Connected Steps runners in Hyderabad."
            ctaLabel="Start Training"
            ctaHref="/auth?tab=register"
          />
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: "4rem 2rem", maxWidth: "680px", margin: "0 auto" }}>
        <h2 style={{ fontSize: "1.4rem", fontWeight: 300, textAlign: "center", marginBottom: "2rem" }}>
          Common questions about our Hyderabad running club
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
          {faqs.map((f) => (
            <div key={f.q} style={{ background: "var(--cs-dark)", borderRadius: "8px", padding: "1.25rem", marginBottom: "0.5rem" }}>
              <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--cs-white)", marginBottom: "0.5rem" }}>Q: {f.q}</div>
              <div style={{ fontSize: "0.82rem", color: "var(--cs-muted)", lineHeight: 1.6 }}>{f.a}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ padding: "4rem 2rem", textAlign: "center", background: "rgba(232,98,10,0.06)", borderTop: "1px solid rgba(232,98,10,0.15)" }}>
        <h2 style={{ fontSize: "1.75rem", fontWeight: 300, marginBottom: "1rem" }}>Ready to run with us?</h2>
        <p style={{ color: "var(--cs-muted)", marginBottom: "2rem", fontSize: "0.9rem" }}>Your first session is free. No credit card needed.</p>
        <Link href="/auth" style={{ display: "inline-block", padding: "16px 40px", background: "var(--cs-orange)", color: "#fff", borderRadius: "6px", textDecoration: "none", fontWeight: 700, fontSize: "1rem" }}>
          Join Connected Steps — Hyderabad →
        </Link>
      </section>

    </div>
  );
}
