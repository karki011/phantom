/**
 * Orchestrator — Routes user goals through the AI strategy pipeline
 *
 * Pipeline: Goal -> Graph Context -> Task Assessment -> Strategy Selection -> Execution -> Evaluation
 *
 * @author Subash Karki
 */
import type { GraphQuery } from '../graph/query.js';
import type { StrategyRegistry } from '../strategies/registry.js';
import type { EventBus } from '../events/event-bus.js';
import type { BlastRadiusResult, ContextResult } from '../types/graph.js';
import type { StrategyInput, StrategyOutput } from '../types/strategy.js';
import type { GoalInput, OrchestratorResult } from './types.js';
import { TaskAssessor } from './assessor.js';
import { Evaluator } from './evaluator.js';

const SELF_REFINE_STRATEGY_ID = 'self-refine';
const ADVISOR_STRATEGY_ID = 'advisor';

export class Orchestrator {
  private assessor = new TaskAssessor();
  private evaluator = new Evaluator();

  constructor(
    private graphQuery: GraphQuery,
    private strategyRegistry: StrategyRegistry,
    private eventBus: EventBus,
  ) {}

  /**
   * Process a user goal through the full strategy pipeline.
   *
   * 1. Gather graph context (context, blast radius, related files)
   * 2. Assess task complexity/risk/ambiguity
   * 3. Select and execute best strategy
   * 4. Evaluate output; optionally auto-refine
   * 5. Return assembled result
   */
  async process(input: GoalInput): Promise<OrchestratorResult> {
    const pipelineStart = Date.now();

    // Step 1: Graph Context — merge context from all active files
    const graphContext = this.gatherContext(input);

    // Step 2: Blast Radius — use primary active file (first one)
    const primaryFile = input.activeFiles?.[0];
    const blastRadius = primaryFile
      ? this.graphQuery.getBlastRadius(primaryFile)
      : emptyBlastRadius();

    // Step 3: Related Files
    const relatedFileNodes = input.activeFiles?.length
      ? this.graphQuery.getRelatedFiles(input.activeFiles)
      : [];
    const relatedFiles = relatedFileNodes.map((f) => f.path);

    // Step 4: Assess
    const taskContext = this.assessor.assess(input, graphContext, blastRadius);

    // Step 5: Select Strategy
    const selectedStrategy = this.strategyRegistry.select(taskContext);

    // Step 6: Get Alternatives (for observability)
    const allScored = this.strategyRegistry.selectAll(taskContext);
    const activationScore = allScored.find((s) => s.strategy.id === selectedStrategy.id);

    // Step 7: Build strategy input and execute
    const strategyInput = this.buildStrategyInput(taskContext, graphContext);
    let output = await selectedStrategy.execute(strategyInput);

    // Step 8: Evaluate
    let evaluation = this.evaluator.evaluate(output, taskContext);

    // Step 9: Auto-refine — if evaluator recommends 'refine', try one self-refine iteration
    if (
      evaluation.recommendation === 'refine' &&
      selectedStrategy.id !== SELF_REFINE_STRATEGY_ID
    ) {
      const refineEntry = this.strategyRegistry.get(SELF_REFINE_STRATEGY_ID);
      if (refineEntry?.enabled) {
        const refineInput: StrategyInput = {
          ...strategyInput,
          context: {
            ...taskContext,
            signals: {
              ...taskContext.signals,
              hasPreviousOutputs: true,
              previousConfidence: output.confidence,
            },
          },
          previousOutputs: [output],
        };
        output = await refineEntry.strategy.execute(refineInput);
        evaluation = this.evaluator.evaluate(output, taskContext);
      }
    }

    // Step 10: Assemble result
    const contextFiles = graphContext.files.map((f) => ({
      path: f.path,
      relevance: graphContext.scores.get(f.id) ?? 0,
    }));

    const blastTotal = blastRadius.direct.length + blastRadius.transitive.length;

    return {
      strategy: {
        id: selectedStrategy.id,
        name: selectedStrategy.name,
        reason: activationScore?.score.reason ?? 'selected',
        score: activationScore?.score.score ?? 0,
      },
      alternatives: allScored.map((s) => ({
        id: s.strategy.id,
        name: s.strategy.name,
        score: s.score.score,
        reason: s.score.reason,
      })),
      context: {
        files: contextFiles,
        blastRadius: blastTotal,
        relatedFiles,
      },
      taskContext,
      output,
      totalDurationMs: Date.now() - pipelineStart,
    };
  }

  /**
   * Process with retry — escalates strategy if the evaluator keeps recommending 'escalate'.
   */
  async processWithRetry(
    input: GoalInput,
    maxRetries = 2,
  ): Promise<OrchestratorResult> {
    let result = await this.process(input);
    let retries = 0;

    while (retries < maxRetries) {
      const evaluation = this.evaluator.evaluate(result.output, result.taskContext);
      if (evaluation.recommendation !== 'escalate') break;

      // Escalate: force advisor hints and retry
      const escalatedInput: GoalInput = {
        ...input,
        hints: {
          ...input.hints,
          isCritical: true,
          estimatedComplexity: 'complex',
        },
      };

      result = await this.process(escalatedInput);
      retries++;
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Gather and merge graph context from all active files.
   */
  private gatherContext(input: GoalInput): ContextResult {
    const activeFiles = input.activeFiles ?? [];

    if (activeFiles.length === 0) {
      return { files: [], edges: [], modules: [], scores: new Map() };
    }

    // Merge context results from all active files
    const mergedFiles = new Map<string, ContextResult['files'][number]>();
    const mergedEdges = new Map<string, ContextResult['edges'][number]>();
    const mergedModules = new Map<string, ContextResult['modules'][number]>();
    const mergedScores = new Map<string, number>();

    for (const filePath of activeFiles) {
      const ctx = this.graphQuery.getContext(filePath);

      for (const file of ctx.files) {
        mergedFiles.set(file.id, file);
        // Keep the highest relevance score
        const existing = mergedScores.get(file.id) ?? 0;
        const incoming = ctx.scores.get(file.id) ?? 0;
        mergedScores.set(file.id, Math.max(existing, incoming));
      }

      for (const edge of ctx.edges) {
        mergedEdges.set(edge.id, edge);
      }

      for (const mod of ctx.modules) {
        mergedModules.set(mod.id, mod);
      }
    }

    return {
      files: [...mergedFiles.values()],
      edges: [...mergedEdges.values()],
      modules: [...mergedModules.values()],
      scores: mergedScores,
    };
  }

  /**
   * Build the StrategyInput from assessed task context and graph context.
   */
  private buildStrategyInput(
    taskContext: import('../types/strategy.js').TaskContext,
    graphContext: ContextResult,
  ): StrategyInput {
    return {
      context: taskContext,
      graphContext: {
        files: graphContext.files.map((f) => ({
          path: f.path,
          relevance: graphContext.scores.get(f.id) ?? 0,
        })),
        edges: graphContext.edges.map((e) => ({
          source: e.sourceId,
          target: e.targetId,
          type: e.type,
        })),
      },
    };
  }
}

function emptyBlastRadius(): BlastRadiusResult {
  return { direct: [], transitive: [], impactScore: 0 };
}
