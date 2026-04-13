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

// ---------------------------------------------------------------------------
// KnowledgeWriter
// ---------------------------------------------------------------------------

export class KnowledgeWriter {
  constructor(
    private knowledgeDb: KnowledgeDB,
    private eventBus: EventBus,
  ) {}

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

      // -------------------------------------------------------------------
      // 1. Insert decision
      // -------------------------------------------------------------------
      const decisionStmt = this.knowledgeDb.db.prepare(`
        INSERT INTO decisions (id, project_id, goal, strategy_id, strategy_name, confidence, complexity, risk, files_involved, duration_ms, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      decisionStmt.run(
        decisionId,
        projectId,
        result.taskContext.goal,
        result.strategy.id,
        result.strategy.name,
        result.output.confidence,
        result.taskContext.complexity,
        result.taskContext.risk,
        JSON.stringify(result.context.files.map((f) => f.path)),
        result.totalDurationMs,
        now,
      );

      // -------------------------------------------------------------------
      // 2. Insert outcome
      // -------------------------------------------------------------------
      const outcomeStmt = this.knowledgeDb.db.prepare(`
        INSERT INTO outcomes (id, decision_id, success, evaluation_score, recommendation, failure_reason, refinement_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const success = evaluation.recommendation === 'accept';
      outcomeStmt.run(
        randomUUID(),
        decisionId,
        success ? 1 : 0,
        evaluation.confidence,
        evaluation.recommendation,
        success
          ? null
          : evaluation.checks
              .filter((c) => !c.passed)
              .map((c) => c.detail)
              .join('; '),
        0, // refinementCount tracked by orchestrator if it auto-refined
        now,
      );

      // -------------------------------------------------------------------
      // 3. Record strategy performance
      // -------------------------------------------------------------------
      const perfStmt = this.knowledgeDb.db.prepare(`
        INSERT INTO strategy_performance (id, project_id, strategy_id, goal, complexity, risk, is_ambiguous, blast_radius, confidence, evaluation, duration_ms, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      perfStmt.run(
        randomUUID(),
        projectId,
        result.strategy.id,
        result.taskContext.goal,
        result.taskContext.complexity,
        result.taskContext.risk,
        result.taskContext.isAmbiguous ? 1 : 0,
        result.taskContext.blastRadius,
        result.output.confidence,
        evaluation.recommendation,
        result.totalDurationMs,
        now,
      );

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
