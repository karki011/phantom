/**
 * DirectStrategy — Fast path execution (Graph -> Executor -> Response)
 * Default strategy for simple, low-risk tasks
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

export class DirectStrategy implements ReasoningStrategy {
  readonly id = 'direct';
  readonly name = 'Direct Execution';
  readonly version = '1.0.0';
  readonly description =
    'Fast-path strategy for simple, low-risk tasks. Passes graph context straight to the executor.';

  shouldActivate(context: TaskContext): ActivationScore {
    const { complexity, risk } = context;

    if (complexity === 'simple' && risk === 'low') {
      return { score: 0.9, reason: 'Simple task with low risk — ideal for direct execution' };
    }
    if (complexity === 'moderate' && risk === 'low') {
      return { score: 0.6, reason: 'Moderate complexity but low risk — direct execution viable' };
    }
    if (complexity === 'simple' && risk === 'medium') {
      return { score: 0.5, reason: 'Simple task with medium risk — direct execution possible with caution' };
    }

    return { score: 0.2, reason: 'Complex or high-risk task — direct execution available as fallback' };
  }

  async execute(input: StrategyInput): Promise<StrategyOutput> {
    const start = Date.now();
    const filesUsed = input.graphContext.files.length;

    // Confidence scales with the amount of relevant context available
    const confidence = Math.min(0.95, 0.5 + filesUsed * 0.05);

    // Pass-through: the graph context IS the result for direct strategy
    const result = JSON.stringify({
      type: 'direct-execution',
      goal: input.context.goal,
      files: input.graphContext.files,
      edges: input.graphContext.edges,
    });

    return {
      strategyId: this.id,
      result,
      confidence,
      tokensUsed: 0, // No LLM call — placeholder
      durationMs: Date.now() - start,
      artifacts: {
        strategy: 'direct',
        filesUsed,
      },
    };
  }
}
