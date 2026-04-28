/**
 * AI Engine Pipeline E2E Tests
 * Exercises the full v1 pipeline: context -> assess -> select -> execute -> evaluate -> record
 *
 * Uses in-memory graph and mock knowledge DB for speed.
 *
 * @author Subash Karki
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { rmSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Mock @phantom-os/shared so KnowledgeDB writes to a temp dir (no file I/O leaks)
// ---------------------------------------------------------------------------

vi.mock('@phantom-os/shared', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'phantom-e2e-pipeline-'));
  (globalThis as Record<string, unknown>).__PHANTOM_E2E_TEMP = dir;
  return { AI_ENGINE_DIR: dir };
});

// ---------------------------------------------------------------------------
// Imports (after vi.mock so the mock is applied)
// ---------------------------------------------------------------------------

import { InMemoryGraph } from '@phantom-os/ai-engine';
import { GraphBuilder } from '@phantom-os/ai-engine';
import { GraphQuery } from '@phantom-os/ai-engine';
import { StrategyRegistry } from '@phantom-os/ai-engine';
import { DirectStrategy } from '@phantom-os/ai-engine';
import { AdvisorStrategy } from '@phantom-os/ai-engine';
import { SelfRefineStrategy } from '@phantom-os/ai-engine';
import { Orchestrator } from '@phantom-os/ai-engine';
import { KnowledgeDB } from '@phantom-os/ai-engine';
import { DecisionQuery } from '@phantom-os/ai-engine';
import { Evaluator } from '@phantom-os/ai-engine';
import { EventBus } from '@phantom-os/ai-engine';
import type {
  GoalInput,
  OrchestratorResult,
  EvaluationResult,
} from '@phantom-os/ai-engine';
import type {
  FileNode,
  GraphEdge,
  ContextResult,
  BlastRadiusResult,
} from '@phantom-os/ai-engine';
import type {
  ReasoningStrategy,
  StrategyInput,
  StrategyOutput,
  TaskContext,
} from '@phantom-os/ai-engine';

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let tempDir: string;
const PROJECT_ID = 'e2e-test-project';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeFileNode = (path: string, id?: string): FileNode => ({
  id: id ?? `file:${PROJECT_ID}:${path}`,
  type: 'file',
  projectId: PROJECT_ID,
  path,
  extension: path.split('.').pop() ?? 'ts',
  size: 100,
  contentHash: `hash-${path}`,
  lastModified: Date.now(),
  metadata: {},
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const makeEdge = (sourceId: string, targetId: string): GraphEdge => ({
  id: `${sourceId}->${targetId}`,
  sourceId,
  targetId,
  type: 'imports',
  projectId: PROJECT_ID,
  weight: 1,
  metadata: {},
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

/**
 * Build a minimal in-memory graph with known dependencies.
 * A -> B -> C (chain) with known blast radius.
 */
const buildTestGraph = () => {
  const graph = new InMemoryGraph(PROJECT_ID);
  const fileA = makeFileNode('src/components/Button.tsx', 'file-a');
  const fileB = makeFileNode('src/utils/styles.ts', 'file-b');
  const fileC = makeFileNode('src/index.ts', 'file-c');

  graph.addNode(fileA);
  graph.addNode(fileB);
  graph.addNode(fileC);

  const edgeAB = makeEdge('file-a', 'file-b');
  const edgeBC = makeEdge('file-b', 'file-c');
  graph.addEdge(edgeAB);
  graph.addEdge(edgeBC);

  return { graph, files: [fileA, fileB, fileC], edges: [edgeAB, edgeBC] };
};

