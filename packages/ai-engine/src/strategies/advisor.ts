/**
 * AdvisorStrategy — Escalate to stronger model for complex decisions
 * Used when executor is uncertain or task is complex
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

export class AdvisorStrategy implements ReasoningStrategy {
  readonly id = 'advisor';
  readonly name = 'Advisor Escalation';
  readonly version = '1.0.0';
  readonly description =
    'Escalates complex or high-risk tasks to a stronger model for deeper reasoning.';

  shouldActivate(context: TaskContext): ActivationScore {
    const { complexity, risk, isAmbiguous, blastRadius } = context;

    let base: ActivationScore;

    if (risk === 'high' || risk === 'critical') {
      base = { score: 0.85, reason: `High/critical risk (${risk}) — advisor review required` };
    } else if (complexity === 'complex' || complexity === 'critical') {
      base = { score: 0.8, reason: `Complex/critical task (${complexity}) — advisor reasoning needed` };
    } else if (isAmbiguous) {
      base = { score: 0.7, reason: 'Ambiguous requirements — advisor can disambiguate' };
    } else if (blastRadius > 10) {
      base = { score: 0.6, reason: `Large blast radius (${blastRadius} files) — advisor should review` };
    } else if (complexity === 'moderate' && risk === 'medium') {
      base = { score: 0.4, reason: 'Moderate complexity with medium risk — advisor may help' };
    } else {
      base = { score: 0.1, reason: 'Low complexity/risk — advisor not needed' };
    }

    return applyPriorFailurePenalty(base, this.id, context);
  }

  async execute(input: StrategyInput): Promise<StrategyOutput> {
    const start = Date.now();
    const { context, graphContext } = input;

    // Determine the escalation reason
    const reason = this.shouldActivate(context).reason;

    // Structure the advisor prompt — the actual LLM call happens upstream
    const advisorPrompt = JSON.stringify({
      type: 'advisor-escalation',
      goal: context.goal,
      complexity: context.complexity,
      risk: context.risk,
      isAmbiguous: context.isAmbiguous,
      blastRadius: context.blastRadius,
      escalationReason: reason,
      relevantFiles: graphContext.files,
      edges: graphContext.edges,
      signals: context.signals,
    });

    return {
      strategyId: this.id,
      result: advisorPrompt,
      confidence: 0.5, // Needs advisor to verify
      tokensUsed: 0, // No LLM call — placeholder
      durationMs: Date.now() - start,
      artifacts: {
        strategy: 'advisor',
        escalationReason: reason,
        contextSize: graphContext.files.length,
      },
    };
  }
}
