/**
 * Anti-Repetition System Tests (Phase 2)
 * Tests DecisionQuery, assessor signal injection, and strategy prior-failure penalty.
 *
 * @author Subash Karki
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { rmSync } from 'node:fs';

import type { TaskContext, PriorFailureSignal } from '../types/strategy.js';

// ---------------------------------------------------------------------------
// Mock @phantom-os/shared so KnowledgeDB writes to a temp dir.
// vi.mock is hoisted above all imports. The factory must NOT reference any
// module-scoped variables — so we inline the temp-dir creation.
// We stash the path on globalThis so the test body can read it back.
// ---------------------------------------------------------------------------

vi.mock('@phantom-os/shared', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'phantom-anti-rep-test-'));
  (globalThis as Record<string, unknown>).__PHANTOM_ANTI_REP_TEST_DIR = dir;
  return { AI_ENGINE_DIR: dir };
});

let tempDir: string;

// Imports must come after vi.mock so the mock is applied
import { KnowledgeDB } from '../knowledge/knowledge-db.js';
import { DecisionQuery } from '../graph/decision-query.js';
import { TaskAssessor } from '../orchestrator/assessor.js';
import { EventBus } from '../events/event-bus.js';
import { applyPriorFailurePenalty } from '../strategies/prior-penalty.js';
import { DirectStrategy } from '../strategies/direct.js';
import { DebateStrategy } from '../strategies/debate.js';
import { TreeOfThoughtStrategy } from '../strategies/tree-of-thought.js';
import { AdvisorStrategy } from '../strategies/advisor.js';
import { GraphOfThoughtStrategy } from '../strategies/graph-of-thought.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT_ID = 'anti-rep-test';

/**
 * Seed a decision + outcome pair directly into the DB.
 */