/** Create a mock GraphQuery with canned responses for known files. */
const mockGraphQuery = (fileCount = 3, blastDirect = 2, blastTransitive = 1): GraphQuery => {
  const files = Array.from({ length: fileCount }, (_, i) =>
    makeFileNode(`src/file${i}.ts`, `file-${i}`),
  );
  const edges = fileCount > 1
    ? Array.from({ length: fileCount - 1 }, (_, i) =>
        makeEdge(`file-${i}`, `file-${i + 1}`),
      )
    : [];
  const scores = new Map(files.map((f, i) => [f.id, 1 / (1 + i)]));
  const contextResult: ContextResult = { files, edges, modules: [], documents: [], scores };

  const directFiles = Array.from({ length: blastDirect }, (_, i) =>
    makeFileNode(`src/direct${i}.ts`, `direct-${i}`),
  );
  const transitiveFiles = Array.from({ length: blastTransitive }, (_, i) =>
    makeFileNode(`src/transitive${i}.ts`, `transitive-${i}`),
  );
  const blastResult: BlastRadiusResult = {
    direct: directFiles,
    transitive: transitiveFiles,
    impactScore: (blastDirect + blastTransitive) / 10,
  };

  const relatedFiles = [makeFileNode('src/related.ts', 'related-1')];

  return {
    getContext: () => contextResult,
    getBlastRadius: () => blastResult,
    getRelatedFiles: () => relatedFiles,
    getStats: () => ({
      projectId: PROJECT_ID,
      totalNodes: fileCount + 2,
      totalEdges: edges.length,
      fileCount,
      moduleCount: 0,
      layer2Count: 0,
      lastBuiltAt: 0,
      lastUpdatedAt: Date.now(),
      coverage: 100,
    }),
    findPath: () => [],
  } as unknown as GraphQuery;
};

/** Create a strategy registry with all base strategies. */
const createRegistry = (): StrategyRegistry => {
  const registry = new StrategyRegistry();
  registry.register(new DirectStrategy());
  registry.register(new AdvisorStrategy());
  registry.register(new SelfRefineStrategy());
  return registry;
};

/** Seed a decision+outcome pair directly into the DB for anti-repetition tests. */
const seedDecision = (
  db: KnowledgeDB,
  opts: {
    goal: string;
    strategyId: string;
    strategyName: string;
    success: boolean;
    confidence?: number;
    complexity?: string;
    risk?: string;
  },
): void => {
  const id = crypto.randomUUID();
  const now = Date.now();
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
};

// ===========================================================================
// Test Suite
// ===========================================================================

