"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Card, Label } from "@/components/ui/ds";

// ── Check icon ────────────────────────────────────────────────────────────────
function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="8" cy="8" r="7.25" fill="rgba(232,98,10,0.12)" stroke="rgba(232,98,10,0.3)" strokeWidth="0.75" />
      <polyline points="4.5,8 7,10.5 11.5,5.5" stroke="var(--cs-orange)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const programs = [
  "Beginner Running Program",
  "5K & 10K Training",
  "Half Marathon Preparation",
  "Marathon Coaching",
  "Strength & Conditioning",
];

const activities = [
  "Weekly Long Runs",
  "Track Workouts",
  "Recovery Runs",
  "Race Day Support",
  "Community Challenges",
];

interface Session {
  id: string;
  title: string;
  date: string;
  venue: string | null;
  location: string | null;
  photo_url: string | null;
}

function fmtDate(d: string) {
  return new Date(d + "T12:00:00Z").toLocaleDateString("en-IN", {
    day: "numeric", month: "short",
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Features() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch("/api/sessions/recent")
      .then(r => r.json())
      .then(d => {
        const s: Session[] = (d.sessions ?? []).slice(0, 3);
        setSessions(s);
        const ids = s.map(x => x.id).join(",");
        if (ids) {
          fetch(`/api/sessions/rsvp-counts?ids=${ids}`)
            .then(r => r.json())
            .then(cd => setCounts(cd.counts ?? {}))
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  return (
    <section className="section" style={{ background: "var(--cs-black)" }}>
      <style>{`
        @media (min-width: 1024px) {
          .cs-features-grid  { grid-template-columns: 2fr 3fr; gap: 5rem; align-items: start; }
          .cs-features-left  { position: sticky; top: 7rem; }
        }
        @media (min-width: 600px) {
          .cs-programs-cols  { grid-template-columns: 1fr 1fr; }
        }
      `}</style>

      <div className="container">
        <div style={{ display: "grid", gap: "2.5rem" }} className="cs-features-grid">

          {/* ── Left ─────────────────────────────────────────────────────── */}
          <div className="cs-features-left">
            <span className="gold-line" />
            <div className="section-label">Why Connected Steps</div>

            <h2 className="font-display mt-3 mb-5"
              style={{ fontSize: "clamp(1.9rem, 3.5vw, 2.9rem)", fontWeight: 300, lineHeight: 1.12, color: "var(--cs-cream)" }}>
              Why Runners Choose{" "}
              <em className="not-italic" style={{ color: "var(--cs-orange)" }}>Connected Steps</em>
            </h2>

            <p style={{ fontSize: "0.95rem", lineHeight: 1.8, color: "var(--cs-muted)", maxWidth: 380, marginBottom: "0.9rem" }}>
              From your first group run to your first marathon, we give you structure,
              NIS-certified coaching, and a community that shows up every weekend — rain or shine.
            </p>
            <p style={{ fontSize: "0.875rem", lineHeight: 1.75, color: "var(--cs-muted)", maxWidth: 380, marginBottom: "1.75rem" }}>
              We are not an app. We are a club. Real coaches. Real routes. Real accountability.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <Link href="/auth?tab=register"
                style={{ display: "inline-flex", alignItems: "center", gap: 7, borderRadius: 8, background: "var(--gradient-accent)", padding: "11px 22px", fontSize: "0.875rem", fontWeight: 600, color: "var(--accent-foreground)", textDecoration: "none", boxShadow: "var(--shadow-orange)" }}>
                Join the community <ArrowRight size={14} />
              </Link>
              <Link href="/running-club-hyderabad"
                style={{ display: "inline-flex", alignItems: "center", gap: 7, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", padding: "11px 22px", fontSize: "0.875rem", fontWeight: 500, color: "var(--cs-muted)", textDecoration: "none" }}>
                Explore programs
              </Link>
            </div>
          </div>

          {/* ── Right ────────────────────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

            {/* Programs + Activities — side-by-side on sm+ */}
            <div style={{ display: "grid", gap: "1rem" }} className="cs-programs-cols">

              {/* Training Programs */}
              <Card style={{ background: "var(--cs-charcoal)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <Label style={{ marginBottom: "1rem" }}>Training Programs</Label>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                  {programs.map(p => (
                    <li key={p} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.875rem", color: "var(--cs-cream)" }}>
                      <Check /> {p}
                    </li>
                  ))}
                </ul>
              </Card>

              {/* Weekly Activities */}
              <Card style={{ background: "var(--cs-charcoal)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <Label style={{ marginBottom: "1rem" }}>Every Week</Label>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                  {activities.map(a => (
                    <li key={a} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.875rem", color: "var(--cs-cream)" }}>
                      <Check /> {a}
                    </li>
                  ))}
                </ul>
              </Card>
            </div>

            {/* Recent Sessions — only shows when real data exists */}
            {sessions.length > 0 && (
              <Card style={{ background: "var(--cs-charcoal)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <Label style={{ marginBottom: "1rem" }}>Recent Community Sessions</Label>
                <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
                  {sessions.map((s, i) => (
                    <div key={s.id}
                      style={{ display: "flex", alignItems: "center", gap: "0.875rem", padding: "0.625rem 0", borderBottom: i < sessions.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                      {/* Thumbnail */}
                      <div style={{ width: 44, height: 44, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "rgba(232,98,10,0.07)" }}>
                        {s.photo_url ? (
                          <img src={s.photo_url} alt={s.title} loading="lazy"
                            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        ) : (
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem" }}>🏃</div>
                        )}
                      </div>
                      {/* Details */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "0.825rem", fontWeight: 600, color: "var(--cs-cream)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.title}
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "var(--cs-muted)", marginTop: 2 }}>
                          {fmtDate(s.date)} · {s.venue || s.location || "Hyderabad"}
                          {(counts[s.id] ?? 0) > 0 && (
                            <span style={{ color: "var(--cs-orange)", fontWeight: 600, marginLeft: 6 }}>
                              · {counts[s.id]} runners
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
