/**
 * MultiPerspectiveEvaluator & Configurable DebateStrategy Tests (Phase 3)
 * Tests enhanced adversarial review with cross-strategy validation,
 * consistency checks, and configurable debate rounds.
 *
 * @author Subash Karki
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { rmSync } from 'node:fs';

import type { TaskContext, StrategyOutput } from '../types/strategy.js';

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
  const dir = mkdtempSync(join(tmpdir(), 'phantom-multi-eval-test-'));
  (globalThis as Record<string, unknown>).__PHANTOM_MULTI_EVAL_TEST_DIR = dir;
  return { AI_ENGINE_DIR: dir };
});

let tempDir: string;

// Imports must come after vi.mock so the mock is applied
import { KnowledgeDB } from '../knowledge/knowledge-db.js';
import { DecisionQuery } from '../graph/decision-query.js';
import { MultiPerspectiveEvaluator } from '../orchestrator/multi-evaluator.js';
import { Evaluator } from '../orchestrator/evaluator.js';
import { DebateStrategy } from '../strategies/debate.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT_ID = 'multi-eval-test';

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
  failureReason?: string | null;
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
    opts.success ? null : (opts.failureReason ?? 'Strategy failed on similar task'),
    0, now,
  );
}

function makeContext(overrides: Partial<TaskContext> = {}): TaskContext {
  return {
    goal: 'fix auth module bug',
    relevantFiles: ['src/auth.ts'],
    blastRadius: 3,
    complexity: 'moderate',
    risk: 'medium',
    isAmbiguous: false,
    signals: {},
    ...overrides,
  };
}

function makeOutput(overrides: Partial<StrategyOutput> = {}): StrategyOutput {
  return {
    strategyId: 'direct',
    result: JSON.stringify({ type: 'direct-execution', goal: 'fix auth module bug' }),
    confidence: 0.8,
    tokensUsed: 500,
    durationMs: 100,
    artifacts: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let knowledgeDb: KnowledgeDB;

beforeEach(() => {
  tempDir = (globalThis as Record<string, unknown>).__PHANTOM_MULTI_EVAL_TEST_DIR as string;
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
// 1. MultiPerspectiveEvaluator
// ===========================================================================

describe('MultiPerspectiveEvaluator', () => {
  describe('without DecisionQuery', () => {
    it('behaves exactly like base Evaluator', () => {
      const multiEval = new MultiPerspectiveEvaluator();
      const baseEval = new Evaluator();

      const output = makeOutput({ confidence: 0.85 });
      const context = makeContext();

      const multiResult = multiEval.evaluateWithHistory(output, context);
      const baseResult = baseEval.evaluate(output, context);

      expect(multiResult.confidence).toBe(baseResult.confidence);
      expect(multiResult.checks).toEqual(baseResult.checks);
      expect(multiResult.recommendation).toBe(baseResult.recommendation);
    });

    it('base evaluate() method is still accessible', () => {
      const multiEval = new MultiPerspectiveEvaluator();
      const output = makeOutput({ confidence: 0.85 });
      const context = makeContext();

      const result = multiEval.evaluate(output, context);
      expect(result.recommendation).toBeDefined();
      expect(result.checks.length).toBeGreaterThan(0);
    });
  });

  describe('with prior successes', () => {
    it('adds priorSuccess check (passed: true) when strategy previously succeeded', () => {
      seedDecision(knowledgeDb, {
        goal: 'fix auth module bug',
        strategyId: 'direct',
        strategyName: 'Direct',
        success: true,
        confidence: 0.9,
      });

      const decisionQuery = new DecisionQuery(knowledgeDb);
      const evaluator = new MultiPerspectiveEvaluator(decisionQuery);

      const output = makeOutput({ strategyId: 'direct', confidence: 0.85 });
      const context = makeContext();

      const result = evaluator.evaluateWithHistory(output, context);

      const priorSuccessCheck = result.checks.find(c => c.name === 'priorSuccess');
      expect(priorSuccessCheck).toBeDefined();
      expect(priorSuccessCheck!.passed).toBe(true);
      expect(priorSuccessCheck!.detail).toContain('previously succeeded');
      expect(priorSuccessCheck!.detail).toContain('direct');
    });

    it('does not add priorSuccess check when a different strategy succeeded', () => {
      seedDecision(knowledgeDb, {
        goal: 'fix auth module bug',
        strategyId: 'debate',
        strategyName: 'Debate',
        success: true,
        confidence: 0.9,
      });

      const decisionQuery = new DecisionQuery(knowledgeDb);
      const evaluator = new MultiPerspectiveEvaluator(decisionQuery);

      const output = makeOutput({ strategyId: 'direct', confidence: 0.85 });
      const context = makeContext();

      const result = evaluator.evaluateWithHistory(output, context);

      const priorSuccessCheck = result.checks.find(c => c.name === 'priorSuccess');
      expect(priorSuccessCheck).toBeUndefined();
    });
  });

  describe('with prior failures', () => {
    it('adds priorFailure check (passed: false) when strategy previously failed', () => {
      seedDecision(knowledgeDb, {
        goal: 'fix auth module bug',
        strategyId: 'direct',
        strategyName: 'Direct',
        success: false,
        confidence: 0.5,
        failureReason: 'Did not handle edge case',
      });

      const decisionQuery = new DecisionQuery(knowledgeDb);
      const evaluator = new MultiPerspectiveEvaluator(decisionQuery);

      const output = makeOutput({ strategyId: 'direct', confidence: 0.65 });
      const context = makeContext();

      const result = evaluator.evaluateWithHistory(output, context);

      const priorFailureCheck = result.checks.find(c => c.name === 'priorFailure');
      expect(priorFailureCheck).toBeDefined();
      expect(priorFailureCheck!.passed).toBe(false);
      expect(priorFailureCheck!.detail).toContain('previously failed');
      expect(priorFailureCheck!.detail).toContain('direct');
    });

    it('does not add priorFailure check when a different strategy failed', () => {
      seedDecision(knowledgeDb, {
        goal: 'fix auth module bug',
        strategyId: 'debate',
        strategyName: 'Debate',
        success: false,
        confidence: 0.5,
      });

      const decisionQuery = new DecisionQuery(knowledgeDb);
      const evaluator = new MultiPerspectiveEvaluator(decisionQuery);

      const output = makeOutput({ strategyId: 'direct', confidence: 0.85 });
      const context = makeContext();

      const result = evaluator.evaluateWithHistory(output, context);

      const priorFailureCheck = result.checks.find(c => c.name === 'priorFailure');
      expect(priorFailureCheck).toBeUndefined();
    });
  });

  describe('consistency check', () => {
    it('passes when confidence delta < 0.3', () => {
      seedDecision(knowledgeDb, {
        goal: 'fix auth module bug',
        strategyId: 'debate',
        strategyName: 'Debate',
        success: true,
        confidence: 0.8,
      });

      const decisionQuery = new DecisionQuery(knowledgeDb);
      const evaluator = new MultiPerspectiveEvaluator(decisionQuery);

      const output = makeOutput({ strategyId: 'direct', confidence: 0.85 });
      const context = makeContext();

      const result = evaluator.evaluateWithHistory(output, context);

      const consistencyCheck = result.checks.find(c => c.name === 'consistencyCheck');
      expect(consistencyCheck).toBeDefined();
      expect(consistencyCheck!.passed).toBe(true);
      expect(consistencyCheck!.detail).toContain('consistent');
    });

    it('fails when confidence delta >= 0.3', () => {
      seedDecision(knowledgeDb, {
        goal: 'fix auth module bug',
        strategyId: 'debate',
        strategyName: 'Debate',
        success: true,
        confidence: 0.4,
      });

      const decisionQuery = new DecisionQuery(knowledgeDb);
      const evaluator = new MultiPerspectiveEvaluator(decisionQuery);

      const output = makeOutput({ strategyId: 'direct', confidence: 0.85 });
      const context = makeContext();

      const result = evaluator.evaluateWithHistory(output, context);

      const consistencyCheck = result.checks.find(c => c.name === 'consistencyCheck');
      expect(consistencyCheck).toBeDefined();
      expect(consistencyCheck!.passed).toBe(false);
      expect(consistencyCheck!.detail).toContain('differs significantly');
    });

    it('is not added when no past successes exist', () => {
      const decisionQuery = new DecisionQuery(knowledgeDb);
      const evaluator = new MultiPerspectiveEvaluator(decisionQuery);

      const output = makeOutput({ strategyId: 'direct', confidence: 0.85 });
      const context = makeContext();

      const result = evaluator.evaluateWithHistory(output, context);

      const consistencyCheck = result.checks.find(c => c.name === 'consistencyCheck');
      expect(consistencyCheck).toBeUndefined();
    });
  });

  describe('recommendation with history', () => {
    it('prior failure + low confidence triggers escalate', () => {
      seedDecision(knowledgeDb, {
        goal: 'fix auth module bug',
        strategyId: 'direct',
        strategyName: 'Direct',
        success: false,
        confidence: 0.5,
      });

      const decisionQuery = new DecisionQuery(knowledgeDb);
      const evaluator = new MultiPerspectiveEvaluator(decisionQuery);

      // confidence 0.65 < 0.7 + prior failure → escalate
      const output = makeOutput({ strategyId: 'direct', confidence: 0.65 });
      const context = makeContext();

      const result = evaluator.evaluateWithHistory(output, context);
      expect(result.recommendation).toBe('escalate');
    });

    it('prior success with high confidence triggers accept', () => {
      seedDecision(knowledgeDb, {
        goal: 'fix auth module bug',
        strategyId: 'direct',
        strategyName: 'Direct',
        success: true,
        confidence: 0.9,
      });

      const decisionQuery = new DecisionQuery(knowledgeDb);
      const evaluator = new MultiPerspectiveEvaluator(decisionQuery);

      const output = makeOutput({ strategyId: 'direct', confidence: 0.85 });
      const context = makeContext();

      const result = evaluator.evaluateWithHistory(output, context);
      expect(result.recommendation).toBe('accept');
    });

    it('prior failure with high confidence triggers refine (not escalate)', () => {
      seedDecision(knowledgeDb, {
        goal: 'fix auth module bug',
        strategyId: 'direct',
        strategyName: 'Direct',
        success: false,
        confidence: 0.5,
      });

      const decisionQuery = new DecisionQuery(knowledgeDb);
      const evaluator = new MultiPerspectiveEvaluator(decisionQuery);

      // confidence 0.75 >= 0.7 so the prior failure + low confidence escalate doesn't trigger
      // but hasPriorFailure means allPassed is false → refine
      const output = makeOutput({ strategyId: 'direct', confidence: 0.75 });
      const context = makeContext();

      const result = evaluator.evaluateWithHistory(output, context);
      expect(result.recommendation).toBe('refine');
    });
  });
});

// ===========================================================================
// 2. Configurable DebateStrategy
// ===========================================================================

describe('DebateStrategy (configurable)', () => {
  describe('numRounds', () => {
    it('defaults to 2 rounds', async () => {
      const strategy = new DebateStrategy();

      const input = {
        context: makeContext({ risk: 'critical', complexity: 'complex' }),
        graphContext: {
          files: [{ path: 'src/auth.ts', relevance: 0.9 }],
          edges: [],
        },
      };

      const output = await strategy.execute(input);
      const parsed = JSON.parse(output.result);
      expect(parsed.rounds).toHaveLength(2);
      expect(output.artifacts.rounds).toBe(2);
    });

    it('constructor with numRounds: 3 creates 3 debate rounds', async () => {
      const strategy = new DebateStrategy({ numRounds: 3 });

      const input = {
        context: makeContext({ risk: 'critical', complexity: 'complex' }),
        graphContext: {
          files: [{ path: 'src/auth.ts', relevance: 0.9 }],
          edges: [],
        },
      };

      const output = await strategy.execute(input);
      const parsed = JSON.parse(output.result);
      expect(parsed.rounds).toHaveLength(3);
      expect(output.artifacts.rounds).toBe(3);
    });

    it('constructor with numRounds: 1 creates 1 debate round', async () => {
      const strategy = new DebateStrategy({ numRounds: 1 });

      const input = {
        context: makeContext({ risk: 'critical', complexity: 'complex' }),
        graphContext: {
          files: [{ path: 'src/auth.ts', relevance: 0.9 }],
          edges: [],
        },
      };

      const output = await strategy.execute(input);
      const parsed = JSON.parse(output.result);
      expect(parsed.rounds).toHaveLength(1);
      expect(output.artifacts.rounds).toBe(1);
    });
  });

  describe('prior failures in context signals', () => {
    it('adds extra critic points from prior failures', async () => {
      const strategy = new DebateStrategy();

      const context = makeContext({
        risk: 'critical',
        complexity: 'complex',
        signals: {
          priorFailures: [
            { strategyId: 'direct', strategyName: 'Direct', failureReason: 'Missed edge case in auth flow', confidence: 0.4 },
            { strategyId: 'advisor', strategyName: 'Advisor', failureReason: 'Incomplete risk analysis', confidence: 0.3 },
          ],
        },
      });

      const input = {
        context,
        graphContext: {
          files: [{ path: 'src/auth.ts', relevance: 0.9 }],
          edges: [],
        },
      };

      const output = await strategy.execute(input);
      const parsed = JSON.parse(output.result);

      // The critic points should include the prior failure reasons
      const criticPoints = parsed.criticPoints as string[];
      expect(criticPoints.some((p: string) => p.includes('Prior approach "direct" failed'))).toBe(true);
      expect(criticPoints.some((p: string) => p.includes('Missed edge case in auth flow'))).toBe(true);
      expect(criticPoints.some((p: string) => p.includes('Prior approach "advisor" failed'))).toBe(true);
      expect(criticPoints.some((p: string) => p.includes('Incomplete risk analysis'))).toBe(true);
    });

    it('does not add critic points when prior failures have no failureReason', async () => {
      const strategy = new DebateStrategy();

      const context = makeContext({
        risk: 'critical',
        complexity: 'complex',
        signals: {
          priorFailures: [
            { strategyId: 'direct', strategyName: 'Direct', failureReason: null, confidence: 0.4 },
          ],
        },
      });

      const input = {
        context,
        graphContext: {
          files: [{ path: 'src/auth.ts', relevance: 0.9 }],
          edges: [],
        },
      };

      const output = await strategy.execute(input);
      const parsed = JSON.parse(output.result);

      // Should not have a prior failure critic point since reason is null
      const criticPoints = parsed.criticPoints as string[];
      expect(criticPoints.some((p: string) => p.includes('Prior approach'))).toBe(false);
    });

    it('does not add critic points when no prior failures exist', async () => {
      const strategy = new DebateStrategy();

      const context = makeContext({
        risk: 'critical',
        complexity: 'complex',
        signals: {},
      });

      const input = {
        context,
        graphContext: {
          files: [{ path: 'src/auth.ts', relevance: 0.9 }],
          edges: [],
        },
      };

      const output = await strategy.execute(input);
      const parsed = JSON.parse(output.result);

      const criticPoints = parsed.criticPoints as string[];
      expect(criticPoints.some((p: string) => p.includes('Prior approach'))).toBe(false);
    });
  });
});
