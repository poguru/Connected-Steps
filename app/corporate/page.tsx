import Link from "next/link";
import Image from "next/image";
import CorporateForm from "@/components/corporate/CorporateForm";

export const metadata = {
  title: "Corporate Wellness",
  description: "Connected Steps corporate running and fitness programmes for Hyderabad companies. Build a healthier, more productive team with expert coaches and group training.",
};

const benefits = [
  { icon: "📉", title: "Lower absenteeism",     desc: "Teams that move together take fewer sick days. Exercise reduces stress hormones and boosts immunity." },
  { icon: "🤝", title: "Stronger team bonds",   desc: "Shared physical challenges build trust faster than any team-building workshop." },
  { icon: "🧠", title: "Better focus",           desc: "Regular exercise improves concentration, decision-making, and creative output by up to 20%." },
  { icon: "🏅", title: "Attracts top talent",   desc: "Wellness benefits rank in the top 3 priorities for candidates evaluating job offers in India." },
  { icon: "💰", title: "Tax-deductible",         desc: "Employee wellness spends are eligible for corporate tax deductions under Indian tax law." },
  { icon: "📊", title: "Measurable ROI",         desc: "We track attendance, session completion, and fitness milestones — and report them to your HR team." },
];

const packages = [
  {
    name:     "Team Starter",
    team:     "10–25 employees",
    price:    "₹700",
    per:      "per person / month",
    features: ["Group running sessions (2×/week)", "Personalised goal per employee", "WhatsApp group coaching", "Monthly progress report to HR", "Weekend run access"],
    cta:      "Get a quote",
  },
  {
    name:     "Company Programme",
    team:     "25–100 employees",
    price:    "₹550",
    per:      "per person / month",
    popular:  true,
    features: ["Everything in Team Starter", "Dedicated corporate coach", "On-site or hybrid sessions", "Quarterly fitness assessment", "Corporate leaderboard", "Event participation (marathons)"],
    cta:      "Book a demo session",
  },
  {
    name:     "Enterprise",
    team:     "100+ employees",
    price:    "Custom",
    per:      "pricing",
    features: ["Fully bespoke programme", "Multiple coaches", "Multi-location support", "Wellness dashboard for HR", "CSR reporting", "Priority event coordination"],
    cta:      "Contact us",
  },
];

