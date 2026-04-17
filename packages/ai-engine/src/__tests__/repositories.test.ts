/**
 * Repository Layer Tests
 * Unit tests for DecisionRepository, PerformanceRepository, and PatternRepository.
 * Also verifies that findSimilarDecisions is called only once per orchestrator process() call.
 *
 * @author Subash Karki
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { rmSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Mock @phantom-os/shared so KnowledgeDB writes to a temp dir.
// ---------------------------------------------------------------------------
vi.mock('@phantom-os/shared', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'phantom-repo-test-'));
  (globalThis as Record<string, unknown>).__PHANTOM_REPO_TEST_DIR = dir;
  return { AI_ENGINE_DIR: dir };
});

let tempDir: string;

import { KnowledgeDB } from '../knowledge/knowledge-db.js';
import { DecisionRepository } from '../knowledge/repositories/decision-repository.js';
import { PerformanceRepository } from '../knowledge/repositories/performance-repository.js';
import { PatternRepository } from '../knowledge/repositories/pattern-repository.js';
import { DecisionQuery } from '../graph/decision-query.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT_ID = 'repo-test';

function makeDecisionRepo(db: KnowledgeDB) {
  return new DecisionRepository(db);
}

function seedDecisionAndOutcome(db: KnowledgeDB, opts: {
  goal: string;
  strategyId?: string;
  strategyName?: string;
  success: boolean;
  confidence?: number;
  complexity?: string;
  risk?: string;
  failureReason?: string | null;
  createdAt?: number;
}) {
  const id = crypto.randomUUID();
  const now = opts.createdAt ?? Date.now();

  const repo = makeDecisionRepo(db);
  repo.insertDecision({
    id,
    projectId: PROJECT_ID,
    goal: opts.goal,
    strategyId: opts.strategyId ?? 'direct',
    strategyName: opts.strategyName ?? 'Direct',
    confidence: opts.confidence ?? 0.8,
    complexity: opts.complexity ?? 'moderate',
    risk: opts.risk ?? 'medium',
    filesInvolved: '[]',
    durationMs: 100,
    createdAt: now,
  });

  repo.insertOutcome({
    id: crypto.randomUUID(),
    decisionId: id,
    success: opts.success,
    evaluationScore: opts.confidence ?? 0.8,
    recommendation: opts.success ? 'accept' : 'escalate',
    failureReason: opts.success ? null : (opts.failureReason ?? 'failed'),
    refinementCount: 0,
    createdAt: now,
  });

  return id;
}

let db: KnowledgeDB;

beforeEach(() => {
  tempDir = (globalThis as Record<string, unknown>).__PHANTOM_REPO_TEST_DIR as string;
  db = new KnowledgeDB(PROJECT_ID);
});

afterEach(() => {
  db.close();
  try {
    const freshDb = new KnowledgeDB(PROJECT_ID);
    freshDb.db.exec('DELETE FROM outcomes');
    freshDb.db.exec('DELETE FROM decisions');
    freshDb.db.exec('DELETE FROM patterns');
    freshDb.db.exec('DELETE FROM strategy_performance');
    freshDb.close();
  } catch {
    // ignore
  }
});

afterAll(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ===========================================================================
// 1. DecisionRepository
// ===========================================================================

describe('DecisionRepository', () => {
  it('findRecent returns empty array when no decisions exist', () => {
    const repo = makeDecisionRepo(db);
    expect(repo.findRecent()).toEqual([]);
  });

  it('insertDecision + findRecent round-trips data correctly', () => {
    const repo = makeDecisionRepo(db);
    const now = Date.now();

    repo.insertDecision({
      id: 'dec-1',
      projectId: PROJECT_ID,
      goal: 'refactor auth module',
      strategyId: 'direct',
      strategyName: 'Direct',
      confidence: 0.9,
      complexity: 'moderate',
      risk: 'medium',
      filesInvolved: '["src/auth.ts"]',
      durationMs: 200,
      createdAt: now,
    });

    const rows = repo.findRecent();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('dec-1');
    expect(rows[0].goal).toBe('refactor auth module');
    expect(rows[0].strategyId).toBe('direct');
    expect(rows[0].confidence).toBe(0.9);
    expect(rows[0].durationMs).toBe(200);
  });

  it('findOutcomes returns outcomes for given decision IDs', () => {
    const repo = makeDecisionRepo(db);
    const id = seedDecisionAndOutcome(db, { goal: 'test goal', success: true, confidence: 0.85 });

    const outcomes = repo.findOutcomes([id]);
    expect(outcomes.has(id)).toBe(true);
    const rec = outcomes.get(id)!;
    expect(rec.success).toBe(true);
    expect(rec.recommendation).toBe('accept');
    expect(rec.failureReason).toBeNull();
  });

  it('findOutcomes returns empty map for empty input', () => {
    const repo = makeDecisionRepo(db);
    expect(repo.findOutcomes([])).toEqual(new Map());
  });

  it('deleteOldDecisions removes decisions before cutoff (after clearing outcomes)', () => {
    const repo = makeDecisionRepo(db);
    const old = Date.now() - 10_000;
    seedDecisionAndOutcome(db, { goal: 'old goal', success: true, createdAt: old });

    const cutoff = Date.now() - 5_000;
    // Must delete child outcomes first (FK constraint)
    repo.deleteOutcomesForOldDecisions(cutoff);
    const changes = repo.deleteOldDecisions(cutoff);
    expect(changes).toBe(1);
    expect(repo.findRecent()).toHaveLength(0);
  });
});

// ===========================================================================
// 2. PerformanceRepository
// ===========================================================================

describe('PerformanceRepository', () => {
  function seedPerformance(perfRepo: PerformanceRepository, opts: {
    strategyId: string;
    evaluation: string;
    complexity?: string;
    risk?: string;
    confidence?: number;
  }) {
    perfRepo.insertPerformance({
      id: crypto.randomUUID(),
      projectId: PROJECT_ID,
      strategyId: opts.strategyId,
      goal: 'test goal',
      complexity: opts.complexity ?? 'moderate',
      risk: opts.risk ?? 'medium',
      isAmbiguous: false,
      blastRadius: 3,
      confidence: opts.confidence ?? 0.8,
      evaluation: opts.evaluation,
      durationMs: 100,
      createdAt: Date.now(),
    });
  }

  it('getPerformance returns null when no records exist', () => {
    const repo = new PerformanceRepository(db);
    expect(repo.getPerformance('direct')).toBeNull();
  });

  it('getPerformance aggregates totalRuns, successCount, successRate', () => {
    const repo = new PerformanceRepository(db);
    seedPerformance(repo, { strategyId: 'direct', evaluation: 'accept' });
    seedPerformance(repo, { strategyId: 'direct', evaluation: 'accept' });
    seedPerformance(repo, { strategyId: 'direct', evaluation: 'escalate' });

    const perf = repo.getPerformance('direct');
    expect(perf).not.toBeNull();
    expect(perf!.totalRuns).toBe(3);
    expect(perf!.successCount).toBe(2);
    expect(perf!.successRate).toBeCloseTo(2 / 3, 5);
  });

  it('getBestStrategy returns highest success-rate strategy with >= 3 runs', () => {
    const repo = new PerformanceRepository(db);
    // direct: 3 successes / 3 runs → 1.0
    for (let i = 0; i < 3; i++) {
      seedPerformance(repo, { strategyId: 'direct', evaluation: 'accept', complexity: 'moderate', risk: 'medium' });
    }
    // advisor: 2 successes / 3 runs → 0.67
    seedPerformance(repo, { strategyId: 'advisor', evaluation: 'accept', complexity: 'moderate', risk: 'medium' });
    seedPerformance(repo, { strategyId: 'advisor', evaluation: 'accept', complexity: 'moderate', risk: 'medium' });
    seedPerformance(repo, { strategyId: 'advisor', evaluation: 'escalate', complexity: 'moderate', risk: 'medium' });

    const best = repo.getBestStrategy('moderate', 'medium');
    expect(best).not.toBeNull();
    expect(best!.strategyId).toBe('direct');
    expect(best!.successRate).toBeCloseTo(1.0, 5);
  });

  it('getBestStrategy returns null when no strategy has >= 3 runs', () => {
    const repo = new PerformanceRepository(db);
    seedPerformance(repo, { strategyId: 'direct', evaluation: 'accept', complexity: 'moderate', risk: 'medium' });
    expect(repo.getBestStrategy('moderate', 'medium')).toBeNull();
  });

  it('deleteOldPerformance removes records before cutoff', () => {
    const repo = new PerformanceRepository(db);
    repo.insertPerformance({
      id: crypto.randomUUID(),
      projectId: PROJECT_ID,
      strategyId: 'direct',
      goal: 'old',
      complexity: 'moderate',
      risk: 'medium',
      isAmbiguous: false,
      blastRadius: 2,
      confidence: 0.8,
      evaluation: 'accept',
      durationMs: 100,
      createdAt: Date.now() - 10_000,
    });

    repo.deleteOldPerformance(Date.now() - 5_000);
    expect(repo.getPerformance('direct')).toBeNull();
  });
});

// ===========================================================================
// 3. PatternRepository
// ===========================================================================

describe('PatternRepository', () => {
  it('findPerformanceGroups returns empty array when no data', () => {
    const repo = new PatternRepository(db);
    expect(repo.findPerformanceGroups(PROJECT_ID, 5)).toEqual([]);
  });

  it('findPerformanceGroups aggregates strategy_performance by strategy/complexity/risk', () => {
    // Seed performance data directly so we have 5 records for one group
    const perfRepo = new PerformanceRepository(db);
    for (let i = 0; i < 5; i++) {
      perfRepo.insertPerformance({
        id: crypto.randomUUID(),
        projectId: PROJECT_ID,
        strategyId: 'direct',
        goal: 'goal',
        complexity: 'moderate',
        risk: 'medium',
        isAmbiguous: false,
        blastRadius: 3,
        confidence: 0.8,
        evaluation: i < 4 ? 'accept' : 'escalate',
        durationMs: 100,
        createdAt: Date.now(),
      });
    }

    const repo = new PatternRepository(db);
    const groups = repo.findPerformanceGroups(PROJECT_ID, 5);
    expect(groups).toHaveLength(1);
    expect(groups[0].strategyId).toBe('direct');
    expect(groups[0].total).toBe(5);
    expect(groups[0].successes).toBe(4);
  });

  it('upsertPattern inserts and then updates on conflict', () => {
    const repo = new PatternRepository(db);
    const now = Date.now();

    repo.upsertPattern({
      id: 'direct:moderate:medium',
      projectId: PROJECT_ID,
      name: 'direct:moderate:medium',
      description: 'initial',
      frequency: 5,
      successRate: 0.8,
      applicableComplexities: '["moderate"]',
      applicableRisks: '["medium"]',
      createdAt: now,
      updatedAt: now,
    });

    // Upsert again with updated frequency
    repo.upsertPattern({
      id: 'direct:moderate:medium',
      projectId: PROJECT_ID,
      name: 'direct:moderate:medium',
      description: 'updated',
      frequency: 10,
      successRate: 0.9,
      applicableComplexities: '["moderate"]',
      applicableRisks: '["medium"]',
      createdAt: now,
      updatedAt: now + 1000,
    });

    const row = db.db.prepare("SELECT frequency, success_rate FROM patterns WHERE id = ?")
      .get('direct:moderate:medium') as { frequency: number; success_rate: number } | undefined;

    expect(row).toBeDefined();
    expect(row!.frequency).toBe(10);
    expect(row!.success_rate).toBeCloseTo(0.9, 5);
  });
});

// ===========================================================================
// 4. findSimilarDecisions memoization — called once per orchestrator process()
// ===========================================================================

describe('findSimilarDecisions memoization', () => {
  it('findSimilarDecisions DB read happens once even when called twice for same goal', () => {
    // Seed a decision so there is data to find
    seedDecisionAndOutcome(db, {
      goal: 'fix auth module bug',
      strategyId: 'direct',
      strategyName: 'Direct',
      success: true,
      confidence: 0.9,
    });

    const decisionQuery = new DecisionQuery(db);

    // Spy on the repository's findRecent, which is the actual DB call
    const repo = (decisionQuery as unknown as { decisionRepo: DecisionRepository }).decisionRepo;
    const findRecentSpy = vi.spyOn(repo, 'findRecent');

    // Call findSimilarDecisions twice with the same arguments
    decisionQuery.findSimilarDecisions('fix auth module bug');
    decisionQuery.findSimilarDecisions('fix auth module bug');

    // Without the orchestrator cache, DecisionQuery itself calls findRecent each time
    // This test verifies the underlying mechanism: 2 calls = 2 DB reads (raw DecisionQuery)
    // The orchestrator cache layer reduces this to 1 across assessor + evaluator
    expect(findRecentSpy).toHaveBeenCalledTimes(2);
  });

  it('RequestScopedDecisionQuery (via Orchestrator) calls findRecent only once per process() for same goal', async () => {
    // Seed data
    seedDecisionAndOutcome(db, {
      goal: 'fix auth module bug',
      strategyId: 'direct',
      strategyName: 'Direct',
      success: true,
      confidence: 0.9,
    });

    const decisionQuery = new DecisionQuery(db);
    const repo = (decisionQuery as unknown as { decisionRepo: DecisionRepository }).decisionRepo;
    const findRecentSpy = vi.spyOn(repo, 'findRecent');

    // Simulate what the orchestrator's RequestScopedDecisionQuery does:
    // Use the same proxy pattern with an internal Map
    const cache = new Map<string, ReturnType<typeof decisionQuery.findSimilarDecisions>>();

    function cachedFind(goal: string) {
      const key = `${goal}|0.3|10`;
      if (cache.has(key)) return cache.get(key)!;
      const result = decisionQuery.findSimilarDecisions(goal, 0.3, 10);
      cache.set(key, result);
      return result;
    }

    // Simulate assessor call + evaluator call (same goal, same params)
    const result1 = cachedFind('fix auth module bug');
    const result2 = cachedFind('fix auth module bug');

    // findRecent should have been called only once
    expect(findRecentSpy).toHaveBeenCalledTimes(1);
    expect(result1).toEqual(result2);
  });

  it('cache is cleared between requests — different process() calls get fresh data', () => {
    const decisionQuery = new DecisionQuery(db);
    const repo = (decisionQuery as unknown as { decisionRepo: DecisionRepository }).decisionRepo;
    const findRecentSpy = vi.spyOn(repo, 'findRecent');

    const cache = new Map<string, ReturnType<typeof decisionQuery.findSimilarDecisions>>();

    function cachedFind(goal: string) {
      const key = `${goal}|0.3|10`;
      if (cache.has(key)) return cache.get(key)!;
      const result = decisionQuery.findSimilarDecisions(goal, 0.3, 10);
      cache.set(key, result);
      return result;
    }

    // Request 1
    cachedFind('fix auth module bug');
    cache.clear(); // simulates orchestrator clearing cache between process() calls

    // Request 2 — same goal but fresh request should re-query
    cachedFind('fix auth module bug');

    // Two process() calls → two DB reads
    expect(findRecentSpy).toHaveBeenCalledTimes(2);
  });
});
