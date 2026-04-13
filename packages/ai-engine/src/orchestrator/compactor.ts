/**
 * Compactor — TTL pruning + pattern synthesis for knowledge data
 * Runs lazily on orchestrator startup to keep per-project DBs bounded.
 *
 * @author Subash Karki
 */
import type { KnowledgeDB } from '../knowledge/knowledge-db.js';
import type { EventBus } from '../events/event-bus.js';

// ---

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MIN_DECISIONS_FOR_PATTERN = 5;

// ---

export class Compactor {
  constructor(
    private knowledgeDb: KnowledgeDB,
    private eventBus: EventBus,
  ) {}

  /**
   * Run compaction: synthesize patterns from old decisions, then prune.
   * Safe to call repeatedly — idempotent.
   */
  run(): void {
    try {
      const cutoff = Date.now() - TTL_MS;
      const projectId = this.knowledgeDb.projectId;

      // Step 1: Synthesize patterns from strategy performance data
      const patternsCreated = this.synthesizePatterns(projectId);

      // Step 2: Prune old decisions and their outcomes
      const prunedDecisions = this.pruneOldDecisions(cutoff);

      // Step 3: Prune old strategy performance records
      this.pruneOldPerformance(cutoff);

      if (prunedDecisions > 0 || patternsCreated > 0) {
        this.eventBus.emit({
          type: 'knowledge:compaction:complete',
          projectId,
          prunedDecisions,
          patternsCreated,
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      console.error('[Compactor] Compaction failed:', err);
    }
  }

  // ---

  private synthesizePatterns(projectId: string): number {
    // Find strategies with enough data to extract patterns
    const rows = this.knowledgeDb.db.prepare(`
      SELECT strategy_id, complexity, risk,
             COUNT(*) as total,
             SUM(CASE WHEN evaluation = 'accept' THEN 1 ELSE 0 END) as successes,
             AVG(confidence) as avg_confidence
      FROM strategy_performance
      WHERE project_id = ?
      GROUP BY strategy_id, complexity, risk
      HAVING total >= ?
    `).all(projectId, MIN_DECISIONS_FOR_PATTERN) as Array<{
      strategy_id: string;
      complexity: string;
      risk: string;
      total: number;
      successes: number;
      avg_confidence: number;
    }>;

    let created = 0;
    const now = Date.now();

    for (const row of rows) {
      const successRate = row.successes / row.total;
      const patternName = `${row.strategy_id}:${row.complexity}:${row.risk}`;

      // Upsert pattern
      this.knowledgeDb.db.prepare(`
        INSERT INTO patterns (id, project_id, name, description, frequency, success_rate, applicable_complexities, applicable_risks, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          frequency = excluded.frequency,
          success_rate = excluded.success_rate,
          updated_at = excluded.updated_at
      `).run(
        patternName,  // Use composite key as ID for dedup
        projectId,
        patternName,
        `Strategy ${row.strategy_id} for ${row.complexity}/${row.risk} tasks: ${(successRate * 100).toFixed(0)}% success over ${row.total} runs`,
        row.total,
        successRate,
        JSON.stringify([row.complexity]),
        JSON.stringify([row.risk]),
        now,
        now,
      );

      created++;

      if (successRate > 0.7) {
        this.eventBus.emit({
          type: 'knowledge:pattern:discovered',
          projectId,
          patternName,
          frequency: row.total,
          successRate,
          timestamp: now,
        });
      }
    }

    return created;
  }

  // ---

  private pruneOldDecisions(cutoff: number): number {
    // Delete outcomes for old decisions first (FK constraint)
    this.knowledgeDb.db.prepare(`
      DELETE FROM outcomes WHERE decision_id IN (
        SELECT id FROM decisions WHERE created_at < ?
      )
    `).run(cutoff);

    const result = this.knowledgeDb.db.prepare(
      'DELETE FROM decisions WHERE created_at < ?'
    ).run(cutoff);

    return result.changes;
  }

  // ---

  private pruneOldPerformance(cutoff: number): void {
    this.knowledgeDb.db.prepare(
      'DELETE FROM strategy_performance WHERE created_at < ?'
    ).run(cutoff);
  }
}
