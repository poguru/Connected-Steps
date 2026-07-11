import Link from "next/link";
import Image from "next/image";
import CorporateForm from "@/components/corporate/CorporateForm";

export const metadata = {
  title: "Corporate Fitness & Wellness",
  description: "Connected Steps corporate wellness programmes for Hyderabad companies — on-site fitness, desk ergonomics, sports leagues, and monthly walk/run events. Building fitter workplaces and stronger teams.",
  alternates: { canonical: "/corporate" },
};

const programApproach = [
  {
    icon: "🏋️",
    title: "On-Site Sessions",
    items: ["Fit Ludo & Gamified fitness", "Indoor-friendly activities", "Tug of war & High-energy games", "Competitive fitness challenges", "Plank hold competitions"],
  },
  {
    icon: "💺",
    title: "Desk Ergonomics",
    items: ["Posture correction", "Neck, shoulder & back relief", "Wrist & palm stretches", "Eye strain management", "Squat holds & Push-ups"],
  },
  {
    icon: "🎯",
    title: "Workspace Sports",
    items: ["Cone drills & Reaction games", "Target throws", "Balloon volleyball", "Fun, inclusive formats"],
  },
  {
    icon: "🚶",
    title: "Monthly Walk / Run",
    items: ["Walk with the Leader", "Build active campus culture", "Leadership bonding", "Movement culture at work"],
  },
  {
    icon: "🧘",
    title: "Wellness Wednesdays / Fitness Fridays",
    items: ["Yoga & Mobility reset", "Strength sessions", "Zumba & Dance", "Weekly themed formats"],
  },
  {
    icon: "🏸",
    title: "Quarterly Sports Leagues",
    items: ["Badminton & Football", "Table tennis & Box Cricket", "Dodgeball", "Team tournaments"],
  },
];

const employeeBenefits = [
  { icon: "⚡", text: "Higher daily energy" },
  { icon: "🦴", text: "Reduced pain & stiffness" },
  { icon: "🧠", text: "Better mental health" },
  { icon: "🤝", text: "Stronger team unity" },
  { icon: "🏃", text: "Consistent movement habits" },
];

const companyBenefits = [
  { icon: "📈", text: "Higher productivity" },
  { icon: "😊", text: "Improved morale" },
  { icon: "📉", text: "Reduced absenteeism" },
  { icon: "🏆", text: "Strong employer brand" },
  { icon: "✨", text: "Positive workplace culture" },
  { icon: "🎽", text: "Exclusive discount on annual run" },
  { icon: "💡", text: "Exclusive training tips for run" },
];

const events = [
  { icon: "🎪", title: "Fitness Carnival" },
  { icon: "🥇", title: "Office Olympics" },
  { icon: "⚽", title: "Mini Sports Day" },
  { icon: "👨‍👩‍👧", title: "Family Day" },
  { icon: "🏃", title: "Corporate Runs" },
];

const sampleCalendar = [
  { week: "Week 1", activity: "Fit Ludo + Desk Mobility" },
  { week: "Week 2", activity: "Fitness Challenges Arena" },
  { week: "Week 3", activity: "Workspace Fun Sports" },
  { week: "Week 4", activity: "Walk with Leader + Expert Workshop" },
];