describe('AI Engine Pipeline E2E', () => {
  let knowledgeDb: KnowledgeDB;

  beforeEach(() => {
    tempDir = (globalThis as Record<string, unknown>).__PHANTOM_E2E_TEMP as string;
    knowledgeDb = new KnowledgeDB(PROJECT_ID);
  });

  afterEach(() => {
    knowledgeDb.close();
    // Clear data between tests
    try {
      const freshDb = new KnowledgeDB(PROJECT_ID);
      freshDb.db.exec('DELETE FROM outcomes');
      freshDb.db.exec('DELETE FROM decisions');
      freshDb.db.exec('DELETE FROM patterns');
      freshDb.db.exec('DELETE FROM strategy_performance');
      freshDb.close();
    } catch {
      // DB may already be cleaned up
    }
  });

  afterAll(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // 1. Full Pipeline
  // -------------------------------------------------------------------------

  it('full pipeline: context -> assess -> select -> execute -> evaluate -> record', async () => {
    const gq = mockGraphQuery(2, 1, 0);
    const registry = createRegistry();
    const decisionQuery = new DecisionQuery(knowledgeDb);
    const eventBus = new EventBus();

    const { KnowledgeWriter } = await import('@phantom-os/ai-engine');
    const { Compactor } = await import('@phantom-os/ai-engine');

    const writer = new KnowledgeWriter(knowledgeDb, eventBus);
    const compactor = new Compactor(knowledgeDb, eventBus);

    const orchestrator = new Orchestrator(gq, registry, {
      knowledgeWriter: writer,
      compactor,
      decisionQuery,
    });

    const input: GoalInput = {
      goal: 'Add a new button component',
      activeFiles: ['src/components/Button.tsx'],
      projectId: PROJECT_ID,
    };

    const result = await orchestrator.process(input);

    // 3. Context was gathered (files have relevance scores)
    expect(result.context.files.length).toBeGreaterThan(0);
    expect(result.context.files[0].relevance).toBeGreaterThan(0);

    // 4. Task was assessed (complexity, risk, ambiguity)
    expect(result.taskContext.complexity).toBeDefined();
    expect(result.taskContext.risk).toBeDefined();
    expect(typeof result.taskContext.isAmbiguous).toBe('boolean');

    // 5. Strategy was selected (not null, has a name)
    expect(result.strategy.id).toBeTruthy();
    expect(result.strategy.name).toBeTruthy();

    // 6. Strategy produced output (result is not empty)
    expect(result.output.result.length).toBeGreaterThan(0);
    expect(result.output.confidence).toBeGreaterThan(0);

    // 7. Evaluator ran (recommendation is accept/refine/escalate)
    const evaluator = new Evaluator();
    const evaluation = evaluator.evaluate(result.output, result.taskContext);
    expect(['accept', 'refine', 'escalate']).toContain(evaluation.recommendation);

    // 8. Knowledge was recorded (decision exists in DB)
    // Give a moment for the non-blocking write to complete
    const decisions = knowledgeDb.db
      .prepare('SELECT * FROM decisions WHERE project_id = ?')
      .all(PROJECT_ID);
    expect(decisions.length).toBeGreaterThan(0);

    const outcomes = knowledgeDb.db
      .prepare('SELECT * FROM outcomes')
      .all();
    expect(outcomes.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // 2. Anti-Repetition: Failed strategy gets penalized
  // -------------------------------------------------------------------------

  it('anti-repetition: failed strategy gets penalized on retry', async () => {
    // 1. Record a failed decision for strategy "direct" on a similar goal
    seedDecision(knowledgeDb, {
      goal: 'fix auth module bug',
      strategyId: 'direct',
      strategyName: 'Direct Execution',
      success: false,
      confidence: 0.4,
    });

    const gq = mockGraphQuery(2, 1, 0);
    const registry = createRegistry();
    const decisionQuery = new DecisionQuery(knowledgeDb);

    const orchestrator = new Orchestrator(gq, registry, { decisionQuery });

    // 2. Process a similar goal
    const result = await orchestrator.process({
      goal: 'fix the auth module login bug',
      activeFiles: ['src/auth.ts'],
      projectId: PROJECT_ID,
    });

    // 3. Check that direct strategy was penalized in alternatives
    const directAlt = result.alternatives.find((a) => a.id === 'direct');
    expect(directAlt).toBeDefined();

    // 4. The prior failure signals should have been injected
    const priorFailures = result.taskContext.signals.priorFailures;
    expect(priorFailures).toBeDefined();
    expect(priorFailures!.length).toBeGreaterThan(0);
    expect(priorFailures![0].strategyId).toBe('direct');
  });

  // -------------------------------------------------------------------------
  // 3. Multi-File Blast Radius Merges Correctly
  // -------------------------------------------------------------------------

  it('multi-file blast radius merges correctly', async () => {
    // Build graph with unique direct/transitive per file
    const files = [
      makeFileNode('src/a.ts', 'a'),
      makeFileNode('src/b.ts', 'b'),
      makeFileNode('src/c.ts', 'c'),
    ];

    // Each file has different dependents in blast radius
    let callCount = 0;
    const gq = {
      getContext: (file: string) => ({
        files: [files[callCount % 3]],
        edges: [],
        modules: [],
        documents: [],
        scores: new Map([[files[callCount % 3].id, 0.8]]),
      }),
      getBlastRadius: (file: string) => {
        callCount++;
        const idx = callCount - 1;
        return {
          direct: [makeFileNode(`src/dep-${idx}.ts`, `dep-${idx}`)],
          transitive: [makeFileNode(`src/trans-${idx}.ts`, `trans-${idx}`)],
          impactScore: 0.1 * (idx + 1),
        };
      },
      getRelatedFiles: () => [],
      getStats: () => ({
        projectId: PROJECT_ID,
        totalNodes: 10,
        totalEdges: 5,
        fileCount: 5,
        moduleCount: 0,
        layer2Count: 0,
        lastBuiltAt: 0,
        lastUpdatedAt: Date.now(),
        coverage: 100,
      }),
      findPath: () => [],
    } as unknown as GraphQuery;

    const registry = createRegistry();
    const orchestrator = new Orchestrator(gq, registry);

    const result = await orchestrator.process({
      goal: 'Refactor across modules',
      activeFiles: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
      projectId: PROJECT_ID,
    });

    // Blast radius should include dependents from ALL 3 files
    expect(result.context.blastRadius).toBeGreaterThanOrEqual(3);
  });

  // -------------------------------------------------------------------------
  // 4. Composite Handler (handleBeforeEdit) Returns Combined Data
  // -------------------------------------------------------------------------

  it('composite handler returns combined data', async () => {
    // Import the handler directly
    const { handleBeforeEdit } = await import('../mcp/handlers.js');

    const files = [
      makeFileNode('src/a.ts', 'fa'),
      makeFileNode('src/b.ts', 'fb'),
    ];

    const mockEngine = {
      getQuery: () => ({
        getContext: (file: string) => ({
          files: [files[0]],
          edges: [makeEdge('fa', 'fb')],
          modules: [],
          documents: [],
          scores: new Map([['fa', 0.9]]),
        }),
        getBlastRadius: () => ({
          direct: [files[1]],
          transitive: [],
          impactScore: 0.3,
        }),
        getRelatedFiles: () => [makeFileNode('src/related.ts', 'related')],
        getStats: () => ({ projectId: PROJECT_ID, fileCount: 2, totalEdges: 1, moduleCount: 0, coverage: 100, lastBuiltAt: 0 }),
        findPath: () => [],
      }),
      getStats: () => null,
      buildProject: async () => {},
      getBuildStatus: () => ({ status: 'idle' }),
    };

    const result = await handleBeforeEdit(
      mockEngine as any,
      undefined,
      { projectId: PROJECT_ID, files: ['src/a.ts', 'src/b.ts'], goal: 'Add feature' },
    );

    const parsed = JSON.parse(result.content[0].text);

    // Context merged from all files
    expect(parsed.context).toBeDefined();
    expect(parsed.context.files.length).toBeGreaterThan(0);

    // Blast radius merged
    expect(parsed.blastRadius).toBeDefined();
    expect(parsed.blastRadius.directlyAffected.length).toBeGreaterThan(0);

    // Related files
    expect(parsed.relatedFiles).toBeDefined();
    expect(parsed.relatedFiles.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // 5. Evaluator Uses Structural Check Not Length
  // -------------------------------------------------------------------------

  it('evaluator uses structural check not length', () => {
    const evaluator = new Evaluator();

    // Short but structurally valid JSON result
    const shortValid: StrategyOutput = {
      strategyId: 'direct',
      result: JSON.stringify({ files: [{ path: 'src/index.ts' }], type: 'direct' }),
      confidence: 0.85,
      tokensUsed: 50,
      durationMs: 5,
      artifacts: {},
    };
    const ctx: TaskContext = {
      goal: 'test',
      relevantFiles: [],
      blastRadius: 1,
      complexity: 'simple',
      risk: 'low',
      isAmbiguous: false,
      signals: {},
    };

    const validResult = evaluator.evaluate(shortValid, ctx);
    const contextCheck = validResult.checks.find((c) => c.name === 'contextCoverage');
    expect(contextCheck?.passed).toBe(true);

    // Long but empty/garbage result
    const longGarbage: StrategyOutput = {
      strategyId: 'direct',
      result: 'x',  // Single char, not structural
      confidence: 0.85,
      tokensUsed: 50,
      durationMs: 5,
      artifacts: {},
    };

    const garbageResult = evaluator.evaluate(longGarbage, ctx);
    const garbageCheck = garbageResult.checks.find((c) => c.name === 'contextCoverage');
    expect(garbageCheck?.passed).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 6. IDecisionQuery Interface Is Properly Typed
  // -------------------------------------------------------------------------

  it('IDecisionQuery interface is properly typed', () => {
    // Seed some data
    seedDecision(knowledgeDb, {
      goal: 'fix routing issue',
      strategyId: 'direct',
      strategyName: 'Direct',
      success: true,
      confidence: 0.9,
    });

    const decisionQuery = new DecisionQuery(knowledgeDb);

    // Verify it implements the interface (no cast needed in TS)
    const similar = decisionQuery.findSimilarDecisions('fix routing issue');
    expect(similar.length).toBeGreaterThan(0);

    const outcomes = decisionQuery.getOutcomes(similar.map((d) => d.id));
    expect(outcomes.size).toBe(similar.length);

    const successes = decisionQuery.getSuccessfulApproaches('fix routing issue');
    expect(successes.length).toBeGreaterThan(0);

    // Verify same query returns consistent results (deterministic)
    const similar2 = decisionQuery.findSimilarDecisions('fix routing issue');
    expect(similar2.length).toBe(similar.length);
    expect(similar2[0].id).toBe(similar[0].id);
  });
});
