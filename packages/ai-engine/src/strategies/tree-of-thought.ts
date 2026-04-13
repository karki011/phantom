/**
 * TreeOfThoughtStrategy — Explores multiple reasoning branches for ambiguous tasks
 *
 * Instead of following one path, generates multiple "thought branches",
 * evaluates each, and selects the most promising one. Useful when the
 * task has multiple valid approaches and it's unclear which is best.
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
// Branch types
// ---------------------------------------------------------------------------

interface BranchScore {
  feasibility: number;
  risk: number;
  effort: number;
  combined: number;
}

interface ThoughtBranch {
  id: number;
  approach: string;
  prompt: string;
  score: BranchScore;
}

// ---------------------------------------------------------------------------
// Strategy
// ---------------------------------------------------------------------------

export class TreeOfThoughtStrategy implements ReasoningStrategy {
  readonly id = 'tree-of-thought';
  readonly name = 'Tree of Thoughts';
  readonly version = '1.0.0';
  readonly description =
    'Explores multiple reasoning branches for ambiguous tasks, evaluates each, and selects the most promising one.';

  private readonly numBranches = 3;

  shouldActivate(context: TaskContext): ActivationScore {
    const { complexity, risk, isAmbiguous } = context;

    let base: ActivationScore;

    if (isAmbiguous && (complexity === 'moderate' || complexity === 'complex' || complexity === 'critical')) {
      base = {
        score: 0.85,
        reason: `Ambiguous task with ${complexity} complexity — tree-of-thought exploration recommended`,
      };
    } else if (isAmbiguous && complexity === 'simple') {
      base = {
        score: 0.5,
        reason: 'Ambiguous but simple task — tree-of-thought may help but is not critical',
      };
    } else if (
      (complexity === 'complex' || complexity === 'critical') &&
      (risk === 'medium' || risk === 'high' || risk === 'critical')
    ) {
      base = {
        score: 0.6,
        reason: `Complex task (${complexity}) with ${risk} risk — multiple approaches worth exploring`,
      };
    } else {
      base = {
        score: 0.1,
        reason: 'Simple or low-risk task — single path sufficient',
      };
    }

    return applyPriorFailurePenalty(base, this.id, context);
  }

  async execute(input: StrategyInput): Promise<StrategyOutput> {
    const start = Date.now();
    const { context, graphContext } = input;

    // 1. Generate thought branches
    const branches = this.generateBranches(context, graphContext);

    // 2. Score each branch
    const scoredBranches = branches.map((branch) => ({
      ...branch,
      score: this.scoreBranch(branch, context),
    }));

    // 3. Select the best branch
    let selectedIndex = 0;
    let highestCombined = -1;
    for (let i = 0; i < scoredBranches.length; i++) {
      if (scoredBranches[i].score.combined > highestCombined) {
        highestCombined = scoredBranches[i].score.combined;
        selectedIndex = i;
      }
    }

    const selected = scoredBranches[selectedIndex];

    // 4. Format the result
    const result = JSON.stringify({
      type: 'tree-of-thought',
      goal: context.goal,
      selectedBranch: {
        id: selected.id,
        approach: selected.approach,
        score: selected.score,
      },
      alternatives: scoredBranches
        .filter((_, i) => i !== selectedIndex)
        .map((b) => ({
          id: b.id,
          approach: b.approach,
          score: b.score,
        })),
    });

    // Confidence is the average of the winning branch's scores
    const confidence =
      (selected.score.feasibility + (1 - selected.score.risk) + (1 - selected.score.effort)) / 3;

    return {
      strategyId: this.id,
      result,
      confidence: Math.round(confidence * 100) / 100,
      tokensUsed: 0, // No LLM call — placeholder
      durationMs: Date.now() - start,
      artifacts: {
        strategy: 'tree-of-thought',
        branches: scoredBranches.map((b) => ({
          id: b.id,
          approach: b.approach,
          score: b.score,
        })),
        selectedBranch: selected.id,
        branchScores: scoredBranches.map((b) => b.score),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private generateBranches(
    context: TaskContext,
    graphContext: StrategyInput['graphContext'],
  ): ThoughtBranch[] {
    const filePaths = graphContext.files.map((f) => f.path).join(', ');

    const approaches = [
      'Direct approach — implement as described',
      'Conservative approach — minimal changes, maximize reuse',
      'Refactoring approach — restructure then implement',
    ];

    return approaches.slice(0, this.numBranches).map((approach, i) => ({
      id: i + 1,
      approach,
      prompt: [
        `Branch ${i + 1}: ${approach}`,
        `Context files: ${filePaths || 'none'}`,
        `Goal: ${context.goal}`,
        'Evaluate: feasibility (0-1), risk (0-1), effort (0-1)',
      ].join('\n'),
      score: { feasibility: 0, risk: 0, effort: 0, combined: 0 },
    }));
  }

  private scoreBranch(branch: ThoughtBranch, context: TaskContext): BranchScore {
    const riskMultiplier =
      context.risk === 'critical'
        ? 0.8
        : context.risk === 'high'
          ? 0.6
          : context.risk === 'medium'
            ? 0.4
            : 0.2;

    const blastRadiusRisk = Math.min(1, context.blastRadius / 20);

    switch (branch.id) {
      case 1: {
        // Direct approach
        const feasibility = 0.8;
        const risk = Math.min(1, riskMultiplier + blastRadiusRisk * 0.3);
        const effort = 0.5;
        const combined = (feasibility + (1 - risk) + (1 - effort)) / 3;
        return { feasibility, risk: Math.round(risk * 100) / 100, effort, combined: Math.round(combined * 100) / 100 };
      }
      case 2: {
        // Conservative approach
        const feasibility = 0.9;
        const risk = 0.2;
        const effort = 0.3;
        const combined = (feasibility + (1 - risk) + (1 - effort)) / 3;
        return { feasibility, risk, effort, combined: Math.round(combined * 100) / 100 };
      }
      case 3: {
        // Refactoring approach
        const feasibility = 0.6;
        const risk = 0.5;
        const effort = 0.8;
        const combined = (feasibility + (1 - risk) + (1 - effort)) / 3;
        return { feasibility, risk, effort, combined: Math.round(combined * 100) / 100 };
      }
      default: {
        return { feasibility: 0.5, risk: 0.5, effort: 0.5, combined: 0.5 };
      }
    }
  }
}
