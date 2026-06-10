"use client";

import Link from "next/link";
import type { CoachProfile } from "@/lib/coach-data";

interface Props {
  coach: CoachProfile;
}

export default function CoachListCard({ coach }: Props) {
  return (
    <Link href={`/coaches/${coach.slug}`} style={{ textDecoration: "none" }}>
      <div
        style={{
          background:   "var(--surface)",
          border:       "1px solid var(--border)",
          borderRadius: 16,
          padding:      "1.75rem",
          display:      "flex",
          gap:          "1.75rem",
          alignItems:   "flex-start",
          cursor:       "pointer",
          transition:   "border-color 0.15s, box-shadow 0.15s",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.borderColor = "oklch(0.72 0.19 49 / 40%)";
          (e.currentTarget as HTMLElement).style.boxShadow  = "var(--shadow-glow)";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
          (e.currentTarget as HTMLElement).style.boxShadow  = "none";
        }}
      >
        {/* Photo */}
        <div style={{ flexShrink: 0 }}>
          {coach.photo ? (
            <img
              src={coach.photo}
              alt={coach.name}
              style={{ width: 88, height: 110, objectFit: "cover", objectPosition: "top center", borderRadius: 10, border: "2px solid oklch(0.72 0.19 49 / 25%)" }}
            />
          ) : (
            <div style={{ width: 88, height: 110, borderRadius: 10, background: "oklch(0.72 0.19 49 / 10%)", border: "2px solid oklch(0.72 0.19 49 / 20%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", fontWeight: 800, color: "var(--cs-orange)" }}>
              {coach.initials}
            </div>
          )}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: "var(--cs-orange)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: "0.25rem" }}>
            {coach.role}
          </div>
          <div style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "0.5rem" }}>{coach.name}</div>
          <p style={{ fontSize: "0.82rem", color: "var(--muted-foreground)", lineHeight: 1.65, marginBottom: "0.875rem", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
            {coach.bio}
          </p>
          <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap" }}>
            <div style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>
              <span style={{ fontWeight: 700, color: "var(--foreground)", marginRight: 4 }}>{coach.certifications.length}</span>certifications
            </div>
            <div style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>
              <span style={{ fontWeight: 700, color: "var(--foreground)", marginRight: 4 }}>{coach.medals.length}</span>athletic honours
            </div>
            <div style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>
              <span style={{ fontWeight: 700, color: "var(--foreground)", marginRight: 4 }}>{coach.sessionsCoached}+</span>sessions coached
            </div>
          </div>
        </div>

        {/* Arrow */}
        <div style={{ flexShrink: 0, alignSelf: "center", color: "var(--cs-orange)", fontSize: "1.1rem" }}>→</div>
      </div>
    </Link>
  );
}
