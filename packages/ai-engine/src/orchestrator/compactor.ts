/**
 * Compactor — TTL pruning + pattern synthesis for knowledge data
 * Runs lazily on orchestrator startup to keep per-project DBs bounded.
 *
 * @author Subash Karki
 */
import type { KnowledgeDB } from '../knowledge/knowledge-db.js';
import type { EventBus } from '../events/event-bus.js';
import { DecisionRepository } from '../knowledge/repositories/decision-repository.js';
import { PatternRepository } from '../knowledge/repositories/pattern-repository.js';
import { PerformanceRepository } from '../knowledge/repositories/performance-repository.js';

// ---

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MIN_DECISIONS_FOR_PATTERN = 5;

// ---

export class Compactor {
  private decisionRepo: DecisionRepository;
  private patternRepo: PatternRepository;
  private performanceRepo: PerformanceRepository;

  constructor(
    private knowledgeDb: KnowledgeDB,
    private eventBus: EventBus,
  ) {
    this.decisionRepo = new DecisionRepository(knowledgeDb);
    this.patternRepo = new PatternRepository(knowledgeDb);
    this.performanceRepo = new PerformanceRepository(knowledgeDb);
  }

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
    const groups = this.patternRepo.findPerformanceGroups(projectId, MIN_DECISIONS_FOR_PATTERN);

    let created = 0;
    const now = Date.now();

    for (const group of groups) {
      const successRate = group.successes / group.total;
      const patternName = `${group.strategyId}:${group.complexity}:${group.risk}`;

      this.patternRepo.upsertPattern({
        id: patternName,  // Use composite key as ID for dedup
        projectId,
        name: patternName,
        description: `Strategy ${group.strategyId} for ${group.complexity}/${group.risk} tasks: ${(successRate * 100).toFixed(0)}% success over ${group.total} runs`,
        frequency: group.total,
        successRate,
        applicableComplexities: JSON.stringify([group.complexity]),
        applicableRisks: JSON.stringify([group.risk]),
        createdAt: now,
        updatedAt: now,
      });

      created++;

      if (successRate > 0.7) {
        this.eventBus.emit({
          type: 'knowledge:pattern:discovered',
          projectId,
          patternName,
          frequency: group.total,
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
    this.decisionRepo.deleteOutcomesForOldDecisions(cutoff);
    return this.decisionRepo.deleteOldDecisions(cutoff);
  }

  // ---

  private pruneOldPerformance(cutoff: number): void {
    this.performanceRepo.deleteOldPerformance(cutoff);
  }
}
