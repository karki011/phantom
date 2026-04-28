/**
 * Orchestrator — Routes user goals through the AI strategy pipeline
 *
 * Pipeline: Goal -> Graph Context -> Task Assessment -> Strategy Selection -> Execution -> Evaluation
 *
 * @author Subash Karki
 */
import type { GraphQuery } from '../graph/query.js';
import type { StrategyRegistry } from '../strategies/registry.js';
import type { BlastRadiusResult, ContextResult } from '../types/graph.js';
import type { StrategyInput, StrategyOutput } from '../types/strategy.js';
import type { GoalInput, OrchestratorResult, IDecisionQuery } from './types.js';
import type { KnowledgeWriter } from './knowledge-writer.js';
import type { Compactor } from './compactor.js';
import type { DecisionQuery, PriorDecision } from '../graph/decision-query.js';
import { TaskAssessor } from './assessor.js';
import { Evaluator } from './evaluator.js';
import { MultiPerspectiveEvaluator } from './multi-evaluator.js';

// Keep constants for back-compat (external code may reference them) but the
// orchestrator no longer uses them as lookup keys — role tags are used instead.
export const SELF_REFINE_STRATEGY_ID = 'self-refine';
export const ADVISOR_STRATEGY_ID = 'advisor';

/**
 * Per-request cache for findSimilarDecisions results.
 * Wraps a DecisionQuery and memoizes results within a single process() call.
 * Cleared at the start of each new request so data is always fresh.
 *
 * Cache key: `${goal}|${minSimilarity}|${limit}`
 */
class RequestScopedDecisionQuery implements IDecisionQuery {
  private cache = new Map<string, PriorDecision[]>();

  constructor(private inner: DecisionQuery) {}

