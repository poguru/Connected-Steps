import { notFound } from "next/navigation";
import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase-server";
import type { Metadata } from "next";

interface Result {
  id:                string;
  bib_number:        string | null;
  user_name:         string;
  distance_category: string | null;
  finish_time:       string | null;
  gun_time_secs:     number | null;
  pace:              string | null;
  overall_position:  number | null;
  category_position: number | null;
  status:            string;
}

async function getData(slug: string) {
  const db = getSupabaseServer();
  const { data: ev } = await db
    .from("events")
    .select("id, title, start_date, location, share_slug")
    .eq("share_slug", slug)
    .eq("status", "published")
    .single();
  if (!ev) return null;

  const { data: results } = await db
    .from("event_results")
    .select("id, bib_number, user_name, distance_category, finish_time, gun_time_secs, pace, overall_position, category_position, status")
    .eq("event_id", ev.id)
    .order("overall_position", { ascending: true, nullsFirst: false });

  return { ev, results: results ?? [] };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getData(slug);
  if (!data) return { title: "Results Not Found" };
  return {
    title: `Results — ${data.ev.title} | Connected Steps`,
    description: `Official race results for ${data.ev.title}. View finish times, positions, and pace.`,
  };
}

export default async function ResultsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getData(slug);
  if (!data) notFound();

  const { ev, results } = data;

  const categories = Array.from(new Set(results.map(r => r.distance_category ?? "General"))).sort();
  const finishers  = results.filter(r => r.status === "finisher");
  const dnf        = results.filter(r => r.status === "dnf");
  const dns        = results.filter(r => r.status === "dns");

  const evDate = new Date(ev.start_date + "T12:00:00").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  function positionMedal(pos: number | null) {
    if (!pos) return null;
    if (pos === 1) return "🥇";
    if (pos === 2) return "🥈";
    if (pos === 3) return "🥉";
    return null;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d10", color: "#fff", fontFamily: "inherit" }}>
      <nav style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(13,13,16,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 1.5rem", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href={`/events/${ev.share_slug}`} style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.6)", textDecoration: "none" }}>← Event Page</Link>
        <Link href="/" style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.35)", textDecoration: "none" }}>Connected Steps</Link>
      </nav>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1.5rem 5rem" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ fontSize: "1.1rem", color: "rgba(255,255,255,0.4)", marginBottom: "0.5rem" }}>🏁 Official Results</div>
          <h1 style={{ fontSize: "clamp(1.5rem, 5vw, 2.5rem)", fontWeight: 800, color: "#fff", margin: "0 0 0.5rem" }}>{ev.title}</h1>
          <div style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.4)" }}>📅 {evDate} · 📍 {ev.location}</div>
        </div>

        {/* Summary */}
        {results.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem 1rem" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>⏳</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>Results not yet published</div>
            <div style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.3)", marginTop: "0.5rem" }}>Check back after the event</div>
            <Link href={`/events/${ev.share_slug}`} style={{ display: "inline-block", marginTop: "1.5rem", color: "#e8620a", fontSize: "0.875rem", textDecoration: "none", fontWeight: 600 }}>
              ← Back to event
            </Link>
          </div>
        ) : (
          <>
            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: "2rem" }}>
              {[
                { label: "Finishers", value: finishers.length, color: "#4ade80" },
                { label: "DNF",       value: dnf.length,       color: dnf.length ? "#fbbf24" : "#555" },
                { label: "DNS",       value: dns.length,       color: "#555" },
              ].map(s => (
                <div key={s.label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "1rem", textAlign: "center" }}>
                  <div style={{ fontSize: "1.75rem", fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Results by category */}
            {categories.map(cat => {
              const catResults = results.filter(r => (r.distance_category ?? "General") === cat && r.status === "finisher")
                .sort((a, b) => (a.category_position ?? 999) - (b.category_position ?? 999));
              const catDNF = results.filter(r => (r.distance_category ?? "General") === cat && r.status === "dnf");
              if (catResults.length === 0 && catDNF.length === 0) return null;

              return (
                <div key={cat} style={{ marginBottom: "2rem" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#e8620a", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 12, padding: "6px 0", borderBottom: "1px solid rgba(232,98,10,0.2)" }}>
                    🏃 {cat}
                    <span style={{ fontSize: 11, color: "#555", fontWeight: 400, marginLeft: 8 }}>{catResults.length} finisher{catResults.length !== 1 ? "s" : ""}</span>
                  </div>

                  <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                          {["#", "Pos", "BIB", "Name", "Finish Time", "Pace"].map(h => (
                            <th key={h} style={{ padding: "10px 14px", textAlign: "left" as const, fontSize: 10, color: "#555", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".07em" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {catResults.map((r, i) => {
                          const medal = positionMedal(r.category_position);
                          return (
                            <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)", background: i < 3 ? `rgba(232,98,10,${0.04 - i * 0.01})` : "transparent" }}>
                              <td style={{ padding: "10px 14px", color: "#555", fontSize: 12 }}>{i + 1}</td>
                              <td style={{ padding: "10px 14px", fontWeight: 700, fontSize: 14 }}>
                                {medal ? <span>{medal}</span> : <span style={{ color: "#888" }}>{r.category_position ?? "—"}</span>}
                              </td>
                              <td style={{ padding: "10px 14px", color: "#e8620a", fontFamily: "monospace", fontWeight: 700, fontSize: 12 }}>{r.bib_number ?? "—"}</td>
                              <td style={{ padding: "10px 14px", fontWeight: 600, color: "#fff" }}>{r.user_name}</td>
                              <td style={{ padding: "10px 14px", fontWeight: 700, color: "#4ade80", fontFamily: "monospace" }}>{r.finish_time ?? "—"}</td>
                              <td style={{ padding: "10px 14px", color: "#888", fontSize: 12 }}>{r.pace ?? "—"}</td>
                            </tr>
                          );
                        })}
                        {catDNF.map(r => (
                          <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)", opacity: 0.5 }}>
                            <td colSpan={2} style={{ padding: "8px 14px" }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: "#fbbf24", padding: "2px 6px", background: "rgba(251,191,36,0.1)", borderRadius: 4 }}>DNF</span>
                            </td>
                            <td style={{ padding: "8px 14px", color: "#666", fontFamily: "monospace", fontSize: 12 }}>{r.bib_number ?? "—"}</td>
                            <td style={{ padding: "8px 14px", color: "#666" }}>{r.user_name}</td>
                            <td colSpan={2} style={{ padding: "8px 14px", color: "#555", fontSize: 12 }}>Did Not Finish</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            <div style={{ textAlign: "center", marginTop: "1rem", fontSize: "0.78rem", color: "rgba(255,255,255,0.2)" }}>
              Official results — Connected Steps · <Link href={`/events/${ev.share_slug}`} style={{ color: "#e8620a", textDecoration: "none" }}>View Event Page</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
