"use client";

interface Achievement { icon: string; label: string; earned: boolean; }

interface Props {
  totalPoints:    number;
  monthPoints:    number;
  monthSessions:  number;
  totalSessions:  number;
  achievements:   Achievement[];
  loading?:       boolean;
}

export default function ProgressCard({ totalPoints, monthPoints, monthSessions, totalSessions, achievements, loading }: Props) {
  const earned = achievements.filter(a => a.earned).length;

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "0.9rem 1rem", marginBottom: "1rem", boxShadow: "var(--shadow-md)" }}>
      <div style={{ fontSize: "10px", color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, marginBottom: "0.75rem" }}>Progress</div>

      {/* 3-stat row */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
        {[
          { value: totalPoints.toLocaleString(), label: "Total Points",    orange: true  },
          { value: monthSessions,                label: "Sessions / Month", orange: false },
          { value: totalSessions,                label: "All-Time Sessions",orange: false },
        ].map((s, i, arr) => (
          <div key={s.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", borderRight: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}>
            {loading ? (
              <div style={{ width: 40, height: 22, background: "rgba(255,255,255,0.06)", borderRadius: 4 }} />
            ) : (
              <div style={{ fontSize: "1.25rem", fontWeight: 800, letterSpacing: "-0.5px", lineHeight: 1, color: s.orange ? "var(--cs-orange)" : "var(--foreground)" }}>
                {s.value}
              </div>
            )}
            <div style={{ fontSize: "9px", color: "var(--muted-foreground)", marginTop: 4, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.04em", lineHeight: 1.3 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Badges strip */}
      {!loading && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.65rem", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "nowrap", overflowX: "auto", paddingBottom: 2 }}>
          {achievements.map(a => (
            <div key={a.label} title={a.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, opacity: a.earned ? 1 : 0.3, flexShrink: 0 }}>
              <span style={{ fontSize: "1.1rem" }}>{a.earned ? a.icon : "🔒"}</span>
              <span style={{ fontSize: "9px", color: a.earned ? "var(--cs-orange)" : "var(--muted-foreground)", whiteSpace: "nowrap" }}>{a.label}</span>
            </div>
          ))}
          <div style={{ marginLeft: "auto", fontSize: "10px", color: "var(--muted-foreground)", flexShrink: 0, paddingLeft: 8 }}>
            {earned}/{achievements.length} earned
          </div>
        </div>
      )}
    </div>
  );
}
