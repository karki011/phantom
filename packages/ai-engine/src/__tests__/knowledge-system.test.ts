/**
 * Knowledge Compounding System Tests
 * Tests KnowledgeDB, KnowledgeWriter, StrategyPerformanceStore, and Compactor.
 *
 * @author Subash Karki
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { OrchestratorResult, EvaluationResult } from '../orchestrator/types.js';
import type { GraphEvent } from '../types/events.js';

// ---------------------------------------------------------------------------
// Mock @phantom-os/shared so KnowledgeDB writes to a temp dir.
// vi.mock is hoisted above all imports. The factory must NOT reference any
// module-scoped variables — so we inline the temp-dir creation and let the
// test read it back by importing AI_ENGINE_DIR from the (mocked) module.
// ---------------------------------------------------------------------------

vi.mock('@phantom-os/shared/constants-node', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'phantom-ai-test-'));
  return { AI_ENGINE_DIR: dir };
});

// Imports must come after vi.mock so the mock is applied
import { AI_ENGINE_DIR as tempDir } from '@phantom-os/shared/constants-node';
import { KnowledgeDB } from '../knowledge/knowledge-db.js';
import { KnowledgeWriter } from '../orchestrator/knowledge-writer.js';
import { Compactor } from '../orchestrator/compactor.js';
import { StrategyPerformanceStore } from '../strategies/performance-store.js';
import { EventBus } from '../events/event-bus.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT_ID = 'test-project';

function mockResult(overrides?: Partial<OrchestratorResult>): OrchestratorResult {
  return {
    strategy: { id: 'direct', name: 'Direct', reason: 'simple task', score: 0.8 },
    alternatives: [],
    context: {
      files: [{ path: 'src/foo.ts', relevance: 0.9 }],
      blastRadius: 2,
      relatedFiles: ['src/bar.ts'],
    },
    taskContext: {
      goal: 'fix the bug in auth module',
      relevantFiles: ['src/foo.ts'],
      blastRadius: 2,
      complexity: 'simple',
      risk: 'low',
      isAmbiguous: false,
      signals: {},
    },
    output: {
      strategyId: 'direct',
      result: 'Fixed the auth bug',
      confidence: 0.85,
      tokensUsed: 500,
      durationMs: 1200,
      artifacts: {},
    },
    totalDurationMs: 1500,
    ...overrides,
  };
}

function mockEvaluation(overrides?: Partial<EvaluationResult>): EvaluationResult {
  return {
    confidence: 0.85,
    checks: [{ name: 'confidence', passed: true, detail: 'OK' }],
    recommendation: 'accept',
    ...overrides,
  };
}

/**
 * Insert a strategy_performance row directly for test setup.
 */
