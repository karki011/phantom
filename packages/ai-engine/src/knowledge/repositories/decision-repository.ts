/**
 * DecisionRepository — Typed data-access layer for decisions and outcomes tables.
 * Centralises all raw SQL that previously lived in DecisionQuery and KnowledgeWriter.
 *
 * @author Subash Karki
 */
import type { KnowledgeDB } from '../knowledge-db.js';

// ---------------------------------------------------------------------------
// Row shapes (private — match the DB schema exactly)
// ---------------------------------------------------------------------------

interface DecisionRow {
  id: string;
  goal: string;
  strategy_id: string;
  strategy_name: string;
  confidence: number;
  complexity: string;
  risk: string;
  duration_ms: number;
  created_at: number;
}

interface OutcomeRow {
  decision_id: string;
  success: number;
  evaluation_score: number;
  recommendation: string;
  failure_reason: string | null;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DecisionRecord {
  id: string;
  goal: string;
  strategyId: string;
  strategyName: string;
  confidence: number;
  complexity: string;
  risk: string;
  durationMs: number;
  createdAt: number;
}

export interface OutcomeRecord {
  decisionId: string;
  success: boolean;
  evaluationScore: number;
  recommendation: string;
  failureReason: string | null;
}

export interface InsertDecisionParams {
  id: string;
  projectId: string;
  goal: string;
  strategyId: string;
  strategyName: string;
  confidence: number;
  complexity: string;
  risk: string;
  filesInvolved: string;
  durationMs: number;
  createdAt: number;
}

export interface InsertOutcomeParams {
  id: string;
  decisionId: string;
  success: boolean;
  evaluationScore: number;
  recommendation: string;
  failureReason: string | null;
  refinementCount: number;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// DecisionRepository
// ---------------------------------------------------------------------------

export class DecisionRepository {
  constructor(private readonly knowledgeDb: KnowledgeDB) {}

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  /**
   * Fetch the 100 most recent decisions for the current project.
   * Used by DecisionQuery for similarity scoring.
   */
  findRecent(limit = 100): DecisionRecord[] {
    const rows = this.knowledgeDb.db.prepare<[], DecisionRow>(`
      SELECT id, goal, strategy_id, strategy_name, confidence, complexity, risk, duration_ms, created_at
      FROM decisions
      WHERE project_id = ?
      ORDER BY created_at DESC
      LIMIT ${limit}
    `).all(this.knowledgeDb.projectId);

    return rows.map(this.mapDecision);
  }

  /**
   * Fetch outcomes for a list of decision IDs.
   */
  findOutcomes(decisionIds: string[]): Map<string, OutcomeRecord> {
    if (decisionIds.length === 0) return new Map();

    const placeholders = decisionIds.map(() => '?').join(',');
    const rows = this.knowledgeDb.db.prepare<string[], OutcomeRow>(`
      SELECT decision_id, success, evaluation_score, recommendation, failure_reason
      FROM outcomes
      WHERE decision_id IN (${placeholders})
    `).all(...decisionIds);

    const map = new Map<string, OutcomeRecord>();
    for (const row of rows) {
      map.set(row.decision_id, {
        decisionId: row.decision_id,
        success: row.success === 1,
        evaluationScore: row.evaluation_score,
        recommendation: row.recommendation,
        failureReason: row.failure_reason,
      });
    }
    return map;
  }

  // -------------------------------------------------------------------------
  // Write
  // -------------------------------------------------------------------------

  /**
   * Insert a new decision record.
   */
  insertDecision(params: InsertDecisionParams): void {
    this.knowledgeDb.db.prepare(`
      INSERT INTO decisions (id, project_id, goal, strategy_id, strategy_name, confidence, complexity, risk, files_involved, duration_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      params.id,
      params.projectId,
      params.goal,
      params.strategyId,
      params.strategyName,
      params.confidence,
      params.complexity,
      params.risk,
      params.filesInvolved,
      params.durationMs,
      params.createdAt,
    );
  }

  /**
   * Insert a new outcome record.
   */
  insertOutcome(params: InsertOutcomeParams): void {
    this.knowledgeDb.db.prepare(`
      INSERT INTO outcomes (id, decision_id, success, evaluation_score, recommendation, failure_reason, refinement_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      params.id,
      params.decisionId,
      params.success ? 1 : 0,
      params.evaluationScore,
      params.recommendation,
      params.failureReason,
      params.refinementCount,
      params.createdAt,
    );
  }

  /**
   * Delete outcomes for decisions older than cutoff (required before pruning decisions).
   */
  deleteOutcomesForOldDecisions(cutoff: number): void {
    this.knowledgeDb.db.prepare(`
      DELETE FROM outcomes WHERE decision_id IN (
        SELECT id FROM decisions WHERE created_at < ?
      )
    `).run(cutoff);
  }

  /**
   * Delete decisions older than cutoff. Returns number of deleted rows.
   */
  deleteOldDecisions(cutoff: number): number {
    const result = this.knowledgeDb.db.prepare(
      'DELETE FROM decisions WHERE created_at < ?'
    ).run(cutoff);
    return result.changes;
  }

  // -------------------------------------------------------------------------
  // Private mappers
  // -------------------------------------------------------------------------

  private mapDecision(row: DecisionRow): DecisionRecord {
    return {
      id: row.id,
      goal: row.goal,
      strategyId: row.strategy_id,
      strategyName: row.strategy_name,
      confidence: row.confidence,
      complexity: row.complexity,
      risk: row.risk,
      durationMs: row.duration_ms,
      createdAt: row.created_at,
    };
  }
}
