/**
 * StrategyPerformanceStore — Historical strategy performance queries
 * Used by the StrategyRegistry to weight activation scores with real data.
 *
 * @author Subash Karki
 */
import type { KnowledgeDB } from '../knowledge/knowledge-db.js';

// ---

export interface PerformanceRecord {
  strategyId: string;
  totalRuns: number;
  successCount: number;
  successRate: number;
  avgConfidence: number;
  avgDurationMs: number;
}

// ---

export class StrategyPerformanceStore {
  constructor(private knowledgeDb: KnowledgeDB) {}

  /**
   * Get aggregated performance for a strategy, optionally filtered by complexity.
   */
  getPerformance(strategyId: string, complexity?: string): PerformanceRecord | null {
    const complexityClause = complexity ? ' AND complexity = ?' : '';
    const params = complexity ? [strategyId, complexity] : [strategyId];

    // Query for total runs
    const totalRow = this.knowledgeDb.db.prepare(
      `SELECT COUNT(*) as total FROM strategy_performance WHERE strategy_id = ?${complexityClause}`
    ).get(...params) as { total: number } | undefined;

    if (!totalRow || totalRow.total === 0) return null;

    // Query for success count (evaluation = 'accept')
    const successRow = this.knowledgeDb.db.prepare(
      `SELECT COUNT(*) as cnt FROM strategy_performance WHERE strategy_id = ? AND evaluation = 'accept'${complexityClause}`
    ).get(...params) as { cnt: number };

    // Query for averages
    const avgRow = this.knowledgeDb.db.prepare(
      `SELECT AVG(confidence) as avg_conf, AVG(duration_ms) as avg_dur FROM strategy_performance WHERE strategy_id = ?${complexityClause}`
    ).get(...params) as { avg_conf: number | null; avg_dur: number | null };

    return {
      strategyId,
      totalRuns: totalRow.total,
      successCount: successRow.cnt,
      successRate: successRow.cnt / totalRow.total,
      avgConfidence: avgRow.avg_conf ?? 0,
      avgDurationMs: avgRow.avg_dur ?? 0,
    };
  }

  // ---

  /**
   * Get the best-performing strategy for a given complexity/risk combo.
   * Returns null if no historical data exists.
   */
  getBestStrategy(complexity: string, risk: string): { strategyId: string; successRate: number } | null {
    const row = this.knowledgeDb.db.prepare(`
      SELECT strategy_id,
             COUNT(*) as total,
             SUM(CASE WHEN evaluation = 'accept' THEN 1 ELSE 0 END) as successes
      FROM strategy_performance
      WHERE complexity = ? AND risk = ?
      GROUP BY strategy_id
      HAVING total >= 3
      ORDER BY (CAST(successes AS REAL) / total) DESC
      LIMIT 1
    `).get(complexity, risk) as { strategy_id: string; total: number; successes: number } | undefined;

    if (!row) return null;
    return { strategyId: row.strategy_id, successRate: row.successes / row.total };
  }

  // ---

  /**
   * Calculate a historical weight factor for a strategy.
   * Returns a multiplier (0.5 to 1.5) based on past success rate.
   * Returns 1.0 if no data exists (neutral).
   */
  getHistoricalWeight(strategyId: string, complexity?: string): number {
    const perf = this.getPerformance(strategyId, complexity);
    if (!perf || perf.totalRuns < 3) return 1.0; // Not enough data
    // Map success rate (0-1) to weight (0.5-1.5)
    return 0.5 + perf.successRate;
  }
}