function insertPerfRecord(
  db: KnowledgeDB,
  opts: {
    strategyId: string;
    complexity?: string;
    risk?: string;
    evaluation?: string;
    confidence?: number;
    durationMs?: number;
    createdAt?: number;
  },
): void {
  const now = Date.now();
  db.db.prepare(`
    INSERT INTO strategy_performance (id, project_id, strategy_id, goal, complexity, risk, is_ambiguous, blast_radius, confidence, evaluation, duration_ms, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `perf-${Math.random().toString(36).slice(2)}`,
    PROJECT_ID,
    opts.strategyId,
    'test goal',
    opts.complexity ?? 'simple',
    opts.risk ?? 'low',
    0,
    2,
    opts.confidence ?? 0.85,
    opts.evaluation ?? 'accept',
    opts.durationMs ?? 1000,
    opts.createdAt ?? now,
  );
}

/**
 * Insert a decision row directly for test setup.
 */
function insertDecision(
  db: KnowledgeDB,
  opts: {
    id: string;
    createdAt: number;
    strategyId?: string;
  },
): void {
  db.db.prepare(`
    INSERT INTO decisions (id, project_id, goal, strategy_id, strategy_name, confidence, complexity, risk, files_involved, duration_ms, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    opts.id,
    PROJECT_ID,
    'test goal',
    opts.strategyId ?? 'direct',
    'Direct',
    0.85,
    'simple',
    'low',
    JSON.stringify(['src/foo.ts']),
    1500,
    opts.createdAt,
  );
}

/**
 * Insert an outcome row directly for test setup.
 */
function insertOutcome(
  db: KnowledgeDB,
  opts: { decisionId: string; createdAt: number },
): void {
  db.db.prepare(`
    INSERT INTO outcomes (id, decision_id, success, evaluation_score, recommendation, failure_reason, refinement_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `outcome-${Math.random().toString(36).slice(2)}`,
    opts.decisionId,
    1,
    0.85,
    'accept',
    null,
    0,
    opts.createdAt,
  );
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let knowledgeDb: KnowledgeDB;
let eventBus: EventBus;

beforeEach(() => {
  knowledgeDb = new KnowledgeDB(PROJECT_ID);
  eventBus = new EventBus();
});

afterEach(() => {
  knowledgeDb.close();
  // Drop all data between tests so each test starts fresh.
  // We cannot rmSync the dir because the mock's AI_ENGINE_DIR is fixed.
  // Instead we delete all rows from every table.
  try {
    const freshDb = new KnowledgeDB(PROJECT_ID);
    freshDb.db.exec('DELETE FROM outcomes');
    freshDb.db.exec('DELETE FROM decisions');
    freshDb.db.exec('DELETE FROM patterns');
    freshDb.db.exec('DELETE FROM strategy_performance');
    freshDb.close();
  } catch {
    // DB may already be deleted — ignore
  }
});

afterAll(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ===========================================================================
// 1. KnowledgeDB
// ===========================================================================

describe('KnowledgeDB', () => {
  it('creates a database file in the configured directory', () => {
    const dbPath = join(tempDir, `${PROJECT_ID}.db`);
    // The DB was created in beforeEach — the file should exist
    expect(existsSync(dbPath)).toBe(true);
  });

  it('creates all expected tables', () => {
    const tables = knowledgeDb.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('decisions');
    expect(tableNames).toContain('outcomes');
    expect(tableNames).toContain('patterns');
    expect(tableNames).toContain('strategy_performance');
  });

  it('can insert and query decisions', () => {
    const now = Date.now();
    insertDecision(knowledgeDb, { id: 'dec-1', createdAt: now });

    const row = knowledgeDb.db
      .prepare('SELECT * FROM decisions WHERE id = ?')
      .get('dec-1') as Record<string, unknown>;

    expect(row).toBeTruthy();
    expect(row.project_id).toBe(PROJECT_ID);
    expect(row.strategy_id).toBe('direct');
    expect(row.created_at).toBe(now);
  });

  it('can insert and query outcomes', () => {
    const now = Date.now();
    insertDecision(knowledgeDb, { id: 'dec-2', createdAt: now });
    insertOutcome(knowledgeDb, { decisionId: 'dec-2', createdAt: now });

    const row = knowledgeDb.db
      .prepare('SELECT * FROM outcomes WHERE decision_id = ?')
      .get('dec-2') as Record<string, unknown>;

    expect(row).toBeTruthy();
    expect(row.success).toBe(1);
    expect(row.recommendation).toBe('accept');
  });

  it('can insert and query patterns', () => {
    const now = Date.now();
    knowledgeDb.db.prepare(`
      INSERT INTO patterns (id, project_id, name, description, frequency, success_rate, applicable_complexities, applicable_risks, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('pat-1', PROJECT_ID, 'test-pattern', 'A test pattern', 10, 0.9, '["simple"]', '["low"]', now, now);

    const row = knowledgeDb.db
      .prepare('SELECT * FROM patterns WHERE id = ?')
      .get('pat-1') as Record<string, unknown>;

    expect(row).toBeTruthy();
    expect(row.name).toBe('test-pattern');
    expect(row.frequency).toBe(10);
    expect(row.success_rate).toBe(0.9);
  });

  it('can insert and query strategy_performance', () => {
    insertPerfRecord(knowledgeDb, { strategyId: 'direct', confidence: 0.9 });

    const row = knowledgeDb.db
      .prepare('SELECT * FROM strategy_performance WHERE strategy_id = ?')
      .get('direct') as Record<string, unknown>;

    expect(row).toBeTruthy();
    expect(row.confidence).toBe(0.9);
    expect(row.project_id).toBe(PROJECT_ID);
  });

  it('close() works without error', () => {
    // Create a separate instance to test close independently
    const db2 = new KnowledgeDB('close-test');
    expect(() => db2.close()).not.toThrow();
  });
});

