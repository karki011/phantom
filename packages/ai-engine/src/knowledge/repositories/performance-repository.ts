/**
 * PerformanceRepository — Typed data-access layer for strategy_performance table.
 * Centralises all raw SQL that previously lived in StrategyPerformanceStore and KnowledgeWriter.
 *
 * @author Subash Karki
 */
import type { KnowledgeDB } from '../knowledge-db.js';

// ---------------------------------------------------------------------------
// Row shapes (private)
// ---------------------------------------------------------------------------

interface PerformanceTotalRow {
  total: number;
}

interface PerformanceSuccessRow {
  cnt: number;
}

interface PerformanceAvgRow {
  avg_conf: number | null;
  avg_dur: number | null;
}

interface BestStrategyRow {
  strategy_id: string;
  total: number;
  successes: number;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PerformanceRecord {
  strategyId: string;
  totalRuns: number;
  successCount: number;
  successRate: number;
  avgConfidence: number;
  avgDurationMs: number;
}

export interface InsertPerformanceParams {
  id: string;
  projectId: string;
  strategyId: string;
  goal: string;
  complexity: string;
  risk: string;
  isAmbiguous: boolean;
  blastRadius: number;
  confidence: number;
  evaluation: string;
  durationMs: number;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// PerformanceRepository
// ---------------------------------------------------------------------------

export class PerformanceRepository {
  constructor(private readonly knowledgeDb: KnowledgeDB) {}

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  /**
   * Aggregate performance stats for a strategy, optionally filtered by complexity.
   * Returns null if no records exist.
   */
  getPerformance(strategyId: string, complexity?: string): PerformanceRecord | null {
    const complexityClause = complexity ? ' AND complexity = ?' : '';
    const params: [string, ...string[]] = complexity ? [strategyId, complexity] : [strategyId];

    const totalRow = this.knowledgeDb.db.prepare<[string, ...string[]], PerformanceTotalRow>(
      `SELECT COUNT(*) as total FROM strategy_performance WHERE strategy_id = ?${complexityClause}`
    ).get(...params);

    if (!totalRow || totalRow.total === 0) return null;

    const successRow = this.knowledgeDb.db.prepare<[string, ...string[]], PerformanceSuccessRow>(
      `SELECT COUNT(*) as cnt FROM strategy_performance WHERE strategy_id = ? AND evaluation = 'accept'${complexityClause}`
    ).get(...params) as PerformanceSuccessRow;

    const avgRow = this.knowledgeDb.db.prepare<[string, ...string[]], PerformanceAvgRow>(
      `SELECT AVG(confidence) as avg_conf, AVG(duration_ms) as avg_dur FROM strategy_performance WHERE strategy_id = ?${complexityClause}`
    ).get(...params) as PerformanceAvgRow;

    return {
      strategyId,
      totalRuns: totalRow.total,
      successCount: successRow.cnt,
      successRate: successRow.cnt / totalRow.total,
      avgConfidence: avgRow.avg_conf ?? 0,
      avgDurationMs: avgRow.avg_dur ?? 0,
    };
  }

  /**
   * Find the highest-success-rate strategy for a complexity/risk combination.
   * Only considers strategies with at least 3 runs.
   */
  getBestStrategy(complexity: string, risk: string): { strategyId: string; successRate: number } | null {
    const row = this.knowledgeDb.db.prepare<[string, string], BestStrategyRow>(`
      SELECT strategy_id,
             COUNT(*) as total,
             SUM(CASE WHEN evaluation = 'accept' THEN 1 ELSE 0 END) as successes
      FROM strategy_performance
      WHERE complexity = ? AND risk = ?
      GROUP BY strategy_id
      HAVING total >= 3
      ORDER BY (CAST(successes AS REAL) / total) DESC
      LIMIT 1
    `).get(complexity, risk);

    if (!row) return null;
    return { strategyId: row.strategy_id, successRate: row.successes / row.total };
  }

  // -------------------------------------------------------------------------
  // Write
  // -------------------------------------------------------------------------

  /**
   * Insert a new strategy performance record.
   */
  insertPerformance(params: InsertPerformanceParams): void {
    this.knowledgeDb.db.prepare(`
      INSERT INTO strategy_performance (id, project_id, strategy_id, goal, complexity, risk, is_ambiguous, blast_radius, confidence, evaluation, duration_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      params.id,
      params.projectId,
      params.strategyId,
      params.goal,
      params.complexity,
      params.risk,
      params.isAmbiguous ? 1 : 0,
      params.blastRadius,
      params.confidence,
      params.evaluation,
      params.durationMs,
      params.createdAt,
    );
  }

  /**
   * Delete performance records older than cutoff.
   */
  deleteOldPerformance(cutoff: number): void {
    this.knowledgeDb.db.prepare(
      'DELETE FROM strategy_performance WHERE created_at < ?'
    ).run(cutoff);
  }
}
