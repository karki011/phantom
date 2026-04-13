/**
 * Prior Failure Penalty — Shared utility for anti-repetition in strategy activation
 *
 * Checks if a strategy previously failed on a similar goal and applies a score penalty.
 * This prevents the engine from repeating the same failed approach.
 *
 * @author Subash Karki
 */
import type { ActivationScore, TaskContext } from '../types/strategy.js';

const FAILURE_PENALTY = 0.3;

/**
 * Apply a penalty to a strategy's activation score if it previously failed
 * on a similar goal. Returns the original score if no prior failures exist.
 */
export function applyPriorFailurePenalty(
  base: ActivationScore,
  strategyId: string,
  context: TaskContext,
): ActivationScore {
  const priorFailures = context.signals.priorFailures;
  if (!priorFailures || priorFailures.length === 0) return base;

  const failed = priorFailures.some((f) => f.strategyId === strategyId);
  if (!failed) return base;

  const penalized = Math.max(0, base.score - FAILURE_PENALTY);
  return {
    score: penalized,
    reason: `${base.reason} [penalized: previously failed on similar goal]`,
  };
}
