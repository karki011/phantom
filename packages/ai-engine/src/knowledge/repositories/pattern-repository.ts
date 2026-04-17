/**
 * PatternRepository — Typed data-access layer for patterns table.
 * Centralises all raw SQL that previously lived in Compactor.
 *
 * @author Subash Karki
 */
import type { KnowledgeDB } from '../knowledge-db.js';

// ---------------------------------------------------------------------------
// Row shapes (private)
// ---------------------------------------------------------------------------

interface PerformanceGroupRow {
  strategy_id: string;
  complexity: string;
  risk: string;
  total: number;
  successes: number;
  avg_confidence: number;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface StrategyPerformanceGroup {
  strategyId: string;
  complexity: string;
  risk: string;
  total: number;
  successes: number;
  avgConfidence: number;
}

export interface UpsertPatternParams {
  id: string;
  projectId: string;
  name: string;
  description: string;
  frequency: number;
  successRate: number;
  applicableComplexities: string;
  applicableRisks: string;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// PatternRepository
// ---------------------------------------------------------------------------

export class PatternRepository {
  constructor(private readonly knowledgeDb: KnowledgeDB) {}

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  /**
   * Aggregate strategy performance data grouped by strategy/complexity/risk.
   * Returns groups with at least minDecisions records — used by Compactor for pattern synthesis.
   */
  findPerformanceGroups(projectId: string, minDecisions: number): StrategyPerformanceGroup[] {
    const rows = this.knowledgeDb.db.prepare<[string, number], PerformanceGroupRow>(`
      SELECT strategy_id, complexity, risk,
             COUNT(*) as total,
             SUM(CASE WHEN evaluation = 'accept' THEN 1 ELSE 0 END) as successes,
             AVG(confidence) as avg_confidence
      FROM strategy_performance
      WHERE project_id = ?
      GROUP BY strategy_id, complexity, risk
      HAVING total >= ?
    `).all(projectId, minDecisions);

    return rows.map((row) => ({
      strategyId: row.strategy_id,
      complexity: row.complexity,
      risk: row.risk,
      total: row.total,
      successes: row.successes,
      avgConfidence: row.avg_confidence,
    }));
  }

  // -------------------------------------------------------------------------
  // Write
  // -------------------------------------------------------------------------

  /**
   * Upsert a pattern record (insert or update frequency/successRate/updatedAt on conflict).
   */
  upsertPattern(params: UpsertPatternParams): void {
    this.knowledgeDb.db.prepare(`
      INSERT INTO patterns (id, project_id, name, description, frequency, success_rate, applicable_complexities, applicable_risks, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        frequency = excluded.frequency,
        success_rate = excluded.success_rate,
        updated_at = excluded.updated_at
    `).run(
      params.id,
      params.projectId,
      params.name,
      params.description,
      params.frequency,
      params.successRate,
      params.applicableComplexities,
      params.applicableRisks,
      params.createdAt,
      params.updatedAt,
    );
  }
}
