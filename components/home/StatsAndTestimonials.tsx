"use client";

import { useEffect, useState, useRef, useCallback } from "react";

const FALLBACK = [
  { id: -1, user_name: "Priya M.",  achievement: "Hyderabad — Half Marathon finisher", quote: "I went from barely running 2km to completing my first half marathon in 14 weeks. My coach adjusted the plan when life got busy and I never felt alone.", rating: 5 },
  { id: -2, user_name: "James O.",  achievement: "London — Full Marathon, 3:41",       quote: "The analytics alone are worth it. Seeing my pace improve week-on-week kept me coming back. The community pushes you on days you don't want to lace up.", rating: 5 },
  { id: -3, user_name: "Sunita R.", achievement: "Bengaluru — 5K PB: 23:14",          quote: "I have been a runner for years but I was plateauing. My Connected Steps coach identified the issue in the first week. Six weeks later, new PB.", rating: 5 },
];

interface Story { id: number; user_name: string; achievement: string; quote: string; rating: number | null; }

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k+`;
  return String(n);
}

function Stars({ rating }: { rating: number | null }) {
  const r = rating ?? 5;
  return (
    <div style={{ display: "flex", gap: "3px" }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width="13" height="13" viewBox="0 0 14 14"
          fill={i <= r ? "var(--cs-orange)" : "rgba(255,255,255,0.15)"}>
          <path d="M7 1l1.55 3.14L12 4.85l-2.5 2.43.59 3.44L7 9.1 4.91 10.72l.59-3.44L3 4.85l3.45-.71L7 1z" />
        </svg>
      ))}
    </div>
  );
}

function StoryCard({ story }: { story: Story }) {
  return (
    <div style={{
      background: "var(--cs-charcoal)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "12px", padding: "1.5rem",
      display: "flex", flexDirection: "column", gap: "1rem",
      height: "100%", boxSizing: "border-box",
    }}>
      <Stars rating={story.rating} />
      <p style={{ fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 300, fontStyle: "italic", color: "var(--cs-white)", lineHeight: 1.6, flex: 1 }}>
        &ldquo;{story.quote}&rdquo;
      </p>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "0.75rem" }}>
        <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--cs-white)" }}>{story.user_name}</div>
        <div style={{ fontSize: "11px", color: "var(--cs-muted)", marginTop: "2px" }}>{story.achievement}</div>
      </div>
    </div>
  );
}

function StoriesCarousel({ stories }: { stories: Story[] }) {
  const [current, setCurrent] = useState(0);
  const [paused,  setPaused]  = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const total    = stories.length;
  const perPage  = 3;
  const pages    = Math.ceil(total / perPage);

  const next = useCallback(() => setCurrent((c) => (c + 1) % pages), [pages]);
  const prev = useCallback(() => setCurrent((c) => (c - 1 + pages) % pages), [pages]);

  useEffect(() => {
    if (paused || pages <= 1) return;
    timerRef.current = setInterval(next, 4000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [paused, pages, next]);

  const visible = stories.slice(current * perPage, current * perPage + perPage);

  return (
    <div>
      {/* Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.25rem", alignItems: "stretch" }}>
        {visible.map((story) => (
          <StoryCard key={story.id} story={story} />
        ))}
      </div>

      {/* Controls */}
      {pages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "1rem", marginTop: "2rem" }}>
          {/* Prev */}
          <button onClick={prev} aria-label="Previous"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "50%", width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--cs-white)" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 2L5 7l4 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* Dots */}
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            {Array.from({ length: pages }).map((_, i) => (
              <button key={i} onClick={() => setCurrent(i)} aria-label={`Go to page ${i + 1}`}
                style={{ width: i === current ? "20px" : "8px", height: "8px", borderRadius: "4px", background: i === current ? "var(--cs-orange)" : "rgba(255,255,255,0.2)", border: "none", cursor: "pointer", transition: "all 0.25s", padding: 0 }} />
            ))}
          </div>

          {/* Next */}
          <button onClick={next} aria-label="Next"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "50%", width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--cs-white)" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M5 2l4 5-4 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* Pause / Play */}
          <button onClick={() => setPaused((p) => !p)} aria-label={paused ? "Play" : "Pause"}
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "50%", width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: paused ? "var(--cs-orange)" : "var(--cs-muted)", transition: "color 0.2s" }}>
            {paused ? (
              <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor">
                <path d="M2 1l10 6-10 6V1z"/>
              </svg>
            ) : (
              <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor">
                <rect x="1" y="1" width="4" height="12" rx="1"/>
                <rect x="7" y="1" width="4" height="12" rx="1"/>
              </svg>
            )}
          </button>
        </div>
      )}

      {/* Page count */}
      <div style={{ textAlign: "center", marginTop: "0.75rem", fontSize: "11px", color: "var(--cs-muted)" }}>
        {current * perPage + 1}–{Math.min(current * perPage + perPage, total)} of {total} stories
      </div>
    </div>
  );
}

export default function StatsAndTestimonials() {
  const [stories,          setStories]          = useState<Story[]>([]);
  const [avgRating,        setAvgRating]        = useState<number | null>(null);
  const [totalRunners,     setTotalRunners]     = useState<number | null>(null);
  const [sessionsAttended, setSessionsAttended] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/stories")
      .then((r) => r.json())
      .then((d) => {
        if (d.stories?.length) setStories(d.stories);
        if (d.avg_rating != null) setAvgRating(d.avg_rating);
      })
      .catch(() => {});

    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => {
        if (d.totalRunners     != null) setTotalRunners(d.totalRunners);
        if (d.sessionsAttended != null) setSessionsAttended(d.sessionsAttended);
        if (d.avgRating        != null) setAvgRating(d.avgRating);
      })
      .catch(() => {});
  }, []);

  const stats = [
    { num: totalRunners     != null ? fmt(totalRunners)     : "—",   label: "Members & growing"          },
    { num: "3",                                                        label: "Expert coaches"             },
    { num: sessionsAttended != null ? fmt(sessionsAttended) : "—",   label: "Sessions attended"          },
    { num: avgRating        != null ? `${avgRating}★`       : "30+", label: avgRating != null ? "Community rating" : "Years coach experience" },
  ];

  const display = stories.length ? stories : FALLBACK;

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
          <div style={{ textAlign: "center", marginBottom: "3rem" }}>
            <span className="gold-line mx-auto" />
            <div className="section-label">Runner stories</div>
            <h2 className="font-display mt-2"
              style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 300, color: "var(--cs-white)" }}>
              Real runners.{" "}
              <em className="not-italic" style={{ color: "var(--cs-orange)" }}>Real results.</em>
            </h2>
            {avgRating != null && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", marginTop: "0.75rem", background: "rgba(232,98,10,0.08)", border: "1px solid rgba(232,98,10,0.2)", borderRadius: "20px", padding: "4px 14px" }}>
                <Stars rating={Math.round(avgRating)} />
                <span style={{ fontSize: "0.82rem", color: "var(--cs-orange)", fontWeight: 600 }}>{avgRating} / 5</span>
                <span style={{ fontSize: "0.75rem", color: "var(--cs-muted)" }}>from {stories.length} runner{stories.length !== 1 ? "s" : ""}</span>
              </div>
            )}
            <p style={{ fontSize: "0.875rem", color: "var(--cs-muted)", marginTop: "0.75rem" }}>
              Stories shared by our community.{" "}
              <a href="/dashboard?share=story" style={{ color: "var(--cs-orange)", textDecoration: "none" }}>Share yours →</a>
            </p>
          </div>

          <StoriesCarousel stories={display} />
        </div>
      </section>
    </>
  );
}
