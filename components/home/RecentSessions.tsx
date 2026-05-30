"use client";

import { useEffect, useState } from "react";

interface SessionFeedback { user_name: string; rating: number; comment: string; }
interface RecentSession {
  id: string; title: string; date: string; time: string | null;
  venue: string | null; location: string; photo_url: string | null;
  avgRating: number | null; reviewCount: number; feedback: SessionFeedback[];
}

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div style={{ display: "flex", gap: "2px" }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <svg key={s} width={size} height={size} viewBox="0 0 24 24">
          <polygon
            points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
            fill={s <= Math.round(rating) ? "#e8620a" : "rgba(255,255,255,0.15)"}
            stroke={s <= Math.round(rating) ? "#e8620a" : "rgba(255,255,255,0.2)"} strokeWidth="1"
          />
        </svg>
      ))}
    </div>
  );
}

export default function RecentSessions() {
  const [sessions, setSessions] = useState<RecentSession[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    fetch("/api/sessions/recent")
      .then((r) => r.json())
      .then((d) => setSessions(d.sessions ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading || sessions.length === 0) return null;

  return (
    <section className="section" style={{ background: "var(--cs-black)" }}>
      <div className="container">
        <span className="gold-line" />
        <div className="section-label" style={{ marginTop: "0.5rem" }}>Community</div>
        <h2 className="font-display mt-2" style={{ fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)", fontWeight: 300, color: "var(--cs-white)", marginBottom: "0.5rem" }}>
          Recent{" "}
          <em className="not-italic" style={{ color: "var(--cs-orange)" }}>Sessions</em>
        </h2>
        <p style={{ fontSize: "0.875rem", color: "var(--cs-muted)", marginBottom: "2.5rem" }}>
          See what our community has been up to.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1.5rem" }}>
          {sessions.map((s) => {
            const dateStr = new Date(s.date + "T12:00:00Z").toLocaleDateString("en-IN", {
              weekday: "short", day: "numeric", month: "short", year: "numeric",
            });
            return (
              <div key={s.id} style={{ background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                {/* Photo */}
                {s.photo_url && (
                  <img src={s.photo_url} alt={s.title} style={{ width: "100%", height: "200px", objectFit: "cover", display: "block" }} />
                )}

                <div style={{ padding: "1.25rem", flex: 1, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {/* Title + date */}
                  <div>
                    <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--cs-white)", marginBottom: "3px" }}>{s.title}</div>
                    <div style={{ fontSize: "0.78rem", color: "var(--cs-muted)" }}>
                      {dateStr}{s.time ? ` · ${s.time}` : ""} · 📍 {s.venue || s.location}
                    </div>
                  </div>

                  {/* Rating summary */}
                  {s.avgRating !== null ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <StarRow rating={s.avgRating} />
                      <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--cs-orange)" }}>{s.avgRating.toFixed(1)}</span>
                      <span style={{ fontSize: "0.75rem", color: "var(--cs-muted)" }}>({s.reviewCount} review{s.reviewCount !== 1 ? "s" : ""})</span>
                    </div>
                  ) : (
                    <div style={{ fontSize: "0.78rem", color: "var(--cs-muted)" }}>No reviews yet</div>
                  )}

                  {/* Feedback snippets */}
                  {s.feedback.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "auto" }}>
                      {s.feedback.filter((f) => f.comment).map((f, i) => (
                        <div key={i} style={{ background: "rgba(255,255,255,0.03)", borderRadius: "6px", padding: "0.6rem 0.75rem" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3px" }}>
                            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--cs-white)" }}>{f.user_name}</span>
                            <StarRow rating={f.rating} size={12} />
                          </div>
                          <div style={{ fontSize: "0.78rem", color: "var(--cs-muted)", lineHeight: 1.5 }}>{f.comment}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