// ===========================================================================
// 2. KnowledgeWriter
// ===========================================================================

describe('KnowledgeWriter', () => {
  let writer: KnowledgeWriter;

  beforeEach(() => {
    writer = new KnowledgeWriter(knowledgeDb, eventBus);
  });

  it('record() inserts into decisions, outcomes, and strategy_performance tables', () => {
    writer.record(mockResult(), mockEvaluation());

    const decisions = knowledgeDb.db
      .prepare('SELECT COUNT(*) as cnt FROM decisions')
      .get() as { cnt: number };
    const outcomes = knowledgeDb.db
      .prepare('SELECT COUNT(*) as cnt FROM outcomes')
      .get() as { cnt: number };
    const perf = knowledgeDb.db
      .prepare('SELECT COUNT(*) as cnt FROM strategy_performance')
      .get() as { cnt: number };

    expect(decisions.cnt).toBe(1);
    expect(outcomes.cnt).toBe(1);
    expect(perf.cnt).toBe(1);
  });

  it('emits knowledge:decision:recorded event', () => {
    const listener = vi.fn();
    eventBus.on('knowledge:decision:recorded', listener);

    writer.record(mockResult(), mockEvaluation());

    expect(listener).toHaveBeenCalledOnce();
    const event = listener.mock.calls[0][0] as GraphEvent & { strategyId: string };
    expect(event.type).toBe('knowledge:decision:recorded');
    expect(event.strategyId).toBe('direct');
    expect(event.projectId).toBe(PROJECT_ID);
  });

  it('does not throw on errors (error is caught)', () => {
    // Close the DB to force an error
    knowledgeDb.close();

    // This should NOT throw — KnowledgeWriter catches internally
    expect(() => {
      writer.record(mockResult(), mockEvaluation());
    }).not.toThrow();

    // Re-open for afterEach cleanup
    knowledgeDb = new KnowledgeDB(PROJECT_ID);
  });

  it('records correct field values in decisions', () => {
    const result = mockResult({ totalDurationMs: 2000 });
    writer.record(result, mockEvaluation());

    const row = knowledgeDb.db
      .prepare('SELECT * FROM decisions')
      .get() as Record<string, unknown>;

    expect(row.project_id).toBe(PROJECT_ID);
    expect(row.goal).toBe('fix the bug in auth module');
    expect(row.strategy_id).toBe('direct');
    expect(row.strategy_name).toBe('Direct');
    expect(row.confidence).toBe(0.85);
    expect(row.complexity).toBe('simple');
    expect(row.risk).toBe('low');
    expect(row.duration_ms).toBe(2000);
    expect(JSON.parse(row.files_involved as string)).toEqual(['src/foo.ts']);
  });

  it('records outcome with success=0 for non-accept recommendation', () => {
    const evaluation = mockEvaluation({
      recommendation: 'refine',
      checks: [{ name: 'quality', passed: false, detail: 'Too vague' }],
    });
    writer.record(mockResult(), evaluation);

    const row = knowledgeDb.db
      .prepare('SELECT * FROM outcomes')
      .get() as Record<string, unknown>;

    expect(row.success).toBe(0);
    expect(row.recommendation).toBe('refine');
    expect(row.failure_reason).toBe('Too vague');
  });

  it('records correct strategy_performance values', () => {
    writer.record(mockResult(), mockEvaluation());

    const row = knowledgeDb.db
      .prepare('SELECT * FROM strategy_performance')
      .get() as Record<string, unknown>;

    expect(row.strategy_id).toBe('direct');
    expect(row.complexity).toBe('simple');
    expect(row.risk).toBe('low');
    expect(row.is_ambiguous).toBe(0);
    expect(row.blast_radius).toBe(2);
    expect(row.evaluation).toBe('accept');
  });
});

