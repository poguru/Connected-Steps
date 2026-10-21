import type { ReactNode } from "react";
import type { Perk, PerkKey } from "@/lib/it-run-perks";

// Line icons in the category's colour, drawn on a 24-unit grid. Each one is decorative: the label beneath carries the meaning.
const ICON_PATHS: Record<PerkKey, ReactNode> = {
  bib: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <path d="M7 5v-2M17 5v-2" />
    </>
  ),
  timing: (
    <>
      <circle cx="12" cy="13" r="7" />
      <path d="M12 13V9M10 3h4M12 3v3" />
    </>
  ),
  medal: (
    <>
      <circle cx="12" cy="15" r="5" />
      <path d="M8.5 3.5 10.5 9.5M15.5 3.5 13.5 9.5" />
    </>
  ),
  tshirt: (
    <path d="M8 3 4 5.5 2 10l3 1.5V21h14v-9.5L22 10 20 5.5 16 3a4 4 0 0 1-8 0z" />
  ),
  certificate: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="1" />
      <path d="M7 9h10M7 12h6M9 17l-1 4 4-2 4 2-1-4" />
    </>
  ),
  breakfast: (
    <>
      <path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" />
      <path d="M16 11h2a2 2 0 0 1 0 4h-2" />
      <path d="M8 3c0 1.5 1 1.5 1 3M12 3c0 1.5 1 1.5 1 3" />
    </>
  ),
  photos: (
    <>
      <path d="M3 8h4l2-3h6l2 3h4v12H3z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
};

/** The icons for a category's perks, each with its label. Renders nothing when there are no perks. */
export default function ItRunPerkIcons({ perks, color }: { perks: Perk[]; color: string }) {
  if (perks.length === 0) return null;
  return (
    <ul
      aria-label="What you get"
      style={{ display: "flex", flexWrap: "wrap" as const, gap: 12, listStyle: "none", margin: "10px 0 0", padding: 0 }}
    >
      {perks.map(perk => (
        <li key={perk.key} style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 3, minWidth: 52 }}>
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            {ICON_PATHS[perk.key]}
          </svg>
          <span style={{ fontSize: 10, color: "#888", textAlign: "center" as const, lineHeight: 1.2 }}>{perk.label}</span>
        </li>
      ))}
    </ul>
  );
}