export default function CorporatePage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--cs-black)", color: "var(--cs-white)" }}>

      {/* Navbar */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(8,28,45,0.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(56,189,248,0.08)", padding: "0 2rem", height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none" }}>
          <Image src="/logo.png" alt="Connected Steps" width={36} height={36} className="rounded-full" />
          <span style={{ fontSize: "1rem", fontWeight: 600, color: "var(--cs-white)" }}>Connected Steps</span>
        </Link>
        <Link href="/" style={{ fontSize: "0.8rem", color: "var(--cs-muted)", textDecoration: "none", padding: "6px 14px", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px" }}>← Home</Link>
      </header>

      {/* Hero */}
      <section style={{ background: "linear-gradient(135deg, rgba(232,98,10,0.1) 0%, transparent 60%)", padding: "5rem 2rem 4rem", textAlign: "center" }}>
        <div style={{ maxWidth: "720px", margin: "0 auto" }}>
          <div style={{ fontSize: "11px", color: "var(--cs-orange)", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700, marginBottom: "1rem" }}>
            Corporate Wellness — Hyderabad
          </div>
          <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", fontWeight: 300, lineHeight: 1.15, marginBottom: "1.25rem" }}>
            A healthier team is a{" "}
            <em style={{ color: "var(--cs-orange)", fontStyle: "normal" }}>more productive</em> team.
          </h1>
          <p style={{ fontSize: "1.05rem", color: "var(--cs-muted)", lineHeight: 1.7, marginBottom: "2rem", maxWidth: "560px", margin: "0 auto 2rem" }}>
            Connected Steps brings national-level coaching and structured running programmes to Hyderabad companies — from 10-person startups to 500-person enterprises.
          </p>
          <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
            <a href="#inquiry" style={{ padding: "14px 32px", background: "var(--cs-orange)", color: "#fff", borderRadius: "6px", textDecoration: "none", fontWeight: 700, fontSize: "0.95rem" }}>
              Get a free demo session →
            </a>
            <a href="https://wa.me/9703620570?text=Hi%2C%20I%27m%20interested%20in%20a%20corporate%20wellness%20programme%20for%20my%20company." target="_blank" rel="noopener noreferrer"
              style={{ padding: "14px 32px", background: "rgba(37,211,102,0.1)", color: "#4ade80", border: "1px solid rgba(37,211,102,0.3)", borderRadius: "6px", textDecoration: "none", fontWeight: 600, fontSize: "0.875rem" }}>
              💬 WhatsApp us
            </a>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section style={{ padding: "4rem 2rem", maxWidth: "1100px", margin: "0 auto" }}>
        <h2 style={{ fontSize: "1.6rem", fontWeight: 300, textAlign: "center", marginBottom: "2.5rem" }}>
          Why companies invest in running programmes
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: "1.25rem" }}>
          {benefits.map((b) => (
            <div key={b.title} style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px", padding: "1.5rem" }}>
              <div style={{ fontSize: "1.75rem", marginBottom: "0.75rem" }}>{b.icon}</div>
              <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--cs-white)", marginBottom: "0.4rem" }}>{b.title}</div>
              <div style={{ fontSize: "0.82rem", color: "var(--cs-muted)", lineHeight: 1.6 }}>{b.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Packages */}
      <section style={{ padding: "4rem 2rem", background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <h2 style={{ fontSize: "1.6rem", fontWeight: 300, textAlign: "center", marginBottom: "0.5rem" }}>Corporate Packages</h2>
          <p style={{ textAlign: "center", color: "var(--cs-muted)", fontSize: "0.875rem", marginBottom: "2.5rem" }}>All packages include GST. Custom pricing available for 100+ employees.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: "1.25rem", alignItems: "start" }}>
            {packages.map((pkg) => (
              <div key={pkg.name} style={{ background: pkg.popular ? "rgba(232,98,10,0.08)" : "var(--cs-dark)", border: `1px solid ${pkg.popular ? "rgba(232,98,10,0.4)" : "rgba(255,255,255,0.07)"}`, borderRadius: "12px", padding: "2rem 1.75rem", position: "relative" }}>
                {pkg.popular && (
                  <div style={{ position: "absolute", top: "-12px", left: "50%", transform: "translateX(-50%)", background: "var(--cs-orange)", color: "#fff", fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", padding: "4px 14px", borderRadius: "20px", whiteSpace: "nowrap" }}>
                    Most Popular
                  </div>
                )}
                <div style={{ fontSize: "11px", color: pkg.popular ? "var(--cs-orange)" : "var(--cs-muted)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, marginBottom: "0.4rem" }}>{pkg.name}</div>
                <div style={{ fontSize: "0.78rem", color: "var(--cs-muted)", marginBottom: "1.25rem" }}>{pkg.team}</div>
                <div style={{ marginBottom: "1.5rem" }}>
                  <span style={{ fontSize: "2.2rem", fontWeight: 300, color: "var(--cs-white)" }}>{pkg.price}</span>
                  {pkg.per !== "pricing" && <span style={{ fontSize: "0.78rem", color: "var(--cs-muted)", marginLeft: "6px" }}>{pkg.per}</span>}
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1.75rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  {pkg.features.map((f) => (
                    <li key={f} style={{ display: "flex", gap: "8px", fontSize: "0.8rem", color: "var(--cs-muted)", lineHeight: 1.4 }}>
                      <span style={{ color: "var(--cs-orange)", flexShrink: 0 }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <a href="#inquiry" style={{ display: "block", textAlign: "center", padding: "11px", borderRadius: "6px", fontWeight: 700, fontSize: "0.85rem", textDecoration: "none", background: pkg.popular ? "var(--cs-orange)" : "transparent", color: pkg.popular ? "#fff" : "var(--cs-white)", border: pkg.popular ? "none" : "1px solid rgba(255,255,255,0.2)" }}>
                  {pkg.cta}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Inquiry form */}
      <section id="inquiry" style={{ padding: "5rem 2rem", maxWidth: "640px", margin: "0 auto" }}>
        <h2 style={{ fontSize: "1.6rem", fontWeight: 300, marginBottom: "0.5rem", textAlign: "center" }}>Book a free demo session</h2>
        <p style={{ color: "var(--cs-muted)", fontSize: "0.875rem", marginBottom: "2.5rem", textAlign: "center" }}>
          We'll run a free 60-minute trial session for up to 10 of your employees — no commitment required.
        </p>
        <CorporateForm />
      </section>

    </div>
  );
}