// ===========================================================================
// 3. StrategyPerformanceStore
// ===========================================================================

describe('StrategyPerformanceStore', () => {
  let store: StrategyPerformanceStore;

  beforeEach(() => {
    store = new StrategyPerformanceStore(knowledgeDb);
  });

  it('getPerformance() returns null when no data exists', () => {
    const result = store.getPerformance('nonexistent');
    expect(result).toBeNull();
  });

  it('getPerformance() returns correct aggregated data after multiple records', () => {
    // Insert 4 records: 3 accept, 1 refine
    insertPerfRecord(knowledgeDb, { strategyId: 'direct', evaluation: 'accept', confidence: 0.9, durationMs: 1000 });
    insertPerfRecord(knowledgeDb, { strategyId: 'direct', evaluation: 'accept', confidence: 0.8, durationMs: 1200 });
    insertPerfRecord(knowledgeDb, { strategyId: 'direct', evaluation: 'accept', confidence: 0.7, durationMs: 800 });
    insertPerfRecord(knowledgeDb, { strategyId: 'direct', evaluation: 'refine', confidence: 0.5, durationMs: 2000 });

    const perf = store.getPerformance('direct');
    expect(perf).not.toBeNull();
    expect(perf!.strategyId).toBe('direct');
    expect(perf!.totalRuns).toBe(4);
    expect(perf!.successCount).toBe(3);
    expect(perf!.successRate).toBe(0.75);
    expect(perf!.avgConfidence).toBeCloseTo(0.725, 2);
    expect(perf!.avgDurationMs).toBeCloseTo(1250, 0);
  });

  it('getPerformance() with complexity filter works', () => {
    insertPerfRecord(knowledgeDb, { strategyId: 'direct', complexity: 'simple', evaluation: 'accept' });
    insertPerfRecord(knowledgeDb, { strategyId: 'direct', complexity: 'simple', evaluation: 'accept' });
    insertPerfRecord(knowledgeDb, { strategyId: 'direct', complexity: 'complex', evaluation: 'refine' });

    const simplePerf = store.getPerformance('direct', 'simple');
    expect(simplePerf).not.toBeNull();
    expect(simplePerf!.totalRuns).toBe(2);
    expect(simplePerf!.successRate).toBe(1.0);

    const complexPerf = store.getPerformance('direct', 'complex');
    expect(complexPerf).not.toBeNull();
    expect(complexPerf!.totalRuns).toBe(1);
    expect(complexPerf!.successRate).toBe(0);
  });

  it('getBestStrategy() returns the best strategy for a complexity/risk combo', () => {
    // "direct" strategy: 3 accept, 1 refine = 75%
    for (let i = 0; i < 3; i++) {
      insertPerfRecord(knowledgeDb, { strategyId: 'direct', complexity: 'simple', risk: 'low', evaluation: 'accept' });
    }
    insertPerfRecord(knowledgeDb, { strategyId: 'direct', complexity: 'simple', risk: 'low', evaluation: 'refine' });

    // "chain" strategy: 4 accept, 1 refine = 80%
    for (let i = 0; i < 4; i++) {
      insertPerfRecord(knowledgeDb, { strategyId: 'chain', complexity: 'simple', risk: 'low', evaluation: 'accept' });
    }
    insertPerfRecord(knowledgeDb, { strategyId: 'chain', complexity: 'simple', risk: 'low', evaluation: 'refine' });

    const best = store.getBestStrategy('simple', 'low');
    expect(best).not.toBeNull();
    expect(best!.strategyId).toBe('chain');
    expect(best!.successRate).toBe(0.8);
  });

  it('getBestStrategy() returns null when not enough data (< 3 runs)', () => {
    insertPerfRecord(knowledgeDb, { strategyId: 'direct', complexity: 'simple', risk: 'low', evaluation: 'accept' });
    insertPerfRecord(knowledgeDb, { strategyId: 'direct', complexity: 'simple', risk: 'low', evaluation: 'accept' });

    const best = store.getBestStrategy('simple', 'low');
    expect(best).toBeNull();
  });

  it('getHistoricalWeight() returns 1.0 when no data exists', () => {
    const weight = store.getHistoricalWeight('nonexistent');
    expect(weight).toBe(1.0);
  });

  it('getHistoricalWeight() returns 1.0 when not enough data (< 3 runs)', () => {
    insertPerfRecord(knowledgeDb, { strategyId: 'direct', evaluation: 'accept' });
    insertPerfRecord(knowledgeDb, { strategyId: 'direct', evaluation: 'accept' });

    const weight = store.getHistoricalWeight('direct');
    expect(weight).toBe(1.0);
  });

  it('getHistoricalWeight() returns weighted value based on success rate', () => {
    // 4 records: 3 accept, 1 refine = 75% success rate
    // Weight should be 0.5 + 0.75 = 1.25
    for (let i = 0; i < 3; i++) {
      insertPerfRecord(knowledgeDb, { strategyId: 'direct', evaluation: 'accept' });
    }
    insertPerfRecord(knowledgeDb, { strategyId: 'direct', evaluation: 'refine' });

    const weight = store.getHistoricalWeight('direct');
    expect(weight).toBeCloseTo(1.25, 2);
  });

  it('getHistoricalWeight() with complexity filter', () => {
    // 3 accept for simple = 100% → weight 1.5
    for (let i = 0; i < 3; i++) {
      insertPerfRecord(knowledgeDb, { strategyId: 'direct', complexity: 'simple', evaluation: 'accept' });
    }
    // 3 refine for complex = 0% → weight 0.5
    for (let i = 0; i < 3; i++) {
      insertPerfRecord(knowledgeDb, { strategyId: 'direct', complexity: 'complex', evaluation: 'refine' });
    }

    expect(store.getHistoricalWeight('direct', 'simple')).toBeCloseTo(1.5, 2);
    expect(store.getHistoricalWeight('direct', 'complex')).toBeCloseTo(0.5, 2);
  });
});

