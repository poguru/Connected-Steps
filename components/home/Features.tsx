"use client";

const features = [
  {
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><polyline points="16 7 22 7 22 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    title: "Adaptive training plans",
    desc: "Your plan adjusts every week based on your performance, recovery, and life.",
  },
  {
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M4 20c0-4 3.58-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
    title: "Expert coaches",
    desc: "Matched with a certified running coach who knows your goals, your pace, and your limits.",
  },
  {
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M3 12h4l3-9 4 18 3-9h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    title: "Real-time analytics",
    desc: "Pace, heart rate, cadence, training load — all in one dashboard.",
  },
  {
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
    title: "Accountable community",
    desc: "Group challenges, run clubs, and runners who celebrate every kilometre with you.",
  },
  {
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    title: "Achievements & milestones",
    desc: "Earn badges for streaks, personal bests, and distances.",
  },
  {
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="5" y="2" width="14" height="20" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M9 7h6M9 11h6M9 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
    title: "Strava & Garmin sync",
    desc: "Connects with the apps you already use. Your data flows in automatically.",
  },
];

export default function Features() {
  return (
    <section className="section" style={{ background: "var(--cs-black)" }}>
      <div className="container">
        <div className="grid lg:grid-cols-2 gap-20 items-start">
          <div className="lg:sticky lg:top-32">
            <span className="gold-line" />
            <div className="section-label">Why Connected Steps</div>
            <h2 className="font-display mt-2 mb-6"
              style={{ fontSize: "clamp(2.2rem, 4vw, 3.5rem)", fontWeight: 300, color: "var(--cs-cream)" }}>
              Training that{" "}
              <em className="not-italic" style={{ color: "var(--cs-orange)" }}>moves</em>{" "}with you.
            </h2>
            <p className="text-base leading-relaxed" style={{ color: "var(--cs-muted)", maxWidth: "400px" }}>
              We built Connected Steps for the runner who is serious about getting better — not just
              logging kilometres, but running with purpose and a plan behind every step.
            </p>
          </div>

          <div className="grid gap-6">
            {features.map((f) => (
              <div key={f.title} className="flex gap-5 p-6 rounded"
                style={{ background: "var(--cs-charcoal)", border: "1px solid rgba(255,255,255,0.05)", transition: "border-color 0.2s" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = "rgba(232,98,10,0.3)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.05)")}>
                <div className="flex-shrink-0 w-10 h-10 rounded flex items-center justify-center"
                  style={{ background: "rgba(232,98,10,0.1)", color: "var(--cs-orange)", border: "1px solid rgba(232,98,10,0.2)" }}>
                  {f.icon}
                </div>
                <div>
                  <h3 className="font-display text-lg font-medium mb-1" style={{ color: "var(--cs-cream)" }}>{f.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--cs-muted)" }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
