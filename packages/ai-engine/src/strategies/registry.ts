/**
 * StrategyRegistry — Plugin discovery and selection for reasoning strategies
 * Manages registered strategies and selects the best one for a given task context
 *
 * @author Subash Karki
 */
import type {
  ActivationScore,
  ReasoningStrategy,
  StrategyRegistryEntry,
  TaskContext,
} from '../types/strategy.js';

const FALLBACK_STRATEGY_ID = 'direct';
const MIN_ACTIVATION_THRESHOLD = 0.1;

export class StrategyRegistry {
  private entries = new Map<string, StrategyRegistryEntry>();

  /** Register a strategy with an optional priority (higher = preferred on ties). */
  register(strategy: ReasoningStrategy, priority = 0): void {
    this.entries.set(strategy.id, { strategy, enabled: true, priority });
  }

  /** Remove a strategy entirely. */
  unregister(id: string): void {
    this.entries.delete(id);
  }

  /** Enable a previously disabled strategy. */
  enable(id: string): void {
    const entry = this.entries.get(id);
    if (entry) entry.enabled = true;
  }

  /** Disable a strategy without removing it. */
  disable(id: string): void {
    const entry = this.entries.get(id);
    if (entry) entry.enabled = false;
  }

  /**
   * Select the best strategy for a given task context.
   *
   * 1. Filter to enabled strategies
   * 2. Call shouldActivate(context) on each
   * 3. Sort by activation score DESC, then priority DESC
   * 4. Return the highest scorer
   * 5. If none score above the threshold, return the "direct" strategy as fallback
   */
  select(context: TaskContext): ReasoningStrategy {
    const scored = this.scoreAll(context);

    // Find highest scorer above threshold
    const best = scored.find((s) => s.score.score > MIN_ACTIVATION_THRESHOLD);
    if (best) return best.strategy;

    // Fallback to direct strategy
    const direct = this.entries.get(FALLBACK_STRATEGY_ID);
    if (direct) return direct.strategy;

    // If direct isn't registered either, return the first available
    const first = scored[0];
    if (first) return first.strategy;

    throw new Error('StrategyRegistry: no strategies registered');
  }

  /**
   * Return all strategies with their activation scores, sorted by
   * score DESC then priority DESC. Useful for observability / debugging.
   */
  selectAll(
    context: TaskContext,
  ): Array<{ strategy: ReasoningStrategy; score: ActivationScore }> {
    return this.scoreAll(context);
  }

  /** List every registered strategy entry. */
  getAll(): StrategyRegistryEntry[] {
    return [...this.entries.values()];
  }

  /** Lookup a single strategy entry by id. */
  get(id: string): StrategyRegistryEntry | undefined {
    return this.entries.get(id);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private scoreAll(
    context: TaskContext,
  ): Array<{
    strategy: ReasoningStrategy;
    score: ActivationScore;
    priority: number;
  }> {
    const results: Array<{
      strategy: ReasoningStrategy;
      score: ActivationScore;
      priority: number;
    }> = [];

    for (const entry of this.entries.values()) {
      if (!entry.enabled) continue;
      const score = entry.strategy.shouldActivate(context);
      results.push({ strategy: entry.strategy, score, priority: entry.priority });
    }

    // Sort: highest score first, then highest priority first
    results.sort((a, b) => {
      const scoreDiff = b.score.score - a.score.score;
      if (scoreDiff !== 0) return scoreDiff;
      return b.priority - a.priority;
    });

    return results;
  }
}
