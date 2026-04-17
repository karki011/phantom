/**
 * SelfRefineStrategy — Iterative refinement loop for improving output quality
 * Used when output is close but needs polishing
 *
 * @author Subash Karki
 */
import type {
  ActivationScore,
  ReasoningStrategy,
  StrategyInput,
  StrategyOutput,
  StrategyRole,
  TaskContext,
} from '../types/strategy.js';

export class SelfRefineStrategy implements ReasoningStrategy {
  readonly id = 'self-refine';
  readonly name = 'Self-Refine';
  readonly version = '1.0.0';
  readonly description =
    'Iterative refinement strategy for improving near-final outputs to higher quality.';
  readonly role: StrategyRole = 'refiner';

  shouldActivate(context: TaskContext): ActivationScore {
    const { complexity, isAmbiguous } = context;

    // Self-refine needs previous outputs with signals about confidence
    const previousConfidence = (context.signals?.previousConfidence as number) ?? 0;
    const hasPreviousOutputs = (context.signals?.hasPreviousOutputs as boolean) ?? false;

    if (hasPreviousOutputs && previousConfidence > 0.5 && previousConfidence < 0.85) {
      return {
        score: 0.8,
        reason: `Previous output exists with moderate confidence (${previousConfidence}) — refinement can improve quality`,
      };
    }
    if (complexity === 'moderate' && !isAmbiguous) {
      return {
        score: 0.5,
        reason: 'Moderate complexity with clear requirements — refinement may help',
      };
    }

    return { score: 0.1, reason: 'No refinement opportunity detected' };
  }

  async execute(input: StrategyInput): Promise<StrategyOutput> {
    const start = Date.now();
    const { previousOutputs } = input;

    // Nothing to refine
    if (!previousOutputs || previousOutputs.length === 0) {
      return {
        strategyId: this.id,
        result: JSON.stringify({
          type: 'self-refine',
          note: 'Nothing to refine — no previous outputs available',
        }),
        confidence: 0.1,
        tokensUsed: 0,
        durationMs: Date.now() - start,
        artifacts: {
          strategy: 'self-refine',
          iterationCount: 0,
          improvementDelta: 0,
        },
      };
    }

    const lastOutput = previousOutputs[previousOutputs.length - 1];
    const improvedConfidence = Math.min(0.95, lastOutput.confidence + 0.15);
    const delta = improvedConfidence - lastOutput.confidence;

    // Structure a refinement prompt — actual LLM call happens upstream
    const refinementPrompt = JSON.stringify({
      type: 'self-refine',
      goal: input.context.goal,
      previousResult: lastOutput.result,
      previousConfidence: lastOutput.confidence,
      targetConfidence: improvedConfidence,
      iterationNumber: previousOutputs.length,
      files: input.graphContext.files,
    });

    return {
      strategyId: this.id,
      result: refinementPrompt,
      confidence: improvedConfidence,
      tokensUsed: 0, // No LLM call — placeholder
      durationMs: Date.now() - start,
      artifacts: {
        strategy: 'self-refine',
        iterationCount: previousOutputs.length,
        improvementDelta: delta,
      },
    };
  }
}