// ===========================================================================
// 4. Compactor
// ===========================================================================

describe('Compactor', () => {
  let compactor: Compactor;

  beforeEach(() => {
    compactor = new Compactor(knowledgeDb, eventBus);
  });

  it('run() synthesizes patterns from strategy_performance data', () => {
    // Insert MIN_DECISIONS_FOR_PATTERN (5) records for one strategy/complexity/risk combo
    for (let i = 0; i < 5; i++) {
      insertPerfRecord(knowledgeDb, {
        strategyId: 'direct',
        complexity: 'simple',
        risk: 'low',
        evaluation: i < 4 ? 'accept' : 'refine',
      });
    }

    compactor.run();

    const patterns = knowledgeDb.db
      .prepare('SELECT * FROM patterns WHERE project_id = ?')
      .all(PROJECT_ID) as Array<Record<string, unknown>>;

    expect(patterns.length).toBe(1);
    expect(patterns[0].name).toBe('direct:simple:low');
    expect(patterns[0].success_rate).toBe(0.8); // 4/5
    expect(patterns[0].frequency).toBe(5);
  });

  it('pattern synthesis requires MIN_DECISIONS_FOR_PATTERN (5) records', () => {
    // Only 4 records — below threshold
    for (let i = 0; i < 4; i++) {
      insertPerfRecord(knowledgeDb, {
        strategyId: 'direct',
        complexity: 'simple',
        risk: 'low',
        evaluation: 'accept',
      });
    }

    compactor.run();

    const patterns = knowledgeDb.db
      .prepare('SELECT COUNT(*) as cnt FROM patterns')
      .get() as { cnt: number };

    expect(patterns.cnt).toBe(0);
  });

  it('run() does not prune recent decisions (within 30 days)', () => {
    const now = Date.now();
    insertDecision(knowledgeDb, { id: 'recent-1', createdAt: now });
    insertOutcome(knowledgeDb, { decisionId: 'recent-1', createdAt: now });

    compactor.run();

    const decision = knowledgeDb.db
      .prepare('SELECT * FROM decisions WHERE id = ?')
      .get('recent-1') as Record<string, unknown> | undefined;

    expect(decision).toBeTruthy();
  });

  it('run() prunes decisions older than 30 days', () => {
    const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
    insertDecision(knowledgeDb, { id: 'old-1', createdAt: thirtyOneDaysAgo });
    insertOutcome(knowledgeDb, { decisionId: 'old-1', createdAt: thirtyOneDaysAgo });

    // Also insert a recent one to verify it survives
    const now = Date.now();
    insertDecision(knowledgeDb, { id: 'recent-1', createdAt: now });
    insertOutcome(knowledgeDb, { decisionId: 'recent-1', createdAt: now });

    compactor.run();

    const oldDecision = knowledgeDb.db
      .prepare('SELECT * FROM decisions WHERE id = ?')
      .get('old-1') as Record<string, unknown> | undefined;
    const recentDecision = knowledgeDb.db
      .prepare('SELECT * FROM decisions WHERE id = ?')
      .get('recent-1') as Record<string, unknown> | undefined;
    const oldOutcome = knowledgeDb.db
      .prepare('SELECT * FROM outcomes WHERE decision_id = ?')
      .get('old-1') as Record<string, unknown> | undefined;

    expect(oldDecision).toBeUndefined();
    expect(oldOutcome).toBeUndefined();
    expect(recentDecision).toBeTruthy();
  });

  it('run() emits knowledge:compaction:complete event when work was done', () => {
    const listener = vi.fn();
    eventBus.on('knowledge:compaction:complete', listener);

    // Insert old decision to trigger pruning
    const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
    insertDecision(knowledgeDb, { id: 'old-1', createdAt: thirtyOneDaysAgo });
    insertOutcome(knowledgeDb, { decisionId: 'old-1', createdAt: thirtyOneDaysAgo });

    compactor.run();

    expect(listener).toHaveBeenCalledOnce();
    const event = listener.mock.calls[0][0] as GraphEvent & {
      prunedDecisions: number;
      patternsCreated: number;
    };
    expect(event.type).toBe('knowledge:compaction:complete');
    expect(event.prunedDecisions).toBe(1);
    expect(event.projectId).toBe(PROJECT_ID);
  });

  it('run() does not emit event when no work was done', () => {
    const listener = vi.fn();
    eventBus.on('knowledge:compaction:complete', listener);

    // Empty DB — nothing to prune or synthesize
    compactor.run();

    expect(listener).not.toHaveBeenCalled();
  });

  it('run() is idempotent — calling twice produces same result', () => {
    for (let i = 0; i < 5; i++) {
      insertPerfRecord(knowledgeDb, {
        strategyId: 'direct',
        complexity: 'simple',
        risk: 'low',
        evaluation: 'accept',
      });
    }

    compactor.run();
    const afterFirst = knowledgeDb.db
      .prepare('SELECT * FROM patterns')
      .all() as Array<Record<string, unknown>>;

    compactor.run();
    const afterSecond = knowledgeDb.db
      .prepare('SELECT * FROM patterns')
      .all() as Array<Record<string, unknown>>;

    // Same number of patterns — ON CONFLICT deduplicates
    expect(afterFirst.length).toBe(afterSecond.length);
    // Same pattern name and success rate
    expect(afterFirst[0].name).toBe(afterSecond[0].name);
    expect(afterFirst[0].success_rate).toBe(afterSecond[0].success_rate);
  });

  it('run() also prunes old strategy_performance records', () => {
    const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
    insertPerfRecord(knowledgeDb, { strategyId: 'direct', createdAt: thirtyOneDaysAgo });
    insertPerfRecord(knowledgeDb, { strategyId: 'direct', createdAt: Date.now() });

    compactor.run();

    const count = knowledgeDb.db
      .prepare('SELECT COUNT(*) as cnt FROM strategy_performance')
      .get() as { cnt: number };

    // Only the recent one should survive
    expect(count.cnt).toBe(1);
  });

  it('run() emits knowledge:pattern:discovered for high success rate patterns', () => {
    const listener = vi.fn();
    eventBus.on('knowledge:pattern:discovered', listener);

    // Insert 5 records all accepting → 100% success rate (> 0.7 threshold)
    for (let i = 0; i < 5; i++) {
      insertPerfRecord(knowledgeDb, {
        strategyId: 'direct',
        complexity: 'simple',
        risk: 'low',
        evaluation: 'accept',
      });
    }

    compactor.run();

    expect(listener).toHaveBeenCalledOnce();
    const event = listener.mock.calls[0][0] as GraphEvent & {
      patternName: string;
      successRate: number;
    };
    expect(event.type).toBe('knowledge:pattern:discovered');
    expect(event.patternName).toBe('direct:simple:low');
    expect(event.successRate).toBe(1.0);
  });
});

