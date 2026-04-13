/**
 * MultiPerspectiveEvaluator — Enhanced evaluation with cross-strategy validation
 * Extends the base Evaluator with consistency checks against past decisions
 * and cross-strategy validation for higher-quality evaluation on critical tasks.
 *
 * @author Subash Karki
 */
import type { StrategyOutput, TaskContext } from '../types/strategy.js';
import type { EvaluationResult } from './types.js';
import type { DecisionQuery } from '../graph/decision-query.js';
import { Evaluator } from './evaluator.js';

export class MultiPerspectiveEvaluator extends Evaluator {
  constructor(private decisionQuery: DecisionQuery | null = null) {
    super();
  }

  /**
   * Enhanced evaluation that adds:
   * 1. Base evaluation checks (confidence, tokens, context, completeness)
   * 2. Consistency check — if a past decision for same goal exists with very different confidence, flag it
   * 3. Prior success boost — if this strategy previously succeeded on a similar goal, boost confidence
   */
  evaluateWithHistory(output: StrategyOutput, taskContext: TaskContext): EvaluationResult {
    // Run base evaluation
    const baseResult = this.evaluate(output, taskContext);
    const checks = [...baseResult.checks];

    if (!this.decisionQuery) return baseResult;

    try {
      // Consistency check: compare with past decisions for similar goals
      const pastSuccesses = this.decisionQuery.getSuccessfulApproaches(taskContext.goal);
      const pastFailures = this.decisionQuery.getFailedApproaches(taskContext.goal);

      // Check: has this strategy succeeded before on similar goals?
      const priorStrategySuccess = pastSuccesses.find(s => s.strategyId === output.strategyId);
      if (priorStrategySuccess) {
        checks.push({
          name: 'priorSuccess',
          passed: true,
          detail: `Strategy "${output.strategyId}" previously succeeded on a similar goal with ${(priorStrategySuccess.confidence * 100).toFixed(0)}% confidence`,
        });
      }

      // Check: has this strategy failed before on similar goals?
      const priorStrategyFailure = pastFailures.find(f => f.strategyId === output.strategyId);
      if (priorStrategyFailure) {
        checks.push({
          name: 'priorFailure',
          passed: false,
          detail: `Strategy "${output.strategyId}" previously failed on a similar goal: ${priorStrategyFailure.failureReason ?? 'unknown reason'}`,
        });
      }

      // Consistency check: large confidence delta from past results
      if (pastSuccesses.length > 0) {
        const avgPastConfidence = pastSuccesses.reduce((sum, s) => sum + s.confidence, 0) / pastSuccesses.length;
        const delta = Math.abs(output.confidence - avgPastConfidence);
        const consistencyPass = delta < 0.3;
        checks.push({
          name: 'consistencyCheck',
          passed: consistencyPass,
          detail: consistencyPass
            ? `Output confidence (${output.confidence.toFixed(2)}) is consistent with past results (avg ${avgPastConfidence.toFixed(2)})`
            : `Output confidence (${output.confidence.toFixed(2)}) differs significantly from past results (avg ${avgPastConfidence.toFixed(2)}, delta ${delta.toFixed(2)})`,
        });
      }
    } catch {
      // Knowledge query failure should never block evaluation
    }

    // Recalculate recommendation with new checks
    const allPassed = checks.every(c => c.passed);
    const criticalFailed = !checks.find(c => c.name === 'confidence')?.passed || !checks.find(c => c.name === 'completeness')?.passed;
    const hasPriorFailure = checks.some(c => c.name === 'priorFailure' && !c.passed);

    let recommendation: EvaluationResult['recommendation'];
    if (criticalFailed || output.confidence < 0.5) {
      recommendation = 'escalate';
    } else if (hasPriorFailure && output.confidence < 0.7) {
      recommendation = 'escalate';
    } else if (allPassed && output.confidence > 0.8) {
      recommendation = 'accept';
    } else {
      recommendation = 'refine';
    }

    return {
      confidence: output.confidence,
      checks,
      recommendation,
    };
  }
}
