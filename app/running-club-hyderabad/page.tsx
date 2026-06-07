import Link from "next/link";
import Image from "next/image";

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
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(8,28,45,0.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(56,189,248,0.08)", padding: "0 1.25rem", height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
              style={{ padding: "14px 28px", background: "rgba(37,211,102,0.1)", color: "#4ade80", border: "1px solid rgba(37,211,102,0.3)", borderRadius: "6px", textDecoration: "none", fontWeight: 600, fontSize: "0.875rem" }}>
              💬 Chat on WhatsApp
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

      {/* Coach highlight */}
      <section style={{ padding: "4rem 2rem", background: "rgba(232,98,10,0.04)", borderTop: "1px solid rgba(232,98,10,0.1)", borderBottom: "1px solid rgba(232,98,10,0.1)" }}>
        <div style={{ maxWidth: "680px", margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontSize: "11px", color: "var(--cs-orange)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, marginBottom: "1rem" }}>Your Coach</div>
          <h2 style={{ fontSize: "1.75rem", fontWeight: 300, marginBottom: "1rem" }}>
            Train with a{" "}
            <em style={{ color: "var(--cs-orange)", fontStyle: "normal" }}>National Gold Medallist</em>
          </h2>
          <p style={{ fontSize: "0.9rem", color: "var(--cs-muted)", lineHeight: 1.7, marginBottom: "2rem" }}>
            Ashokan K — NIS Patiala certified, former Army athlete, 25+ years of coaching experience, and coach to a CWG Bronze medallist. He coaches Connected Steps runners in Hyderabad with the same precision he applied on the national stage.
          </p>
          <Link href="/auth" style={{ display: "inline-block", padding: "13px 30px", background: "var(--cs-orange)", color: "#fff", borderRadius: "6px", textDecoration: "none", fontWeight: 700, fontSize: "0.9rem" }}>
            Train with Ashokan →
          </Link>
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
