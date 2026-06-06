// XP = total_points (1:1 mapping). Levels computed client-side — no DB needed.

export interface LevelInfo {
  level:       number;
  title:       string;
  totalXP:     number;
  levelXP:     number;   // XP earned within current level
  nextLevelXP: number;   // XP span of current level
  xpToNext:    number;   // XP remaining to next level
  progress:    number;   // 0–1
  isMax:       boolean;
}

const LEVELS = [
  { level:  1, xp:     0, title: "Beginner Runner"    },
  { level:  2, xp:   100, title: "Jogger"             },
  { level:  3, xp:   300, title: "Pacer"              },
  { level:  4, xp:   600, title: "Consistent Runner"  },
  { level:  5, xp:  1000, title: "Endurance Runner"   },
  { level:  6, xp:  1500, title: "Half Marathoner"    },
  { level:  7, xp:  2500, title: "Distance Runner"    },
  { level:  8, xp:  4000, title: "Elite Runner"       },
  { level:  9, xp:  6000, title: "Community Champion" },
  { level: 10, xp: 10000, title: "Connected Legend"   },
];

export function getLevelInfo(totalXP: number): LevelInfo {
  const xp = Math.max(0, totalXP);

  let cur  = LEVELS[0];
  let next = LEVELS[1];

  for (let i = 0; i < LEVELS.length; i++) {
    if (i === LEVELS.length - 1 || xp < LEVELS[i + 1].xp) {
      cur  = LEVELS[i];
      next = LEVELS[Math.min(i + 1, LEVELS.length - 1)];
      break;
    }
  }

  const isMax      = cur.level === 10;
  const levelXP    = xp - cur.xp;
  const nextLevelXP= isMax ? 1 : next.xp - cur.xp;
  const xpToNext   = isMax ? 0 : next.xp - xp;
  const progress   = isMax ? 1 : Math.min(1, levelXP / nextLevelXP);

  return { level: cur.level, title: cur.title, totalXP: xp, levelXP, nextLevelXP, xpToNext, progress, isMax };
}

export function getNextTitle(totalXP: number): string | null {
  const { level } = getLevelInfo(totalXP);
  const next = LEVELS.find(l => l.level === level + 1);
  return next?.title ?? null;
}
