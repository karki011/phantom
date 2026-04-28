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

    // 3. Context coverage — did the strategy produce meaningful output?
    // Structural check: verify output contains meaningful content, not just length
    const contextPass = hasStructuralContent(output.result);
    checks.push({
      name: 'contextCoverage',
      passed: contextPass,
      detail: contextPass
        ? 'Result contains meaningful structured or textual content'
        : 'Result lacks meaningful content — graph context may not have been used',
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

/**
 * Structural content check — verifies output contains meaningful content
 * rather than relying on a raw character-length threshold.
 *
 * For JSON: checks for known structural keys (files, context, recommendation, steps).
 * For plain text: requires at least 5 words.
 */
const hasStructuralContent = (result: string): boolean => {
  try {
    const parsed = JSON.parse(result);
    return (
      (Array.isArray(parsed.files) && parsed.files.length > 0) ||
      (parsed.context != null && typeof parsed.context === 'object' && Object.keys(parsed.context).length > 0) ||
      (typeof parsed.recommendation === 'string' && parsed.recommendation.length > 0) ||
      (Array.isArray(parsed.steps) && parsed.steps.length > 0)
    );
  } catch {
    // Not JSON — check for meaningful text content (at least 5 words)
    return result.trim().split(/\s+/).length >= 5;
  }
};
