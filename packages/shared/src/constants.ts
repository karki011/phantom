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

// Microdollars per token, indexed by model tier.
// Anthropic pricing (Apr 2025): https://docs.anthropic.com/en/docs/about-claude/models
// NOTE: API input_tokens includes cache hits. The cost formula must subtract
// cache tokens from input before pricing to avoid double-counting.
export const MODEL_PRICING = {
  // Opus 4.5, 4.6, 4.7 — $5/$25 per MTok
  opus: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  // Opus 4, 4.1 (legacy) — $15/$75 per MTok
  opusLegacy: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  // Sonnet 4, 4.5, 4.6 — $3/$15 per MTok
  sonnet: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  // Haiku 4.5 — $1/$5 per MTok
  haiku: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  // Haiku 3.5 (legacy) — $0.80/$4 per MTok
  haikuLegacy: { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
} as const;

/** @deprecated Use MODEL_PRICING + getModelPricing() instead */
export const COST_PER_TOKEN = {
  INPUT: 3,
  OUTPUT: 15,
  CACHE_READ: 0.3,
  CACHE_WRITE: 3.75,
} as const;

/** A single model-pricing entry (microdollars per token). */
export type ModelPricingEntry = {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
};

/** Get pricing tier from a model string (e.g., "claude-opus-4-6[1m]") */
export const getModelPricing = (model: string | null | undefined): ModelPricingEntry => {
  if (!model) return MODEL_PRICING.sonnet;
  const lower = model.toLowerCase();
  if (lower.includes('opus')) {
    // Opus 4.5+ ($5/$25) vs Opus 4/4.1 ($15/$75)
    if (lower.includes('opus-4-0') || lower.includes('opus-4-1') || lower === 'claude-opus-4' || lower.includes('opus-3')) {
      return MODEL_PRICING.opusLegacy;
    }
    return MODEL_PRICING.opus;
  }
  if (lower.includes('haiku')) {
    // Haiku 4.5+ ($1/$5) vs Haiku 3.5 ($0.80/$4)
    if (lower.includes('haiku-3')) return MODEL_PRICING.haikuLegacy;
    return MODEL_PRICING.haiku;
  }
  return MODEL_PRICING.sonnet;
};

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
