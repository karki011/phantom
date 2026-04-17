/**
 * KnowledgeWriter — Records orchestrator decisions and outcomes to the knowledge DB
 * Implements OmegaWiki's "everything writes back" pattern for knowledge compounding.
 *
 * After every orchestrator pipeline run, decision context, evaluation outcome,
 * and per-strategy performance are persisted so the engine can learn from its
 * own history and improve future strategy selection.
 *
 * @author Subash Karki
 */
import type { KnowledgeDB } from '../knowledge/knowledge-db.js';
import type { EventBus } from '../events/event-bus.js';
import type { OrchestratorResult, EvaluationResult } from './types.js';
import { randomUUID } from 'node:crypto';
import { DecisionRepository } from '../knowledge/repositories/decision-repository.js';
import { PerformanceRepository } from '../knowledge/repositories/performance-repository.js';

// ---------------------------------------------------------------------------
// KnowledgeWriter
// ---------------------------------------------------------------------------

export class KnowledgeWriter {
  private decisionRepo: DecisionRepository;
  private performanceRepo: PerformanceRepository;

  constructor(
    private knowledgeDb: KnowledgeDB,
    private eventBus: EventBus,
  ) {
    this.decisionRepo = new DecisionRepository(knowledgeDb);
    this.performanceRepo = new PerformanceRepository(knowledgeDb);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Record a decision + outcome after orchestrator pipeline completes.
   * Non-blocking — errors are caught and logged, never thrown.
   *
   * Inserts into three tables in a single synchronous pass:
   *   1. `decisions`             — the goal, strategy chosen, and context
   *   2. `outcomes`              — evaluation result (accept / refine / escalate)
   *   3. `strategy_performance`  — per-strategy metrics for future scoring
   *
   * Finally emits a `knowledge:decision:recorded` event so the UI can
   * reflect the write-back immediately.
   */
  record(result: OrchestratorResult, evaluation: EvaluationResult): void {
    try {
      const decisionId = randomUUID();
      const now = Date.now();
      const projectId = this.knowledgeDb.projectId;
      const success = evaluation.recommendation === 'accept';

      // -------------------------------------------------------------------
      // 1. Insert decision
      // -------------------------------------------------------------------
      this.decisionRepo.insertDecision({
        id: decisionId,
        projectId,
        goal: result.taskContext.goal,
        strategyId: result.strategy.id,
        strategyName: result.strategy.name,
        confidence: result.output.confidence,
        complexity: result.taskContext.complexity,
        risk: result.taskContext.risk,
        filesInvolved: JSON.stringify(result.context.files.map((f) => f.path)),
        durationMs: result.totalDurationMs,
        createdAt: now,
      });

      // -------------------------------------------------------------------
      // 2. Insert outcome
      // -------------------------------------------------------------------
      this.decisionRepo.insertOutcome({
        id: randomUUID(),
        decisionId,
        success,
        evaluationScore: evaluation.confidence,
        recommendation: evaluation.recommendation,
        failureReason: success
          ? null
          : evaluation.checks
              .filter((c) => !c.passed)
              .map((c) => c.detail)
              .join('; '),
        refinementCount: 0, // refinementCount tracked by orchestrator if it auto-refined
        createdAt: now,
      });

      // -------------------------------------------------------------------
      // 3. Record strategy performance
      // -------------------------------------------------------------------
      this.performanceRepo.insertPerformance({
        id: randomUUID(),
        projectId,
        strategyId: result.strategy.id,
        goal: result.taskContext.goal,
        complexity: result.taskContext.complexity,
        risk: result.taskContext.risk,
        isAmbiguous: result.taskContext.isAmbiguous,
        blastRadius: result.taskContext.blastRadius,
        confidence: result.output.confidence,
        evaluation: evaluation.recommendation,
        durationMs: result.totalDurationMs,
        createdAt: now,
      });

      // -------------------------------------------------------------------
      // 4. Emit event
      // -------------------------------------------------------------------
      this.eventBus.emit({
        type: 'knowledge:decision:recorded',
        projectId,
        decisionId,
        strategyId: result.strategy.id,
        confidence: result.output.confidence,
        timestamp: now,
      });
    } catch (err) {
      // Never throw — this is a side-effect write and must not break the
      // pipeline. The orchestrator can continue regardless.
      console.error('[KnowledgeWriter] Failed to record decision:', err);
    }
  }
}
