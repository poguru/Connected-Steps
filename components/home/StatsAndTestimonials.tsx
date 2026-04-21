"use client";

const stats = [
  { num: "12,000+", label: "Active runners worldwide" },
  { num: "94%",     label: "Runners reach their goal" },
  { num: "48",      label: "Expert coaches on the platform" },
  { num: "4.9 / 5", label: "Average coach rating" },
];

const testimonials = [
  {
    quote: "I went from barely running 2km to completing my first half marathon in 14 weeks. My coach adjusted the plan when life got busy and I never felt alone.",
    name: "Priya M.", detail: "Hyderabad — Half Marathon finisher",
  },
  {
    quote: "The analytics alone are worth it. Seeing my pace improve week-on-week kept me coming back. The community pushes you on days you don't want to lace up.",
    name: "James O.", detail: "London — Full Marathon, 3:41",
  },
  {
    quote: "I have been a runner for years but I was plateauing. My Connected Steps coach identified the issue in the first week. Six weeks later, new PB.",
    name: "Sunita R.", detail: "Bengaluru — 5K PB: 23:14",
  },
];

export default function StatsAndTestimonials() {
  return (
    <>
      <section className="section" style={{ background: "var(--cs-charcoal)" }}>
        <div className="container">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4">
            {stats.map((s, i) => (
              <div key={s.label} className="text-center"
                style={{ borderRight: i < stats.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                <div className="stat-num">{s.num}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="community" className="section" style={{ background: "var(--cs-dark)" }}>
        <div className="container">
          <div className="text-center mb-16">
            <span className="gold-line mx-auto" />
            <div className="section-label">Runner stories</div>
            <h2 className="font-display mt-2"
              style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 300, color: "var(--cs-white)" }}>
              Real runners.{" "}
              <em className="not-italic" style={{ color: "var(--cs-orange)" }}>Real results.</em>
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div key={t.name} className="testimonial-card flex flex-col">
                <div className="flex gap-1 mb-5">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} width="14" height="14" viewBox="0 0 14 14" fill="var(--cs-orange)">
                      <path d="M7 1l1.55 3.14L12 4.85l-2.5 2.43.59 3.44L7 9.1 4.91 10.72l.59-3.44L3 4.85l3.45-.71L7 1z" />
                    </svg>
                  ))}
                </div>
                <p className="font-display text-lg font-light leading-relaxed flex-1 mb-6"
                  style={{ color: "var(--cs-white)", fontStyle: "italic" }}>"{t.quote}"</p>
                <div className="pt-5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="text-sm font-medium" style={{ color: "var(--cs-white)" }}>{t.name}</div>
                  <div className="text-xs tracking-wide mt-0.5" style={{ color: "var(--cs-muted)" }}>{t.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