// ===========================================================================
// 5. Integration
// ===========================================================================

describe('Integration: full knowledge compounding flow', () => {
  it('KnowledgeWriter records -> PerformanceStore reads -> Compactor synthesizes patterns', () => {
    const writer = new KnowledgeWriter(knowledgeDb, eventBus);
    const store = new StrategyPerformanceStore(knowledgeDb);
    const compactor = new Compactor(knowledgeDb, eventBus);

    // Track all events
    const events: GraphEvent[] = [];
    eventBus.onAll((event) => events.push(event));

    // 1. Record 5 decisions through the writer
    for (let i = 0; i < 5; i++) {
      writer.record(
        mockResult({
          strategy: { id: 'direct', name: 'Direct', reason: 'simple task', score: 0.8 },
          taskContext: {
            goal: `task ${i}`,
            relevantFiles: ['src/foo.ts'],
            blastRadius: 2,
            complexity: 'simple',
            risk: 'low',
            isAmbiguous: false,
            signals: {},
          },
        }),
        mockEvaluation(),
      );
    }

    // 2. Verify PerformanceStore can read the data
    const perf = store.getPerformance('direct');
    expect(perf).not.toBeNull();
    expect(perf!.totalRuns).toBe(5);
    expect(perf!.successRate).toBe(1.0);

    // 3. Verify historical weight reflects data
    const weight = store.getHistoricalWeight('direct', 'simple');
    expect(weight).toBeCloseTo(1.5, 2); // 0.5 + 1.0

    // 4. Run compaction to synthesize patterns
    compactor.run();

    const patterns = knowledgeDb.db
      .prepare('SELECT * FROM patterns WHERE project_id = ?')
      .all(PROJECT_ID) as Array<Record<string, unknown>>;

    expect(patterns.length).toBe(1);
    expect(patterns[0].name).toBe('direct:simple:low');
    expect(patterns[0].success_rate).toBe(1.0);

    // 5. Verify events were emitted correctly
    const decisionEvents = events.filter((e) => e.type === 'knowledge:decision:recorded');
    const patternEvents = events.filter((e) => e.type === 'knowledge:pattern:discovered');

    expect(decisionEvents.length).toBe(5);
    expect(patternEvents.length).toBe(1);
  });

  it('getBestStrategy() reflects writer data', () => {
    const writer = new KnowledgeWriter(knowledgeDb, eventBus);
    const store = new StrategyPerformanceStore(knowledgeDb);

    // Record 3 successful "direct" results
    for (let i = 0; i < 3; i++) {
      writer.record(mockResult(), mockEvaluation());
    }

    const best = store.getBestStrategy('simple', 'low');
    expect(best).not.toBeNull();
    expect(best!.strategyId).toBe('direct');
    expect(best!.successRate).toBe(1.0);
  });

  it('Compactor does not break PerformanceStore reads on recent data', () => {
    const writer = new KnowledgeWriter(knowledgeDb, eventBus);
    const store = new StrategyPerformanceStore(knowledgeDb);
    const compactor = new Compactor(knowledgeDb, eventBus);

    // Record some data
    for (let i = 0; i < 3; i++) {
      writer.record(mockResult(), mockEvaluation());
    }

    // Run compaction (should not prune recent data)
    compactor.run();

    // PerformanceStore should still see all data
    const perf = store.getPerformance('direct');
    expect(perf).not.toBeNull();
    expect(perf!.totalRuns).toBe(3);
  });
});