function seedDecision(db: KnowledgeDB, opts: {
  goal: string;
  strategyId: string;
  strategyName: string;
  success: boolean;
  confidence?: number;
  complexity?: string;
  risk?: string;
  createdAt?: number;
}): void {
  const id = crypto.randomUUID();
  const now = opts.createdAt ?? Date.now();
  db.db.prepare(
    `INSERT INTO decisions (id, project_id, goal, strategy_id, strategy_name, confidence, complexity, risk, files_involved, duration_ms, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id, db.projectId, opts.goal, opts.strategyId, opts.strategyName,
    opts.confidence ?? 0.7, opts.complexity ?? 'moderate', opts.risk ?? 'medium',
    '[]', 1000, now,
  );
  db.db.prepare(
    `INSERT INTO outcomes (id, decision_id, success, evaluation_score, recommendation, failure_reason, refinement_count, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).run(
    crypto.randomUUID(), id, opts.success ? 1 : 0,
    opts.confidence ?? 0.7,
    opts.success ? 'accept' : 'escalate',
    opts.success ? null : 'Strategy failed on similar task',
    0, now,
  );
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let knowledgeDb: KnowledgeDB;

beforeEach(() => {
  tempDir = (globalThis as Record<string, unknown>).__PHANTOM_ANTI_REP_TEST_DIR as string;
  knowledgeDb = new KnowledgeDB(PROJECT_ID);
});

afterEach(() => {
  knowledgeDb.close();
  // Clear all data between tests so each test starts fresh
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
// 1. DecisionQuery
// ===========================================================================

describe('DecisionQuery', () => {
  let query: DecisionQuery;

  beforeEach(() => {
    query = new DecisionQuery(knowledgeDb);
  });

  it('findSimilarDecisions returns empty array when no data exists', () => {
    const results = query.findSimilarDecisions('fix auth module bug');
    expect(results).toEqual([]);
  });

  it('findSimilarDecisions finds decisions with similar goals', () => {
    seedDecision(knowledgeDb, {
      goal: 'fix auth module bug',
      strategyId: 'direct',
      strategyName: 'Direct',
      success: true,
    });

    const results = query.findSimilarDecisions('fix the auth module login bug');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].goal).toBe('fix auth module bug');
  });

  it('findSimilarDecisions does NOT match completely different goals', () => {
    seedDecision(knowledgeDb, {
      goal: 'fix auth bug',
      strategyId: 'direct',
      strategyName: 'Direct',
      success: true,
    });

    const results = query.findSimilarDecisions('deploy to staging');
    expect(results).toEqual([]);
  });

  it('findSimilarDecisions respects minSimilarity threshold', () => {
    seedDecision(knowledgeDb, {
      goal: 'fix auth module bug',
      strategyId: 'direct',
      strategyName: 'Direct',
      success: true,
    });

    // Very high threshold — unlikely to match
    const strict = query.findSimilarDecisions('fix the auth module login bug', 0.99);
    expect(strict).toEqual([]);

    // Low threshold — should match
    const loose = query.findSimilarDecisions('fix the auth module login bug', 0.1);
    expect(loose.length).toBeGreaterThan(0);
  });

  it('getFailedApproaches returns only failures for similar goals', () => {
    seedDecision(knowledgeDb, {
      goal: 'fix auth module bug',
      strategyId: 'direct',
      strategyName: 'Direct',
      success: false,
    });
    seedDecision(knowledgeDb, {
      goal: 'fix auth module bug',
      strategyId: 'debate',
      strategyName: 'Debate',
      success: true,
    });

    const failures = query.getFailedApproaches('fix the auth module login bug');
    expect(failures.length).toBe(1);
    expect(failures[0].strategyId).toBe('direct');
    expect(failures[0].failureReason).toBe('Strategy failed on similar task');
  });

  it('getFailedApproaches returns empty when all past approaches succeeded', () => {
    seedDecision(knowledgeDb, {
      goal: 'fix auth module bug',
      strategyId: 'direct',
      strategyName: 'Direct',
      success: true,
    });
    seedDecision(knowledgeDb, {
      goal: 'fix auth module bug',
      strategyId: 'debate',
      strategyName: 'Debate',
      success: true,
    });

    const failures = query.getFailedApproaches('fix the auth module login bug');
    expect(failures).toEqual([]);
  });

  it('getSuccessfulApproaches returns only successes', () => {
    seedDecision(knowledgeDb, {
      goal: 'fix auth module bug',
      strategyId: 'direct',
      strategyName: 'Direct',
      success: true,
      confidence: 0.9,
    });
    seedDecision(knowledgeDb, {
      goal: 'fix auth module bug',
      strategyId: 'debate',
      strategyName: 'Debate',
      success: false,
    });

    const successes = query.getSuccessfulApproaches('fix the auth module login bug');
    expect(successes.length).toBe(1);
    expect(successes[0].strategyId).toBe('direct');
    expect(successes[0].confidence).toBe(0.9);
  });

  it('getOutcomes returns outcomes for given decision IDs', () => {
    // Seed two decisions and grab their IDs
    seedDecision(knowledgeDb, {
      goal: 'fix bug A',
      strategyId: 'direct',
      strategyName: 'Direct',
      success: true,
    });
    seedDecision(knowledgeDb, {
      goal: 'fix bug B',
      strategyId: 'debate',
      strategyName: 'Debate',
      success: false,
    });

    const allDecisions = knowledgeDb.db.prepare(
      'SELECT id FROM decisions WHERE project_id = ?',
    ).all(PROJECT_ID) as Array<{ id: string }>;
    const ids = allDecisions.map((d) => d.id);

    const outcomes = query.getOutcomes(ids);
    expect(outcomes.size).toBe(2);

    for (const id of ids) {
      expect(outcomes.has(id)).toBe(true);
    }

    // One should be success, one failure
    const vals = [...outcomes.values()];
    const successCount = vals.filter((o) => o.success).length;
    const failCount = vals.filter((o) => !o.success).length;
    expect(successCount).toBe(1);
    expect(failCount).toBe(1);
  });
});

// ===========================================================================
// 2. applyPriorFailurePenalty
// ===========================================================================

describe('applyPriorFailurePenalty', () => {
  it('returns original score when no priorFailures in signals', () => {
    const base = { score: 0.8, reason: 'test' };
    const context: TaskContext = {
      goal: 'fix bug', relevantFiles: [], blastRadius: 1,
      complexity: 'simple', risk: 'low', isAmbiguous: false,
      signals: {},
    };

    const result = applyPriorFailurePenalty(base, 'direct', context);
    expect(result.score).toBe(0.8);
    expect(result.reason).toBe('test');
  });

  it('returns original score when priorFailures exists but none match this strategy', () => {
    const base = { score: 0.8, reason: 'test' };
    const context: TaskContext = {
      goal: 'fix bug', relevantFiles: [], blastRadius: 1,
      complexity: 'simple', risk: 'low', isAmbiguous: false,
      signals: {
        priorFailures: [{ strategyId: 'debate', strategyName: 'Debate', failureReason: 'failed', confidence: 0.4 }],
      },
    };

    const result = applyPriorFailurePenalty(base, 'direct', context);
    expect(result.score).toBe(0.8);
    expect(result.reason).toBe('test');
  });

  it('applies 0.3 penalty when strategy previously failed', () => {
    const base = { score: 0.8, reason: 'test' };
    const context: TaskContext = {
      goal: 'fix bug', relevantFiles: [], blastRadius: 1,
      complexity: 'simple', risk: 'low', isAmbiguous: false,
      signals: {
        priorFailures: [{ strategyId: 'direct', strategyName: 'Direct', failureReason: 'failed', confidence: 0.4 }],
      },
    };

    const result = applyPriorFailurePenalty(base, 'direct', context);
    expect(result.score).toBe(0.5); // 0.8 - 0.3
  });

  it('score cannot go below 0', () => {
    const base = { score: 0.2, reason: 'test' };
    const context: TaskContext = {
      goal: 'fix bug', relevantFiles: [], blastRadius: 1,
      complexity: 'simple', risk: 'low', isAmbiguous: false,
      signals: {
        priorFailures: [{ strategyId: 'direct', strategyName: 'Direct', failureReason: 'failed', confidence: 0.4 }],
      },
    };

    const result = applyPriorFailurePenalty(base, 'direct', context);
    expect(result.score).toBe(0); // max(0, 0.2 - 0.3) = 0
  });

  it('appends penalized note to reason', () => {
    const base = { score: 0.8, reason: 'test reason' };
    const context: TaskContext = {
      goal: 'fix bug', relevantFiles: [], blastRadius: 1,
      complexity: 'simple', risk: 'low', isAmbiguous: false,
      signals: {
        priorFailures: [{ strategyId: 'direct', strategyName: 'Direct', failureReason: 'failed', confidence: 0.4 }],
      },
    };

    const result = applyPriorFailurePenalty(base, 'direct', context);
    expect(result.reason).toContain('penalized: previously failed on similar goal');
  });
});

// ===========================================================================
// 3. TaskAssessor with DecisionQuery
// ===========================================================================

describe('TaskAssessor with DecisionQuery', () => {
  const mockGraphContext = {
    files: [{ id: 'file:test:src/auth.ts', type: 'file' as const, projectId: PROJECT_ID, path: 'src/auth.ts', extension: 'ts', size: 100, contentHash: 'abc', lastModified: Date.now(), metadata: {}, createdAt: Date.now(), updatedAt: Date.now() }],
    edges: [],
    modules: [],
    documents: [],
    scores: new Map([['file:test:src/auth.ts', 0.9]]),
  };
  const mockBlastRadius = {
    direct: [],
    transitive: [],
    impactScore: 0,
  };

  it('without DecisionQuery, no priorFailures/priorSuccess in signals', () => {
    const assessor = new TaskAssessor();
    const input = { goal: 'fix auth module bug', projectId: PROJECT_ID };

    const result = assessor.assess(input, mockGraphContext, mockBlastRadius);
    expect(result.signals.priorFailures).toBeUndefined();
    expect(result.signals.priorSuccess).toBeUndefined();
  });

  it('with DecisionQuery and past failures, injects priorFailures into signals', () => {
    seedDecision(knowledgeDb, {
      goal: 'fix auth module bug',
      strategyId: 'direct',
      strategyName: 'Direct',
      success: false,
      confidence: 0.5,
    });

    const assessor = new TaskAssessor();
    const decisionQuery = new DecisionQuery(knowledgeDb);
    assessor.setDecisionQuery(decisionQuery);

    const input = { goal: 'fix the auth module login bug', projectId: PROJECT_ID };
    const result = assessor.assess(input, mockGraphContext, mockBlastRadius);

    expect(result.signals.priorFailures).toBeDefined();
    expect(result.signals.priorFailures!.length).toBeGreaterThan(0);
    expect(result.signals.priorFailures![0].strategyId).toBe('direct');
  });

  it('with DecisionQuery and past successes, injects priorSuccess into signals', () => {
    seedDecision(knowledgeDb, {
      goal: 'fix auth module bug',
      strategyId: 'debate',
      strategyName: 'Debate',
      success: true,
      confidence: 0.9,
    });

    const assessor = new TaskAssessor();
    const decisionQuery = new DecisionQuery(knowledgeDb);
    assessor.setDecisionQuery(decisionQuery);

    const input = { goal: 'fix the auth module login bug', projectId: PROJECT_ID };
    const result = assessor.assess(input, mockGraphContext, mockBlastRadius);

    expect(result.signals.priorSuccess).toBeDefined();
    expect(result.signals.priorSuccess!.strategyId).toBe('debate');
    expect(result.signals.priorSuccess!.confidence).toBe(0.9);
  });

  it('priorSuccess picks the highest confidence success', () => {
    seedDecision(knowledgeDb, {
      goal: 'fix auth module bug',
      strategyId: 'direct',
      strategyName: 'Direct',
      success: true,
      confidence: 0.6,
    });
    seedDecision(knowledgeDb, {
      goal: 'fix auth module bug',
      strategyId: 'debate',
      strategyName: 'Debate',
      success: true,
      confidence: 0.95,
    });

    const assessor = new TaskAssessor();
    const decisionQuery = new DecisionQuery(knowledgeDb);
    assessor.setDecisionQuery(decisionQuery);

    const input = { goal: 'fix the auth module login bug', projectId: PROJECT_ID };
    const result = assessor.assess(input, mockGraphContext, mockBlastRadius);

    expect(result.signals.priorSuccess).toBeDefined();
    expect(result.signals.priorSuccess!.confidence).toBe(0.95);
    expect(result.signals.priorSuccess!.strategyId).toBe('debate');
  });
});

// ===========================================================================
// 4. Strategy shouldActivate with prior failures
// ===========================================================================

describe('Strategy shouldActivate with prior failures', () => {
  // Helper to build a TaskContext with optional priorFailures
  function makeContext(overrides?: {
    complexity?: TaskContext['complexity'];
    risk?: TaskContext['risk'];
    isAmbiguous?: boolean;
    blastRadius?: number;
    priorFailures?: PriorFailureSignal[];
  }): TaskContext {
    return {
      goal: 'fix bug',
      relevantFiles: [],
      blastRadius: overrides?.blastRadius ?? 1,
      complexity: overrides?.complexity ?? 'simple',
      risk: overrides?.risk ?? 'low',
      isAmbiguous: overrides?.isAmbiguous ?? false,
      signals: {
        ...(overrides?.priorFailures && { priorFailures: overrides.priorFailures }),
      },
    };
  }

  function makePriorFailure(strategyId: string): PriorFailureSignal {
    return { strategyId, strategyName: strategyId, failureReason: 'failed', confidence: 0.4 };
  }

  // -------------------------------------------------------------------------
  // DirectStrategy — simple/low → 0.9
  // -------------------------------------------------------------------------

  describe('DirectStrategy', () => {
    it('without priorFailures, returns normal score', () => {
      const strategy = new DirectStrategy();
      const context = makeContext({ complexity: 'simple', risk: 'low' });
      const score = strategy.shouldActivate(context);
      expect(score.score).toBe(0.9);
      expect(score.reason).not.toContain('penalized');
    });

    it('penalizes when this strategy previously failed', () => {
      const strategy = new DirectStrategy();
      const context = makeContext({
        complexity: 'simple', risk: 'low',
        priorFailures: [makePriorFailure('direct')],
      });
      const score = strategy.shouldActivate(context);
      expect(score.score).toBeCloseTo(0.6, 5); // 0.9 - 0.3
      expect(score.reason).toContain('penalized');
    });

    it('does not penalize when a DIFFERENT strategy failed', () => {
      const strategy = new DirectStrategy();
      const context = makeContext({
        complexity: 'simple', risk: 'low',
        priorFailures: [makePriorFailure('debate')],
      });
      const score = strategy.shouldActivate(context);
      expect(score.score).toBe(0.9);
      expect(score.reason).not.toContain('penalized');
    });
  });

  // -------------------------------------------------------------------------
  // DebateStrategy — critical risk → 0.9
  // -------------------------------------------------------------------------

  describe('DebateStrategy', () => {
    it('without priorFailures, returns normal score', () => {
      const strategy = new DebateStrategy();
      const context = makeContext({ complexity: 'complex', risk: 'critical' });
      const score = strategy.shouldActivate(context);
      expect(score.score).toBe(0.9);
      expect(score.reason).not.toContain('penalized');
    });

    it('penalizes when this strategy previously failed', () => {
      const strategy = new DebateStrategy();
      const context = makeContext({
        complexity: 'complex', risk: 'critical',
        priorFailures: [makePriorFailure('debate')],
      });
      const score = strategy.shouldActivate(context);
      expect(score.score).toBeCloseTo(0.6, 5); // 0.9 - 0.3
      expect(score.reason).toContain('penalized');
    });

    it('does not penalize when a DIFFERENT strategy failed', () => {
      const strategy = new DebateStrategy();
      const context = makeContext({
        complexity: 'complex', risk: 'critical',
        priorFailures: [makePriorFailure('direct')],
      });
      const score = strategy.shouldActivate(context);
      expect(score.score).toBe(0.9);
      expect(score.reason).not.toContain('penalized');
    });
  });

  // -------------------------------------------------------------------------
  // TreeOfThoughtStrategy — ambiguous + moderate/complex → 0.85
  // -------------------------------------------------------------------------

  describe('TreeOfThoughtStrategy', () => {
    it('without priorFailures, returns normal score', () => {
      const strategy = new TreeOfThoughtStrategy();
      const context = makeContext({ complexity: 'complex', risk: 'low', isAmbiguous: true });
      const score = strategy.shouldActivate(context);
      expect(score.score).toBe(0.85);
      expect(score.reason).not.toContain('penalized');
    });

    it('penalizes when this strategy previously failed', () => {
      const strategy = new TreeOfThoughtStrategy();
      const context = makeContext({
        complexity: 'complex', risk: 'low', isAmbiguous: true,
        priorFailures: [makePriorFailure('tree-of-thought')],
      });
      const score = strategy.shouldActivate(context);
      expect(score.score).toBe(0.55); // 0.85 - 0.3
      expect(score.reason).toContain('penalized');
    });

    it('does not penalize when a DIFFERENT strategy failed', () => {
      const strategy = new TreeOfThoughtStrategy();
      const context = makeContext({
        complexity: 'complex', risk: 'low', isAmbiguous: true,
        priorFailures: [makePriorFailure('direct')],
      });
      const score = strategy.shouldActivate(context);
      expect(score.score).toBe(0.85);
      expect(score.reason).not.toContain('penalized');
    });
  });

  // -------------------------------------------------------------------------
  // AdvisorStrategy — high/critical risk → 0.85
  // -------------------------------------------------------------------------

  describe('AdvisorStrategy', () => {
    it('without priorFailures, returns normal score', () => {
      const strategy = new AdvisorStrategy();
      const context = makeContext({ complexity: 'moderate', risk: 'high' });
      const score = strategy.shouldActivate(context);
      expect(score.score).toBe(0.85);
      expect(score.reason).not.toContain('penalized');
    });

    it('penalizes when this strategy previously failed', () => {
      const strategy = new AdvisorStrategy();
      const context = makeContext({
        complexity: 'moderate', risk: 'high',
        priorFailures: [makePriorFailure('advisor')],
      });
      const score = strategy.shouldActivate(context);
      expect(score.score).toBe(0.55); // 0.85 - 0.3
      expect(score.reason).toContain('penalized');
    });

    it('does not penalize when a DIFFERENT strategy failed', () => {
      const strategy = new AdvisorStrategy();
      const context = makeContext({
        complexity: 'moderate', risk: 'high',
        priorFailures: [makePriorFailure('debate')],
      });
      const score = strategy.shouldActivate(context);
      expect(score.score).toBe(0.85);
      expect(score.reason).not.toContain('penalized');
    });
  });

  // -------------------------------------------------------------------------
  // GraphOfThoughtStrategy — critical complexity → 0.9
  // -------------------------------------------------------------------------

  describe('GraphOfThoughtStrategy', () => {
    it('without priorFailures, returns normal score', () => {
      const strategy = new GraphOfThoughtStrategy();
      const context = makeContext({ complexity: 'critical', risk: 'low' });
      const score = strategy.shouldActivate(context);
      expect(score.score).toBe(0.9);
      expect(score.reason).not.toContain('penalized');
    });

    it('penalizes when this strategy previously failed', () => {
      const strategy = new GraphOfThoughtStrategy();
      const context = makeContext({
        complexity: 'critical', risk: 'low',
        priorFailures: [makePriorFailure('graph-of-thought')],
      });
      const score = strategy.shouldActivate(context);
      expect(score.score).toBeCloseTo(0.6, 5); // 0.9 - 0.3
      expect(score.reason).toContain('penalized');
    });

    it('does not penalize when a DIFFERENT strategy failed', () => {
      const strategy = new GraphOfThoughtStrategy();
      const context = makeContext({
        complexity: 'critical', risk: 'low',
        priorFailures: [makePriorFailure('direct')],
      });
      const score = strategy.shouldActivate(context);
      expect(score.score).toBe(0.9);
      expect(score.reason).not.toContain('penalized');
    });
  });
});