  findSimilarDecisions(goal: string, minSimilarity = 0.3, limit = 10): PriorDecision[] {
    const key = `${goal}|${minSimilarity}|${limit}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const result = this.inner.findSimilarDecisions(goal, minSimilarity, limit);
    this.cache.set(key, result);
    return result;
  }

  getFailedApproaches(goal: string): ReturnType<DecisionQuery['getFailedApproaches']> {
    // Use cached findSimilarDecisions so assessor and evaluator share results
    const similar = this.findSimilarDecisions(goal);
    if (similar.length === 0) return [];
    const outcomes = this.inner.getOutcomes(similar.map((d) => d.id));
    return similar
      .filter((d) => {
        const o = outcomes.get(d.id);
        return o && !o.success;
      })
      .map((d) => {
        const o = outcomes.get(d.id)!;
        return {
          strategyId: d.strategyId,
          strategyName: d.strategyName,
          failureReason: o.failureReason,
          confidence: d.confidence,
          createdAt: d.createdAt,
        };
      });
  }

  getSuccessfulApproaches(goal: string): ReturnType<DecisionQuery['getSuccessfulApproaches']> {
    // Use cached findSimilarDecisions so assessor and evaluator share results
    const similar = this.findSimilarDecisions(goal);
    if (similar.length === 0) return [];
    const outcomes = this.inner.getOutcomes(similar.map((d) => d.id));
    return similar
      .filter((d) => {
        const o = outcomes.get(d.id);
        return o && o.success;
      })
      .map((d) => ({
        strategyId: d.strategyId,
        strategyName: d.strategyName,
        confidence: d.confidence,
        createdAt: d.createdAt,
      }));
  }

  getOutcomes(decisionIds: string[]): ReturnType<DecisionQuery['getOutcomes']> {
    return this.inner.getOutcomes(decisionIds);
  }

  /** Clear the cache — called at the start of each process() call. */
  clear(): void {
    this.cache.clear();
  }
}

export class Orchestrator {
  private assessor = new TaskAssessor();
  private evaluator: Evaluator;
  private knowledgeWriter: KnowledgeWriter | null = null;
  private compactor: Compactor | null = null;
  private compactionDone = false;
  private requestDecisionQuery: RequestScopedDecisionQuery | null = null;

  constructor(
    private graphQuery: GraphQuery,
    private strategyRegistry: StrategyRegistry,
    options?: { knowledgeWriter?: KnowledgeWriter; compactor?: Compactor; decisionQuery?: DecisionQuery },
  ) {
    this.knowledgeWriter = options?.knowledgeWriter ?? null;
    this.compactor = options?.compactor ?? null;

    if (options?.decisionQuery) {
      this.requestDecisionQuery = new RequestScopedDecisionQuery(options.decisionQuery);
      // Wire assessor and evaluator to the cached query proxy so all similarity
      // lookups within a single process() call share one DB read.
      this.assessor.setDecisionQuery(this.requestDecisionQuery);
      this.evaluator = new MultiPerspectiveEvaluator(this.requestDecisionQuery);
    } else {
      this.evaluator = new Evaluator();
    }
  }

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

    // Clear per-request cache — ensures each process() call gets fresh data
    this.requestDecisionQuery?.clear();

    // Lazy compaction: run once on first process() call
    if (this.compactor && !this.compactionDone) {
      this.compactor.run();
      this.compactionDone = true;
    }

    // Step 1: Graph Context — merge context from all active files
    const graphContext = this.gatherContext(input);

    // Step 2: Blast Radius — merge across ALL active files
    const blastRadius = this.mergeBlastRadius(input.activeFiles);

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

    // Step 8: Evaluate (use history-aware evaluation when decisionQuery is wired)
    const doEvaluate = (o: StrategyOutput) =>
      this.evaluator instanceof MultiPerspectiveEvaluator
        ? this.evaluator.evaluateWithHistory(o, taskContext)
        : this.evaluator.evaluate(o, taskContext);

    let evaluation = doEvaluate(output);

    // Step 9: Auto-refine — if evaluator recommends 'refine', try one self-refine iteration.
    // Look up by role tag ('refiner') so renaming the strategy ID doesn't silently break this.
    if (
      evaluation.recommendation === 'refine' &&
      selectedStrategy.role !== 'refiner'
    ) {
      const refineEntry = this.strategyRegistry.getByRole('refiner');
      if (refineEntry) {
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
        evaluation = doEvaluate(output);
      }
    }

    // Step 10: Record decision + outcome to knowledge DB (non-blocking)
    if (this.knowledgeWriter) {
      this.knowledgeWriter.record(
        { strategy: { id: selectedStrategy.id, name: selectedStrategy.name, reason: activationScore?.score.reason ?? 'selected', score: activationScore?.score.score ?? 0 }, alternatives: [], context: { files: graphContext.files.map((f) => ({ path: f.path, relevance: graphContext.scores.get(f.id) ?? 0 })), blastRadius: blastRadius.direct.length + blastRadius.transitive.length, relatedFiles }, taskContext, output, totalDurationMs: Date.now() - pipelineStart },
        evaluation,
      );
    }

    // Step 11: Assemble result
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
      const evaluation = this.evaluator instanceof MultiPerspectiveEvaluator
        ? this.evaluator.evaluateWithHistory(result.output, result.taskContext)
        : this.evaluator.evaluate(result.output, result.taskContext);
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
   * Merge blast radius results from all active files into a single result.
   * Deduplicates affected files by ID and takes the max impact score.
   */
  private mergeBlastRadius(activeFiles?: string[]): BlastRadiusResult {
    if (!activeFiles || activeFiles.length === 0) return emptyBlastRadius();

    const allDirect = new Map<string, BlastRadiusResult['direct'][number]>();
    const allTransitive = new Map<string, BlastRadiusResult['transitive'][number]>();
    let maxImpactScore = 0;

    for (const file of activeFiles) {
      const br = this.graphQuery.getBlastRadius(file);
      for (const f of br.direct) allDirect.set(f.id, f);
      for (const f of br.transitive) allTransitive.set(f.id, f);
      maxImpactScore = Math.max(maxImpactScore, br.impactScore);
    }

    return {
      direct: [...allDirect.values()],
      transitive: [...allTransitive.values()],
      impactScore: maxImpactScore,
    };
  }

  /**
   * Gather and merge graph context from all active files.
   */
  private gatherContext(input: GoalInput): ContextResult {
    const activeFiles = input.activeFiles ?? [];

    if (activeFiles.length === 0) {
      return { files: [], edges: [], modules: [], documents: [], scores: new Map() };
    }

    // Merge context results from all active files
    const mergedFiles = new Map<string, ContextResult['files'][number]>();
    const mergedEdges = new Map<string, ContextResult['edges'][number]>();
    const mergedModules = new Map<string, ContextResult['modules'][number]>();
    const mergedDocuments = new Map<string, ContextResult['documents'][number]>();
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

      for (const doc of ctx.documents) {
        mergedDocuments.set(doc.id, doc);
      }
    }

    return {
      files: [...mergedFiles.values()],
      edges: [...mergedEdges.values()],
      modules: [...mergedModules.values()],
      documents: [...mergedDocuments.values()],
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
