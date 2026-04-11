/**
 * TaskAssessor — Assesses task complexity, risk, and ambiguity from goal + graph context
 * @author Subash Karki
 */
import type { ContextResult, BlastRadiusResult } from '../types/graph.js';
import type { TaskComplexity, TaskContext, TaskRisk } from '../types/strategy.js';
import type { GoalInput } from './types.js';

const AMBIGUITY_WORDS = ['should', 'maybe', 'not sure', 'consider', 'perhaps', 'might'];

export class TaskAssessor {
  /**
   * Assess task complexity, risk, and ambiguity from a goal and its graph context.
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