export default function CorporatePage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--cs-black)", color: "var(--cs-white)" }}>

      {/* Navbar */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "var(--bg-overlay)", backdropFilter: "blur(20px) saturate(140%)", borderBottom: "1px solid var(--border)", padding: "0 2rem", height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none" }}>
          <Image src="/logo.png" alt="Connected Steps" width={36} height={36} className="rounded-full" />
          <span style={{ fontSize: "1rem", fontWeight: 600, color: "var(--cs-white)" }}>Connected Steps</span>
        </Link>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <a href="tel:+919703620570" style={{ fontSize: "0.8rem", color: "var(--cs-muted)", textDecoration: "none" }}>+91 97036 20570</a>
          <Link href="/" style={{ fontSize: "0.8rem", color: "var(--cs-muted)", textDecoration: "none", padding: "6px 14px", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px" }}>← Home</Link>
        </div>
      </header>

      {/* Hero */}
      <section style={{ padding: "5rem 2rem 4rem", textAlign: "center", background: "linear-gradient(135deg, rgba(232,98,10,0.10) 0%, transparent 70%)" }}>
        <div style={{ maxWidth: "780px", margin: "0 auto" }}>
          <div style={{ fontSize: "11px", color: "var(--cs-orange)", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700, marginBottom: "1rem" }}>
            Connected Steps — Corporate Wellness
          </div>
          <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", fontWeight: 300, lineHeight: 1.2, marginBottom: "1.25rem" }}>
            Building <em style={{ color: "var(--cs-orange)", fontStyle: "normal" }}>Fitter Workplaces</em>.<br />
            Stronger Teams. Happier People.
          </h1>
          <p style={{ fontSize: "1.05rem", color: "var(--cs-muted)", lineHeight: 1.7, marginBottom: "2rem", maxWidth: "580px", margin: "0 auto 2rem" }}>
            Connected Steps helps organisations build active, healthy, engaged, and happy teams through structured wellness activities — designed for modern Indian workplaces.
          </p>
          <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
            <a href="#inquiry" style={{ padding: "14px 32px", background: "var(--cs-orange)", color: "#fff", borderRadius: "6px", textDecoration: "none", fontWeight: 700, fontSize: "0.95rem" }}>
              Book a free demo session →
            </a>
            <a href="https://wa.me/9703620570?text=Hi%2C%20I%27m%20interested%20in%20a%20corporate%20wellness%20programme%20for%20my%20company." target="_blank" rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "14px 24px", background: "rgba(255,255,255,0.05)", color: "var(--cs-muted)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", textDecoration: "none", fontWeight: 500, fontSize: "0.875rem" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.556 4.122 1.528 5.855L.057 23.882a.5.5 0 00.61.61l6.086-1.461A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.9 0-3.7-.51-5.25-1.4l-.38-.22-3.9.94.97-3.82-.25-.4A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
              WhatsApp us
            </a>
          </div>
        </div>
      </section>

      {/* Why it matters */}
      <section style={{ padding: "3.5rem 2rem", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 300, marginBottom: "0.5rem" }}>Why Corporate Fitness Matters</h2>
          <p style={{ color: "var(--cs-muted)", fontSize: "0.875rem", marginBottom: "2rem" }}>Fitness culture = better workplace. It's that simple.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.5rem" }}>
            {[
              { icon: "🏃", label: "Active Lifestyle", desc: "Movement built into the workday, not just a once-a-year event." },
              { icon: "🧘", label: "Stress Reduction", desc: "Structured physical activity reduces cortisol and improves focus." },
              { icon: "📈", label: "Engagement & Productivity", desc: "Active employees are 23% more productive and 32% more engaged." },
            ].map((w) => (
              <div key={w.label} style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px", padding: "1.5rem" }}>
                <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>{w.icon}</div>
                <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--cs-white)", marginBottom: "0.4rem" }}>{w.label}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--cs-muted)", lineHeight: 1.6 }}>{w.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Programme Approach */}
      <section style={{ padding: "4rem 2rem", background: "rgba(255,255,255,0.01)", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 300, textAlign: "center", marginBottom: "0.5rem" }}>Our Programme Approach</h2>
          <p style={{ textAlign: "center", color: "var(--cs-muted)", fontSize: "0.875rem", marginBottom: "2.5rem" }}>Six activity formats that fit any office, any team size, any fitness level.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: "1.25rem" }}>
            {programApproach.map((prog) => (
              <div key={prog.title} style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", padding: "1.5rem" }}>
                <div style={{ fontSize: "1.75rem", marginBottom: "0.75rem" }}>{prog.icon}</div>
                <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--cs-white)", marginBottom: "0.75rem" }}>{prog.title}</div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                  {prog.items.map((item) => (
                    <li key={item} style={{ display: "flex", gap: "8px", fontSize: "0.8rem", color: "var(--cs-muted)", lineHeight: 1.4 }}>
                      <span style={{ color: "var(--cs-orange)", flexShrink: 0 }}>✓</span> {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sample 4-week calendar */}
      <section style={{ padding: "4rem 2rem" }}>
        <div style={{ maxWidth: "680px", margin: "0 auto" }}>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 300, textAlign: "center", marginBottom: "0.5rem" }}>Sample Monthly Calendar</h2>
          <p style={{ textAlign: "center", color: "var(--cs-muted)", fontSize: "0.875rem", marginBottom: "2rem" }}>Every month looks different — we keep it fresh.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {sampleCalendar.map((row, i) => (
              <div key={row.week} style={{ display: "flex", alignItems: "center", gap: "1.25rem", background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "1rem 1.25rem" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "rgba(232,98,10,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700, color: "var(--cs-orange)", flexShrink: 0 }}>{i + 1}</div>
                <div>
                  <div style={{ fontSize: "10px", color: "var(--cs-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{row.week}</div>
                  <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--cs-white)" }}>{row.activity}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits — two columns */}
      <section style={{ padding: "4rem 2rem", background: "rgba(255,255,255,0.01)", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto" }}>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 300, textAlign: "center", marginBottom: "2.5rem" }}>The Impact</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", gap: "2rem" }}>
            <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(232,98,10,0.18)", borderRadius: "12px", padding: "1.75rem" }}>
              <div style={{ fontSize: "0.8rem", color: "var(--cs-orange)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: "1.25rem" }}>For Employees</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {employeeBenefits.map((b) => (
                  <div key={b.text} style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.875rem", color: "var(--cs-muted)" }}>
                    <span style={{ fontSize: "1.1rem" }}>{b.icon}</span> {b.text}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: "var(--cs-dark)", border: "1px solid rgba(232,98,10,0.2)", borderRadius: "12px", padding: "1.75rem" }}>
              <div style={{ fontSize: "0.8rem", color: "var(--cs-orange)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: "1.25rem" }}>For the Company</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {companyBenefits.map((b) => (
                  <div key={b.text} style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.875rem", color: "var(--cs-muted)" }}>
                    <span style={{ fontSize: "1.1rem" }}>{b.icon}</span> {b.text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Fitness Events */}
      <section style={{ padding: "4rem 2rem" }}>
        <div style={{ maxWidth: "800px", margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 300, marginBottom: "0.5rem" }}>Fitness Events We Can Host</h2>
          <p style={{ color: "var(--cs-muted)", fontSize: "0.875rem", marginBottom: "2.5rem" }}>One-off or recurring — we design the event around your team.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", justifyContent: "center" }}>
            {events.map((ev) => (
              <div key={ev.title} style={{ display: "flex", alignItems: "center", gap: "0.6rem", background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "40px", padding: "10px 20px", fontSize: "0.875rem", color: "var(--cs-white)", fontWeight: 500 }}>
                <span>{ev.icon}</span> {ev.title}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why choose us */}
      <section style={{ padding: "4rem 2rem", background: "rgba(232,98,10,0.04)", borderTop: "1px solid rgba(232,98,10,0.12)", borderBottom: "1px solid rgba(232,98,10,0.12)" }}>
        <div style={{ maxWidth: "800px", margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 300, marginBottom: "2rem" }}>Why Choose Connected Steps</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1.25rem" }}>
            {[
              { icon: "👨‍🏫", text: "Expert certified coaches" },
              { icon: "🌱", text: "Inclusive for all fitness levels" },
              { icon: "⚡", text: "Easy to implement — no gym needed" },
              { icon: "🏢", text: "Designed for modern workplaces" },
            ].map((w) => (
              <div key={w.text} style={{ background: "rgba(255,255,255,0.04)", borderRadius: "10px", padding: "1.25rem", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: "1.75rem", marginBottom: "0.6rem" }}>{w.icon}</div>
                <div style={{ fontSize: "0.82rem", color: "var(--cs-muted)", lineHeight: 1.5 }}>{w.text}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Inquiry form */}
      <section id="inquiry" style={{ padding: "5rem 2rem", maxWidth: "640px", margin: "0 auto" }}>
        <h2 style={{ fontSize: "1.6rem", fontWeight: 300, marginBottom: "0.5rem", textAlign: "center" }}>
          Let's build a fitter workplace together
        </h2>
        <p style={{ color: "var(--cs-muted)", fontSize: "0.875rem", marginBottom: "2.5rem", textAlign: "center" }}>
          We offer a free 60-minute trial session for up to 10 employees — no commitment required. Tell us about your team and we'll be in touch within 24 hours.
        </p>
        <CorporateForm />
        <div style={{ marginTop: "2rem", padding: "1.25rem", background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--cs-muted)" }}>📞 <a href="tel:+919703620570" style={{ color: "var(--cs-white)", textDecoration: "none" }}>+91 97036 20570</a></div>
          <div style={{ fontSize: "0.8rem", color: "var(--cs-muted)" }}>✉️ <a href="mailto:info@connectedsteps.in" style={{ color: "var(--cs-white)", textDecoration: "none" }}>info@connectedsteps.in</a></div>
          <div style={{ fontSize: "0.8rem", color: "var(--cs-muted)" }}>🌐 www.connectedsteps.in</div>
        </div>
      </section>

    </div>
  );
}
