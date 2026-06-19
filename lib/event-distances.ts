export interface DistanceOption {
  code:  string; // stored in DB, shown as badge
  label: string; // full display name
  color: string; // badge text color
  bg:    string; // badge background
  border:string; // badge border
}

export const DISTANCE_OPTIONS: DistanceOption[] = [
  { code: "3K",       label: "3K",                  color: "#60a5fa", bg: "rgba(96,165,250,0.10)",  border: "rgba(96,165,250,0.30)"  },
  { code: "5K",       label: "5K",                  color: "#4ade80", bg: "rgba(74,222,128,0.10)",  border: "rgba(74,222,128,0.30)"  },
  { code: "10K",      label: "10K",                 color: "#e8620a", bg: "rgba(232,98,10,0.12)",   border: "rgba(232,98,10,0.30)"   },
  { code: "15K",      label: "15K",                 color: "#f59e0b", bg: "rgba(245,158,11,0.10)",  border: "rgba(245,158,11,0.30)"  },
  { code: "HM",       label: "Half Marathon (21.1K)",color: "#a78bfa", bg: "rgba(167,139,250,0.10)", border: "rgba(167,139,250,0.30)" },
  { code: "FM",       label: "Full Marathon (42.2K)",color: "#f87171", bg: "rgba(248,113,113,0.10)", border: "rgba(248,113,113,0.30)" },
  { code: "Ultra",    label: "Ultra Marathon",       color: "#f43f5e", bg: "rgba(244,63,94,0.10)",   border: "rgba(244,63,94,0.30)"   },
  { code: "Cycling",  label: "Cycling",              color: "#38bdf8", bg: "rgba(56,189,248,0.10)",  border: "rgba(56,189,248,0.30)"  },
  { code: "Walking",  label: "Walking",              color: "#86efac", bg: "rgba(134,239,172,0.10)", border: "rgba(134,239,172,0.30)" },
  { code: "Trail Run",label: "Trail Run",            color: "#a3e635", bg: "rgba(163,230,53,0.10)",  border: "rgba(163,230,53,0.30)"  },
  { code: "Custom",   label: "Custom",               color: "#94a3b8", bg: "rgba(148,163,184,0.10)", border: "rgba(148,163,184,0.30)" },
];

export const DISTANCE_MAP: Record<string, DistanceOption> =
  Object.fromEntries(DISTANCE_OPTIONS.map(d => [d.code, d]));

export function getDistanceOption(code: string): DistanceOption {
  return DISTANCE_MAP[code] ?? { code, label: code, color: "#94a3b8", bg: "rgba(148,163,184,0.10)", border: "rgba(148,163,184,0.30)" };
}
