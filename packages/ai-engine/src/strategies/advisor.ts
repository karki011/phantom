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

export class AdvisorStrategy implements ReasoningStrategy {
  readonly id = 'advisor';
  readonly name = 'Advisor Escalation';
  readonly version = '1.0.0';
  readonly description =
    'Escalates complex or high-risk tasks to a stronger model for deeper reasoning.';

  shouldActivate(context: TaskContext): ActivationScore {
    const { complexity, risk, isAmbiguous, blastRadius } = context;

    if (risk === 'high' || risk === 'critical') {
      return { score: 0.85, reason: `High/critical risk (${risk}) — advisor review required` };
    }
    if (complexity === 'complex' || complexity === 'critical') {
      return { score: 0.8, reason: `Complex/critical task (${complexity}) — advisor reasoning needed` };
    }
    if (isAmbiguous) {
      return { score: 0.7, reason: 'Ambiguous requirements — advisor can disambiguate' };
    }
    if (blastRadius > 10) {
      return { score: 0.6, reason: `Large blast radius (${blastRadius} files) — advisor should review` };
    }
    if (complexity === 'moderate' && risk === 'medium') {
      return { score: 0.4, reason: 'Moderate complexity with medium risk — advisor may help' };
    }

    return { score: 0.1, reason: 'Low complexity/risk — advisor not needed' };
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
