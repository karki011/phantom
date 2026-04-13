/**
 * DebateStrategy — Multi-perspective deliberation for high-risk decisions
 *
 * Simulates a debate between an "advocate" (supports the proposed approach)
 * and a "critic" (challenges it). A "judge" then synthesizes the best path.
 * Used for high-risk outputs where a single perspective might miss dangers.
 *
 * @author Subash Karki
 */
import type {
  ActivationScore,
  ReasoningStrategy,
  StrategyInput,
  StrategyOutput,
  TaskContext,
} from '../types/strategy.js';
import { applyPriorFailurePenalty } from './prior-penalty.js';

// ---------------------------------------------------------------------------
// Debate types
// ---------------------------------------------------------------------------

interface DebateRound {
  round: number;
  advocate: string;
  critic: string;
}

// ---------------------------------------------------------------------------
// Strategy
// ---------------------------------------------------------------------------

export class DebateStrategy implements ReasoningStrategy {
  readonly id = 'debate';
  readonly name = 'Debate';
  readonly version = '1.0.0';
  readonly description =
    'Multi-perspective deliberation for high-risk decisions. Simulates advocate vs. critic debate with judge synthesis.';

  private numRounds: number;

  constructor(options?: { numRounds?: number }) {
    this.numRounds = options?.numRounds ?? 2;
  }

  shouldActivate(context: TaskContext): ActivationScore {
    const { complexity, risk, blastRadius } = context;

    let base: ActivationScore;

    if (risk === 'critical') {
      base = {
        score: 0.9,
        reason: 'Critical risk — debate deliberation strongly recommended',
      };
    } else if (risk === 'high' && (complexity === 'moderate' || complexity === 'complex' || complexity === 'critical')) {
      base = {
        score: 0.8,
        reason: `High risk with ${complexity} complexity — debate deliberation recommended`,
      };
    } else if (risk === 'high' && complexity === 'simple') {
      base = {
        score: 0.6,
        reason: 'High risk but simple complexity — debate may help identify hidden risks',
      };
    } else if (blastRadius > 15) {
      base = {
        score: 0.7,
        reason: `Large blast radius (${blastRadius} files) — multi-perspective review recommended`,
      };
    } else {
      base = {
        score: 0.05,
        reason: 'Low risk — debate deliberation rarely needed',
      };
    }

    return applyPriorFailurePenalty(base, this.id, context);
  }

  async execute(input: StrategyInput): Promise<StrategyOutput> {
    const start = Date.now();
    const { context, graphContext } = input;

    const filePaths = graphContext.files.map((f) => f.path).join(', ');

    // 1. Build advocate position
    const advocatePoints = this.buildAdvocatePoints(context, filePaths);

    // 2. Build critic position (enriched with prior failure knowledge)
    const criticPoints = this.buildCriticPoints(context);

    // If prior failures exist for similar goals, the critic starts from known failure points
    const priorFailures = context.signals.priorFailures as Array<{ strategyId: string; failureReason: string | null }> | undefined;
    if (priorFailures && priorFailures.length > 0) {
      for (const failure of priorFailures) {
        if (failure.failureReason) {
          criticPoints.push(`Prior approach "${failure.strategyId}" failed: ${failure.failureReason}`);
        }
      }
    }

    // 3. Run debate rounds
    const rounds = this.runRounds(advocatePoints, criticPoints);

    // 4. Judge synthesis
    const judgeSynthesis = this.synthesize(advocatePoints, criticPoints, context);

    // 5. Format result
    const result = JSON.stringify({
      type: 'debate',
      goal: context.goal,
      rounds,
      advocatePoints,
      criticPoints,
      judgeSynthesis,
    });

    // 6. Calculate confidence
    const confidence = this.calculateConfidence(context);

    return {
      strategyId: this.id,
      result,
      confidence,
      tokensUsed: 0, // No LLM call — placeholder
      durationMs: Date.now() - start,
      artifacts: {
        strategy: 'debate',
        rounds: this.numRounds,
        advocatePoints,
        criticPoints,
        judgeSynthesis,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private buildAdvocatePoints(context: TaskContext, filePaths: string): string[] {
    const points: string[] = [];

    points.push(
      `Given "${context.goal}" and context files [${filePaths}], the direct approach is best because it addresses the goal directly.`,
    );

    if (context.complexity === 'simple' || context.complexity === 'moderate') {
      points.push('The task complexity is manageable, reducing implementation risk.');
    }

    if (context.blastRadius <= 5) {
      points.push(`Small blast radius (${context.blastRadius} files) limits potential damage.`);
    }

    points.push('Proceeding promptly avoids accumulating technical debt from delayed decisions.');

    return points;
  }

  private buildCriticPoints(context: TaskContext): string[] {
    const points: string[] = [];

    if (context.blastRadius > 5) {
      points.push(
        `The blast radius of ${context.blastRadius} files means errors could propagate widely.`,
      );
    }

    if (context.risk === 'high' || context.risk === 'critical') {
      points.push(
        `Risk level is ${context.risk} — a single mistake could have significant consequences.`,
      );
    }

    if (context.complexity === 'complex' || context.complexity === 'critical') {
      points.push(
        `Task complexity is ${context.complexity} — hidden edge cases are likely.`,
      );
    }

    if (context.isAmbiguous) {
      points.push('Requirements are ambiguous — the proposed approach may solve the wrong problem.');
    }

    points.push('Consider whether incremental rollout or feature flags could reduce risk.');

    return points;
  }

  private runRounds(advocatePoints: string[], criticPoints: string[]): DebateRound[] {
    const rounds: DebateRound[] = [];

    for (let r = 1; r <= this.numRounds; r++) {
      if (r === 1) {
        rounds.push({
          round: r,
          advocate: `Advocate presents: ${advocatePoints.join(' ')}`,
          critic: `Critic responds: ${criticPoints.join(' ')}`,
        });
      } else {
        rounds.push({
          round: r,
          advocate: `Advocate rebuts: The concerns raised are valid but manageable with proper testing and review.`,
          critic: `Critic final word: Acknowledge mitigations but emphasize monitoring post-deployment.`,
        });
      }
    }

    return rounds;
  }

  private synthesize(
    advocatePoints: string[],
    criticPoints: string[],
    context: TaskContext,
  ): string {
    return [
      `Judge synthesis for "${context.goal}":`,
      `Advocate strengths (${advocatePoints.length} points): The approach is direct and addresses the goal.`,
      `Critic concerns (${criticPoints.length} points): Risk and blast radius require mitigation.`,
      'Recommendation: Proceed with the approach but add safeguards — incremental rollout, testing, and monitoring.',
    ].join(' ');
  }

  private calculateConfidence(context: TaskContext): number {
    let confidence = 0.7;

    if (context.blastRadius <= 5) {
      confidence += 0.1;
    }

    if (context.complexity === 'simple') {
      confidence += 0.1;
    }

    return Math.min(0.95, Math.round(confidence * 100) / 100);
  }
}
