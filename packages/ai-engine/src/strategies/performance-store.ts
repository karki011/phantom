/**
 * StrategyPerformanceStore — Historical strategy performance queries
 * Used by the StrategyRegistry to weight activation scores with real data.
 *
 * @author Subash Karki
 */
import type { KnowledgeDB } from '../knowledge/knowledge-db.js';
import { PerformanceRepository } from '../knowledge/repositories/performance-repository.js';

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
  private performanceRepo: PerformanceRepository;

  constructor(private knowledgeDb: KnowledgeDB) {
    this.performanceRepo = new PerformanceRepository(knowledgeDb);
  }

  /**
   * Get aggregated performance for a strategy, optionally filtered by complexity.
   */
  getPerformance(strategyId: string, complexity?: string): PerformanceRecord | null {
    return this.performanceRepo.getPerformance(strategyId, complexity);
  }

  // ---

  /**
   * Get the best-performing strategy for a given complexity/risk combo.
   * Returns null if no historical data exists.
   */
  getBestStrategy(complexity: string, risk: string): { strategyId: string; successRate: number } | null {
    return this.performanceRepo.getBestStrategy(complexity, risk);
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
