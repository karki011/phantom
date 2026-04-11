/**
 * Evaluator — Validates strategy output quality and assigns confidence
 * @author Subash Karki
 */
import type { StrategyOutput, TaskContext } from '../types/strategy.js';
import type { EvaluationResult } from './types.js';

/** Maximum token thresholds per complexity level */
const TOKEN_LIMITS: Record<string, number> = {
  simple: 10_000,
  moderate: 25_000,
  complex: 50_000,
  critical: 100_000,
};

export class Evaluator {
  /**
   * Evaluate a strategy output for quality and assign a recommendation.
   */
  evaluate(output: StrategyOutput, taskContext: TaskContext): EvaluationResult {
    const checks: EvaluationResult['checks'] = [];

    // 1. Confidence check — is output.confidence above threshold?
    const confidencePass = output.confidence >= 0.5;
    checks.push({
      name: 'confidence',
      passed: confidencePass,
      detail: confidencePass
        ? `Confidence ${output.confidence} meets minimum threshold (0.5)`
        : `Confidence ${output.confidence} is below minimum threshold (0.5)`,
    });

    // 2. Token efficiency — reasonable tokens for this complexity?
    const tokenLimit = TOKEN_LIMITS[taskContext.complexity] ?? TOKEN_LIMITS.complex;
    const tokenPass = output.tokensUsed <= tokenLimit;
    checks.push({
      name: 'tokenEfficiency',
      passed: tokenPass,
      detail: tokenPass
        ? `Token usage ${output.tokensUsed} within limit (${tokenLimit}) for ${taskContext.complexity} task`
        : `Token usage ${output.tokensUsed} exceeds limit (${tokenLimit}) for ${taskContext.complexity} task`,
    });

    // 3. Context coverage — did the strategy use graph context?
    // Inferred from artifacts or result: check if the result is non-trivial
    const resultLength = output.result.length;
    const contextPass = resultLength > 10;
    checks.push({
      name: 'contextCoverage',
      passed: contextPass,
      detail: contextPass
        ? `Result length (${resultLength} chars) indicates graph context was used`
        : `Result is too short (${resultLength} chars) — graph context may not have been used`,
    });

    // 4. Completeness — does the output have a non-empty result?
    const completenessPass = output.result.trim().length > 0;
    checks.push({
      name: 'completeness',
      passed: completenessPass,
      detail: completenessPass
        ? 'Output contains a non-empty result'
        : 'Output result is empty',
    });

    // Derive recommendation
    const allPassed = checks.every((c) => c.passed);
    const criticalFailed = !confidencePass || !completenessPass;

    let recommendation: EvaluationResult['recommendation'];
    if (criticalFailed || output.confidence < 0.5) {
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
