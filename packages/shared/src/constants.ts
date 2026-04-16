/**
 * PhantomOS Browser-safe Constants
 * @author Subash Karki
 *
 * Node-only path constants (CLAUDE_DIR, SESSIONS_DIR, etc.) live in
 * constants-node.ts — import from there in server/Node code.
 */
export const API_PORT = 3849;

export const XP = {
  SESSION_START: 5,
  TASK_CREATE: 2,
  TASK_COMPLETE: 10,
  SESSION_COMPLETE_BONUS: 25,
  FIRST_SESSION_OF_DAY: 10,
  DAILY_STREAK: 15,
  SPEED_TASK: 5,
  LONG_SESSION: 30,
  NEW_REPO: 20,
} as const;

export const RANK_THRESHOLDS = [
  { rank: 'E', minLevel: 1, title: 'Awakened' },
  { rank: 'D', minLevel: 10, title: 'Apprentice Hunter' },
  { rank: 'C', minLevel: 25, title: 'Skilled Hunter' },
  { rank: 'B', minLevel: 50, title: 'Veteran Hunter' },
  { rank: 'A', minLevel: 75, title: 'Elite Hunter' },
  { rank: 'S', minLevel: 100, title: 'National Level Hunter' },
  { rank: 'SS', minLevel: 125, title: 'Shadow Monarch' },
  { rank: 'SSS', minLevel: 150, title: 'Absolute Being' },
] as const;

export const COST_PER_TOKEN = {
  INPUT: 15,        // microdollars per token
  OUTPUT: 75,
  CACHE_READ: 1.5,
  CACHE_WRITE: 18.75,
} as const;

export const levelXpRequired = (level: number): number =>
  Math.floor(100 * Math.pow(level, 1.5));

export const rankForLevel = (level: number): { rank: string; title: string } => {
  for (let i = RANK_THRESHOLDS.length - 1; i >= 0; i--) {
    if (level >= RANK_THRESHOLDS[i].minLevel) {
      return { rank: RANK_THRESHOLDS[i].rank, title: RANK_THRESHOLDS[i].title };
    }
  }
  return { rank: 'E', title: 'Awakened' };
};

/** Generate a short unique ID with the given prefix (e.g., 'feed', 'act') */
export const makeId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
