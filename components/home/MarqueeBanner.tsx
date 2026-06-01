"use client";

import { useEffect, useState } from "react";

interface Stats {
  totalRunners:     number;
  activeMembers:    number;
  sessionsAttended: number;
  weekendRuns:      number;
  avgRating:        number | null;
}

export default function MarqueeBanner() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => {});
  }, []);

  const items = [
    `${stats ? `${stats.totalRunners}+` : "—"} Runners`,
    "Expert Coaches",
    "5K to Marathon",
    `${stats ? `${stats.weekendRuns}+` : "—"} Run Registrations`,
    "Personalised Plans",
    `${stats ? `${stats.sessionsAttended}+` : "—"} Total Participations`,
    "Community First",
    "Real-time Coaching",
    ...(stats?.avgRating ? [`${stats.avgRating}★ Coach Rating`] : []),
  ];

  const doubled = [...items, ...items];

  return (
    <div className="py-5 overflow-hidden"
      style={{ background: "var(--cs-orange)", borderTop: "1px solid rgba(255,255,255,0.1)", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
      <div className="marquee-track">
        {doubled.map((item, i) => (
          <span key={i} className="flex items-center gap-3 whitespace-nowrap text-sm font-medium tracking-widest uppercase"
            style={{ color: "var(--cs-black)" }}>
            <span className="inline-block w-1 h-1 rounded-full" style={{ background: "rgba(15,10,6,0.4)" }} />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
