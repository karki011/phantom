/**
 * TaskAssessor — Assesses task complexity, risk, and ambiguity from goal + graph context
 * @author Subash Karki
 */
import type { ContextResult, BlastRadiusResult } from '../types/graph.js';
import type { TaskComplexity, TaskContext, TaskRisk, PriorFailureSignal, PriorSuccessSignal } from '../types/strategy.js';
import type { DecisionQuery } from '../graph/decision-query.js';
import type { GoalInput } from './types.js';

const AMBIGUITY_WORDS = ['should', 'maybe', 'not sure', 'consider', 'perhaps', 'might'];

export class TaskAssessor {
  private decisionQuery: DecisionQuery | null = null;

  /** Attach a DecisionQuery for anti-repetition detection. */
  setDecisionQuery(query: DecisionQuery): void {
    this.decisionQuery = query;
  }

  /**
   * Assess task complexity, risk, and ambiguity from a goal and its graph context.
   * If a DecisionQuery is attached, also injects priorFailures/priorSuccess signals.
   */
  assess(
    input: GoalInput,
    graphContext: ContextResult,
    blastRadius: BlastRadiusResult,
  ): TaskContext {
    const fileCount = graphContext.files.length;
    const edgeCount = graphContext.edges.length;
    const blastTotal = blastRadius.direct.length + blastRadius.transitive.length;
    const activeFilesCount = input.activeFiles?.length ?? 0;

    const complexity = this.assessComplexity(fileCount);
    const risk = this.assessRisk(blastTotal);
    const isAmbiguous = this.assessAmbiguity(input);

    const relevantFiles = graphContext.files.map((f) => f.path);

    // Query prior decisions for anti-repetition signals
    let priorFailures: PriorFailureSignal[] | undefined;
    let priorSuccess: PriorSuccessSignal | undefined;

    if (this.decisionQuery) {
      try {
        const failures = this.decisionQuery.getFailedApproaches(input.goal);
        if (failures.length > 0) {
          priorFailures = failures.map((f) => ({
            strategyId: f.strategyId,
            strategyName: f.strategyName,
            failureReason: f.failureReason,
            confidence: f.confidence,
          }));
        }

        const successes = this.decisionQuery.getSuccessfulApproaches(input.goal);
        if (successes.length > 0) {
          // Use the most recent success with highest confidence
          const best = successes.sort((a, b) => b.confidence - a.confidence)[0];
          priorSuccess = {
            strategyId: best.strategyId,
            strategyName: best.strategyName,
            confidence: best.confidence,
          };
        }
      } catch {
        // Knowledge query failure should never block assessment
      }
    }

    return {
      goal: input.goal,
      relevantFiles,
      blastRadius: blastTotal,
      complexity,
      risk,
      isAmbiguous,
      signals: {
        fileCount,
        edgeCount,
        blastRadiusTotal: blastTotal,
        activeFilesCount,
        ...(priorFailures && { priorFailures }),
        ...(priorSuccess && { priorSuccess }),
      },
    };
  }

  private assessComplexity(fileCount: number): TaskComplexity {
    if (fileCount <= 2) return 'simple';
    if (fileCount <= 8) return 'moderate';
    if (fileCount <= 20) return 'complex';
    return 'critical';
  }

  private assessRisk(blastTotal: number): TaskRisk {
    if (blastTotal <= 3) return 'low';
    if (blastTotal <= 10) return 'medium';
    if (blastTotal <= 25) return 'high';
    return 'critical';
  }

  private assessAmbiguity(input: GoalInput): boolean {
    if (input.hints?.isAmbiguous) return true;

    const goalLower = input.goal.toLowerCase();

    if (input.goal.includes('?')) return true;

    for (const word of AMBIGUITY_WORDS) {
      if (goalLower.includes(word)) return true;
    }

    return false;
  }
}
