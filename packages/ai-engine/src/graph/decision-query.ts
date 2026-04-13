/**
 * DecisionQuery — Queries past decisions for anti-repetition detection
 * Finds similar past goals, surfaces failed approaches, and provides
 * prior success data to inform strategy selection.
 *
 * Uses simple token overlap similarity (no external services needed).
 *
 * @author Subash Karki
 */
import type { KnowledgeDB } from '../knowledge/knowledge-db.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PriorDecision {
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

export interface PriorOutcome {
  decisionId: string;
  success: boolean;
  evaluationScore: number;
  recommendation: string;
  failureReason: string | null;
}

export interface PriorFailure {
  strategyId: string;
  strategyName: string;
  failureReason: string | null;
  confidence: number;
  createdAt: number;
}

export interface PriorSuccess {
  strategyId: string;
  strategyName: string;
  confidence: number;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// DecisionQuery
// ---------------------------------------------------------------------------

export class DecisionQuery {
  constructor(private knowledgeDb: KnowledgeDB) {}

  /**
   * Find past decisions with similar goals.
   * Uses token overlap similarity — tokenizes both goals into words,
   * calculates Jaccard similarity, returns decisions above threshold.
   */
  findSimilarDecisions(goal: string, minSimilarity = 0.3, limit = 10): PriorDecision[] {
    // Load recent decisions (last 30 days only — older ones are compacted)
    const rows = this.knowledgeDb.db.prepare(`
      SELECT id, goal, strategy_id, strategy_name, confidence, complexity, risk, duration_ms, created_at
      FROM decisions
      WHERE project_id = ?
      ORDER BY created_at DESC
      LIMIT 100
    `).all(this.knowledgeDb.projectId) as Array<{
      id: string;
      goal: string;
      strategy_id: string;
      strategy_name: string;
      confidence: number;
      complexity: string;
      risk: string;
      duration_ms: number;
      created_at: number;
    }>;

    const goalTokens = this.tokenize(goal);
    const results: Array<PriorDecision & { similarity: number }> = [];

    for (const row of rows) {
      const similarity = this.jaccardSimilarity(goalTokens, this.tokenize(row.goal));
      if (similarity >= minSimilarity) {
        results.push({
          id: row.id,
          goal: row.goal,
          strategyId: row.strategy_id,
          strategyName: row.strategy_name,
          confidence: row.confidence,
          complexity: row.complexity,
          risk: row.risk,
          durationMs: row.duration_ms,
          createdAt: row.created_at,
          similarity,
        });
      }
    }

    // Sort by similarity DESC, then by recency DESC
    results.sort((a, b) => b.similarity - a.similarity || b.createdAt - a.createdAt);
    return results.slice(0, limit);
  }

  /**
   * Get outcomes for a list of decision IDs.
   */
  getOutcomes(decisionIds: string[]): Map<string, PriorOutcome> {
    if (decisionIds.length === 0) return new Map();

    const placeholders = decisionIds.map(() => '?').join(',');
    const rows = this.knowledgeDb.db.prepare(`
      SELECT decision_id, success, evaluation_score, recommendation, failure_reason
      FROM outcomes
      WHERE decision_id IN (${placeholders})
    `).all(...decisionIds) as Array<{
      decision_id: string;
      success: number;
      evaluation_score: number;
      recommendation: string;
      failure_reason: string | null;
    }>;

    const map = new Map<string, PriorOutcome>();
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

  /**
   * Get past approaches that FAILED for a similar goal.
   * Returns strategies that should be deprioritized.
   */
  getFailedApproaches(goal: string): PriorFailure[] {
    const similar = this.findSimilarDecisions(goal);
    if (similar.length === 0) return [];

    const outcomes = this.getOutcomes(similar.map(d => d.id));
    const failures: PriorFailure[] = [];

    for (const decision of similar) {
      const outcome = outcomes.get(decision.id);
      if (outcome && !outcome.success) {
        failures.push({
          strategyId: decision.strategyId,
          strategyName: decision.strategyName,
          failureReason: outcome.failureReason,
          confidence: decision.confidence,
          createdAt: decision.createdAt,
        });
      }
    }

    return failures;
  }

  /**
   * Get past approaches that SUCCEEDED for a similar goal.
   * Returns strategies that worked well previously.
   */
  getSuccessfulApproaches(goal: string): PriorSuccess[] {
    const similar = this.findSimilarDecisions(goal);
    if (similar.length === 0) return [];

    const outcomes = this.getOutcomes(similar.map(d => d.id));
    const successes: PriorSuccess[] = [];

    for (const decision of similar) {
      const outcome = outcomes.get(decision.id);
      if (outcome && outcome.success) {
        successes.push({
          strategyId: decision.strategyId,
          strategyName: decision.strategyName,
          confidence: decision.confidence,
          createdAt: decision.createdAt,
        });
      }
    }

    return successes;
  }

  // ---------------------------------------------------------------------------
  // Text Similarity Helpers
  // ---------------------------------------------------------------------------

  /** Tokenize a string into lowercase words, removing stop words */
  private tokenize(text: string): Set<string> {
    const STOP_WORDS = new Set([
      'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'and', 'or', 'is', 'it', 'this', 'that',
    ]);
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 1 && !STOP_WORDS.has(w));
    return new Set(words);
  }

  /** Jaccard similarity between two token sets (intersection / union) */
  private jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 0;
    let intersection = 0;
    for (const token of a) {
      if (b.has(token)) intersection++;
    }
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }
}
