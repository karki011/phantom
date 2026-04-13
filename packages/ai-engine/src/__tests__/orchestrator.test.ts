/**
 * Orchestrator Pipeline Tests
 * Tests for TaskAssessor, Evaluator, and Orchestrator
 *
 * @author Subash Karki
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { TaskAssessor } from '../orchestrator/assessor.js';
import { Evaluator } from '../orchestrator/evaluator.js';
import { Orchestrator } from '../orchestrator/orchestrator.js';
import type { GoalInput, OrchestratorResult } from '../orchestrator/types.js';
import type {
  BlastRadiusResult,
  ContextResult,
  FileNode,
  GraphEdge,
} from '../types/graph.js';
import type {
  ReasoningStrategy,
  StrategyInput,
  StrategyOutput,
  TaskContext,
} from '../types/strategy.js';
import { StrategyRegistry } from '../strategies/registry.js';
import { EventBus } from '../events/event-bus.js';
import type { GraphQuery } from '../graph/query.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFileNode(path: string, id?: string): FileNode {
  return {
    id: id ?? path,
    type: 'file',
    projectId: 'test-project',
    path,
    extension: path.split('.').pop() ?? 'ts',
    size: 100,
    contentHash: 'abc123',
    lastModified: Date.now(),
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function makeEdge(sourceId: string, targetId: string, id?: string): GraphEdge {
  return {
    id: id ?? `${sourceId}->${targetId}`,
    sourceId,
    targetId,
    type: 'imports',
    projectId: 'test-project',
    weight: 1,
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function makeContextResult(fileCount: number): ContextResult {
  const files = Array.from({ length: fileCount }, (_, i) =>
    makeFileNode(`src/file${i}.ts`, `file-${i}`),
  );
  const edges = fileCount > 1
    ? Array.from({ length: fileCount - 1 }, (_, i) =>
        makeEdge(`file-${i}`, `file-${i + 1}`, `edge-${i}`),
      )
    : [];
  const scores = new Map(files.map((f, i) => [f.id, 1 / (1 + i)]));

  return { files, edges, modules: [], documents: [], scores };
}

function makeBlastRadius(directCount: number, transitiveCount: number): BlastRadiusResult {
  const direct = Array.from({ length: directCount }, (_, i) =>
    makeFileNode(`src/direct${i}.ts`, `direct-${i}`),
  );
  const transitive = Array.from({ length: transitiveCount }, (_, i) =>
    makeFileNode(`src/transitive${i}.ts`, `transitive-${i}`),
  );
  return {
    direct,
    transitive,
    impactScore: (directCount + transitiveCount) / 100,
  };
}

function makeGoalInput(overrides: Partial<GoalInput> = {}): GoalInput {
  return {
    goal: 'Add a new button component',
    activeFiles: ['src/components/Button.tsx'],
    projectId: 'test-project',
    ...overrides,
  };
}

function makeTaskContext(overrides: Partial<TaskContext> = {}): TaskContext {
  return {
    goal: 'Test task',
    relevantFiles: ['src/index.ts'],
    blastRadius: 1,
    complexity: 'simple',
    risk: 'low',
    isAmbiguous: false,
    signals: {},
    ...overrides,
  };
}

function makeStrategyOutput(overrides: Partial<StrategyOutput> = {}): StrategyOutput {
  return {
    strategyId: 'direct',
    result: JSON.stringify({ type: 'direct-execution', goal: 'test' }),
    confidence: 0.85,
    tokensUsed: 100,
    durationMs: 10,
    artifacts: { strategy: 'direct' },
    ...overrides,
  };
}

/** Create a stub strategy for mock registry. */
function makeStubStrategy(
  id: string,
  activationScore: number,
  reason: string,
  outputOverrides: Partial<StrategyOutput> = {},
): ReasoningStrategy {
  return {
    id,
    name: `Strategy ${id}`,
    version: '1.0.0',
    description: `Stub strategy ${id}`,
    shouldActivate: () => ({ score: activationScore, reason }),
    execute: async (_input: StrategyInput): Promise<StrategyOutput> => ({
      strategyId: id,
      result: JSON.stringify({ type: id, goal: _input.context.goal }),
      confidence: activationScore,
      tokensUsed: 50,
      durationMs: 5,
      artifacts: { strategy: id },
      ...outputOverrides,
    }),
  };
}

/** Create a mock GraphQuery with canned responses. */
function mockGraphQuery(options: {
  contextFileCount?: number;
  blastDirect?: number;
  blastTransitive?: number;
} = {}): GraphQuery {
  const { contextFileCount = 2, blastDirect = 1, blastTransitive = 0 } = options;

  const contextResult = makeContextResult(contextFileCount);
  const blastResult = makeBlastRadius(blastDirect, blastTransitive);
  const relatedFiles = [makeFileNode('src/related.ts', 'related-1')];

  return {
    getContext: () => contextResult,
    getBlastRadius: () => blastResult,
    getRelatedFiles: () => relatedFiles,
    getStats: () => ({
      projectId: 'test-project',
      totalNodes: 10,
      totalEdges: 8,
      fileCount: 5,
      moduleCount: 2,
      layer2Count: 3,
      lastBuiltAt: 0,
      lastUpdatedAt: Date.now(),
      coverage: 100,
    }),
    findPath: () => [],
  } as unknown as GraphQuery;
}

/** Create a mock StrategyRegistry pre-loaded with direct + advisor + self-refine. */
function mockStrategyRegistry(): StrategyRegistry {
  const registry = new StrategyRegistry();

  // Direct: high score for simple, low for complex
  registry.register({
    id: 'direct',
    name: 'Direct Execution',
    version: '1.0.0',
    description: 'Direct execution strategy',
    shouldActivate: (ctx: TaskContext) => {
      if (ctx.complexity === 'simple' && ctx.risk === 'low') {
        return { score: 0.9, reason: 'Simple/low — direct path' };
      }
      return { score: 0.2, reason: 'Fallback score' };
    },
    execute: async (input: StrategyInput): Promise<StrategyOutput> => ({
      strategyId: 'direct',
      result: JSON.stringify({ type: 'direct-execution', goal: input.context.goal }),
      confidence: 0.85,
      tokensUsed: 50,
      durationMs: 5,
      artifacts: { strategy: 'direct' },
    }),
  });

  // Advisor: high score for complex/high-risk
  registry.register({
    id: 'advisor',
    name: 'Advisor Escalation',
    version: '1.0.0',
    description: 'Advisor strategy',
    shouldActivate: (ctx: TaskContext) => {
      if (ctx.risk === 'high' || ctx.risk === 'critical') {
        return { score: 0.85, reason: 'High risk — advisor required' };
      }
      if (ctx.complexity === 'complex' || ctx.complexity === 'critical') {
        return { score: 0.8, reason: 'Complex task — advisor needed' };
      }
      return { score: 0.1, reason: 'Not needed' };
    },
    execute: async (input: StrategyInput): Promise<StrategyOutput> => ({
      strategyId: 'advisor',
      result: JSON.stringify({ type: 'advisor-escalation', goal: input.context.goal }),
      confidence: 0.5,
      tokensUsed: 200,
      durationMs: 20,
      artifacts: { strategy: 'advisor' },
    }),
  });

  // Self-refine: activates with previous outputs
  registry.register({
    id: 'self-refine',
    name: 'Self-Refine',
    version: '1.0.0',
    description: 'Self-refine strategy',
    shouldActivate: (ctx: TaskContext) => {
      const hasPrev = (ctx.signals?.hasPreviousOutputs as boolean) ?? false;
      const prevConf = (ctx.signals?.previousConfidence as number) ?? 0;
      if (hasPrev && prevConf > 0.5 && prevConf < 0.85) {
        return { score: 0.8, reason: 'Refinement opportunity' };
      }
      return { score: 0.1, reason: 'No refinement needed' };
    },
    execute: async (input: StrategyInput): Promise<StrategyOutput> => {
      const prev = input.previousOutputs?.[input.previousOutputs.length - 1];
      const prevConfidence = prev?.confidence ?? 0;
      const improved = Math.min(0.95, prevConfidence + 0.15);
      return {
        strategyId: 'self-refine',
        result: JSON.stringify({ type: 'self-refine', goal: input.context.goal }),
        confidence: improved,
        tokensUsed: 100,
        durationMs: 10,
        artifacts: { strategy: 'self-refine', improved },
      };
    },
  });

  return registry;
}

// ---------------------------------------------------------------------------
// TaskAssessor
// ---------------------------------------------------------------------------

describe('TaskAssessor', () => {
  const assessor = new TaskAssessor();

  describe('complexity assessment', () => {
    it('should assess simple for 1-2 files', () => {
      const ctx = makeContextResult(2);
      const blast = makeBlastRadius(1, 0);
      const result = assessor.assess(makeGoalInput(), ctx, blast);
      expect(result.complexity).toBe('simple');
    });

    it('should assess moderate for 3-8 files', () => {
      const ctx = makeContextResult(5);
      const blast = makeBlastRadius(1, 0);
      const result = assessor.assess(makeGoalInput(), ctx, blast);
      expect(result.complexity).toBe('moderate');
    });

    it('should assess complex for 9-20 files', () => {
      const ctx = makeContextResult(15);
      const blast = makeBlastRadius(1, 0);
      const result = assessor.assess(makeGoalInput(), ctx, blast);
      expect(result.complexity).toBe('complex');
    });

    it('should assess critical for 20+ files', () => {
      const ctx = makeContextResult(30);
      const blast = makeBlastRadius(1, 0);
      const result = assessor.assess(makeGoalInput(), ctx, blast);
      expect(result.complexity).toBe('critical');
    });
  });

  describe('risk assessment', () => {
    it('should assess low risk for blast radius 0-3', () => {
      const ctx = makeContextResult(1);
      const blast = makeBlastRadius(2, 0);
      const result = assessor.assess(makeGoalInput(), ctx, blast);
      expect(result.risk).toBe('low');
    });

    it('should assess medium risk for blast radius 4-10', () => {
      const ctx = makeContextResult(1);
      const blast = makeBlastRadius(3, 4);
      const result = assessor.assess(makeGoalInput(), ctx, blast);
      expect(result.risk).toBe('medium');
    });

    it('should assess high risk for blast radius 11-25', () => {
      const ctx = makeContextResult(1);
      const blast = makeBlastRadius(8, 7);
      const result = assessor.assess(makeGoalInput(), ctx, blast);
      expect(result.risk).toBe('high');
    });

    it('should assess critical risk for blast radius 25+', () => {
      const ctx = makeContextResult(1);
      const blast = makeBlastRadius(15, 15);
      const result = assessor.assess(makeGoalInput(), ctx, blast);
      expect(result.risk).toBe('critical');
    });
  });

  describe('ambiguity assessment', () => {
    it('should detect ambiguity from hints', () => {
      const ctx = makeContextResult(1);
      const blast = makeBlastRadius(0, 0);
      const input = makeGoalInput({ hints: { isAmbiguous: true } });
      const result = assessor.assess(input, ctx, blast);
      expect(result.isAmbiguous).toBe(true);
    });

    it('should detect ambiguity from question marks', () => {
      const ctx = makeContextResult(1);
      const blast = makeBlastRadius(0, 0);
      const input = makeGoalInput({ goal: 'Should we refactor this?' });
      const result = assessor.assess(input, ctx, blast);
      expect(result.isAmbiguous).toBe(true);
    });

    it('should detect ambiguity from words like "should"', () => {
      const ctx = makeContextResult(1);
      const blast = makeBlastRadius(0, 0);
      const input = makeGoalInput({ goal: 'We should refactor the auth module' });
      const result = assessor.assess(input, ctx, blast);
      expect(result.isAmbiguous).toBe(true);
    });

    it('should detect ambiguity from words like "maybe"', () => {
      const ctx = makeContextResult(1);
      const blast = makeBlastRadius(0, 0);
      const input = makeGoalInput({ goal: 'Maybe we need a new service layer' });
      const result = assessor.assess(input, ctx, blast);
      expect(result.isAmbiguous).toBe(true);
    });

    it('should detect ambiguity from "not sure"', () => {
      const ctx = makeContextResult(1);
      const blast = makeBlastRadius(0, 0);
      const input = makeGoalInput({ goal: 'Not sure if we need caching here' });
      const result = assessor.assess(input, ctx, blast);
      expect(result.isAmbiguous).toBe(true);
    });

    it('should detect ambiguity from "consider"', () => {
      const ctx = makeContextResult(1);
      const blast = makeBlastRadius(0, 0);
      const input = makeGoalInput({ goal: 'Consider adding error boundaries' });
      const result = assessor.assess(input, ctx, blast);
      expect(result.isAmbiguous).toBe(true);
    });

    it('should not flag clear goals as ambiguous', () => {
      const ctx = makeContextResult(1);
      const blast = makeBlastRadius(0, 0);
      const input = makeGoalInput({ goal: 'Add a new button component' });
      const result = assessor.assess(input, ctx, blast);
      expect(result.isAmbiguous).toBe(false);
    });
  });

  describe('signals', () => {
    it('should include file count, edge count, blast radius, and active files count', () => {
      const ctx = makeContextResult(5);
      const blast = makeBlastRadius(3, 2);
      const input = makeGoalInput({ activeFiles: ['a.ts', 'b.ts'] });
      const result = assessor.assess(input, ctx, blast);

      expect(result.signals.fileCount).toBe(5);
      expect(result.signals.edgeCount).toBe(4); // 5 files -> 4 edges
      expect(result.signals.blastRadiusTotal).toBe(5);
      expect(result.signals.activeFilesCount).toBe(2);
    });

    it('should default activeFilesCount to 0 when no active files', () => {
      const ctx = makeContextResult(1);
      const blast = makeBlastRadius(0, 0);
      const input = makeGoalInput({ activeFiles: undefined });
      const result = assessor.assess(input, ctx, blast);
      expect(result.signals.activeFilesCount).toBe(0);
    });
  });

  describe('relevant files', () => {
    it('should populate relevantFiles from graph context file paths', () => {
      const ctx = makeContextResult(3);
      const blast = makeBlastRadius(0, 0);
      const result = assessor.assess(makeGoalInput(), ctx, blast);
      expect(result.relevantFiles).toEqual([
        'src/file0.ts',
        'src/file1.ts',
        'src/file2.ts',
      ]);
    });
  });
});

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

describe('Evaluator', () => {
  const evaluator = new Evaluator();

  describe('recommendation: accept', () => {
    it('should recommend accept when all checks pass and confidence > 0.8', () => {
      const output = makeStrategyOutput({ confidence: 0.85, tokensUsed: 100 });
      const ctx = makeTaskContext({ complexity: 'simple' });
      const result = evaluator.evaluate(output, ctx);

      expect(result.recommendation).toBe('accept');
      expect(result.confidence).toBe(0.85);
      expect(result.checks.every((c) => c.passed)).toBe(true);
    });
  });

  describe('recommendation: refine', () => {
    it('should recommend refine when confidence is between 0.5 and 0.8', () => {
      const output = makeStrategyOutput({ confidence: 0.65, tokensUsed: 100 });
      const ctx = makeTaskContext({ complexity: 'simple' });
      const result = evaluator.evaluate(output, ctx);

      expect(result.recommendation).toBe('refine');
    });

    it('should recommend refine when confidence is exactly 0.5', () => {
      const output = makeStrategyOutput({ confidence: 0.5, tokensUsed: 100 });
      const ctx = makeTaskContext({ complexity: 'simple' });
      const result = evaluator.evaluate(output, ctx);

      expect(result.recommendation).toBe('refine');
    });

    it('should recommend refine when confidence is exactly 0.8', () => {
      const output = makeStrategyOutput({ confidence: 0.8, tokensUsed: 100 });
      const ctx = makeTaskContext({ complexity: 'simple' });
      const result = evaluator.evaluate(output, ctx);

      expect(result.recommendation).toBe('refine');
    });
  });

  describe('recommendation: escalate', () => {
    it('should recommend escalate when confidence < 0.5', () => {
      const output = makeStrategyOutput({ confidence: 0.3, tokensUsed: 100 });
      const ctx = makeTaskContext({ complexity: 'simple' });
      const result = evaluator.evaluate(output, ctx);

      expect(result.recommendation).toBe('escalate');
    });

    it('should recommend escalate when result is empty', () => {
      const output = makeStrategyOutput({ confidence: 0.9, result: '', tokensUsed: 0 });
      const ctx = makeTaskContext({ complexity: 'simple' });
      const result = evaluator.evaluate(output, ctx);

      expect(result.recommendation).toBe('escalate');
      const completeness = result.checks.find((c) => c.name === 'completeness');
      expect(completeness?.passed).toBe(false);
    });

    it('should recommend escalate when result is whitespace only', () => {
      const output = makeStrategyOutput({ confidence: 0.9, result: '   ', tokensUsed: 0 });
      const ctx = makeTaskContext({ complexity: 'simple' });
      const result = evaluator.evaluate(output, ctx);

      expect(result.recommendation).toBe('escalate');
    });
  });

  describe('checks', () => {
    it('should include confidence check', () => {
      const output = makeStrategyOutput({ confidence: 0.85 });
      const ctx = makeTaskContext();
      const result = evaluator.evaluate(output, ctx);

      const check = result.checks.find((c) => c.name === 'confidence');
      expect(check).toBeDefined();
      expect(check!.passed).toBe(true);
    });

    it('should fail confidence check when below 0.5', () => {
      const output = makeStrategyOutput({ confidence: 0.3 });
      const ctx = makeTaskContext();
      const result = evaluator.evaluate(output, ctx);

      const check = result.checks.find((c) => c.name === 'confidence');
      expect(check!.passed).toBe(false);
    });

    it('should include token efficiency check', () => {
      const output = makeStrategyOutput({ tokensUsed: 5000 });
      const ctx = makeTaskContext({ complexity: 'simple' });
      const result = evaluator.evaluate(output, ctx);

      const check = result.checks.find((c) => c.name === 'tokenEfficiency');
      expect(check).toBeDefined();
      expect(check!.passed).toBe(true);
    });

    it('should fail token efficiency check when over limit', () => {
      const output = makeStrategyOutput({ tokensUsed: 15_000 });
      const ctx = makeTaskContext({ complexity: 'simple' });
      const result = evaluator.evaluate(output, ctx);

      const check = result.checks.find((c) => c.name === 'tokenEfficiency');
      expect(check!.passed).toBe(false);
    });

    it('should use correct token limits per complexity', () => {
      // Complex tasks allow up to 50k tokens
      const output = makeStrategyOutput({ tokensUsed: 40_000 });
      const ctx = makeTaskContext({ complexity: 'complex' });
      const result = evaluator.evaluate(output, ctx);

      const check = result.checks.find((c) => c.name === 'tokenEfficiency');
      expect(check!.passed).toBe(true);
    });

    it('should include context coverage check', () => {
      const output = makeStrategyOutput();
      const ctx = makeTaskContext();
      const result = evaluator.evaluate(output, ctx);

      const check = result.checks.find((c) => c.name === 'contextCoverage');
      expect(check).toBeDefined();
      expect(check!.passed).toBe(true);
    });

    it('should fail context coverage for very short result', () => {
      const output = makeStrategyOutput({ result: 'short' });
      const ctx = makeTaskContext();
      const result = evaluator.evaluate(output, ctx);

      const check = result.checks.find((c) => c.name === 'contextCoverage');
      expect(check!.passed).toBe(false);
    });

    it('should include completeness check', () => {
      const output = makeStrategyOutput();
      const ctx = makeTaskContext();
      const result = evaluator.evaluate(output, ctx);

      const check = result.checks.find((c) => c.name === 'completeness');
      expect(check).toBeDefined();
      expect(check!.passed).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

describe('Orchestrator', () => {
  let orchestrator: Orchestrator;
  let registry: StrategyRegistry;
  let eventBus: EventBus;

  describe('process — simple goal', () => {
    beforeEach(() => {
      registry = mockStrategyRegistry();
      eventBus = new EventBus();
      // Simple context: 2 files, low blast radius -> direct strategy
      const gq = mockGraphQuery({ contextFileCount: 2, blastDirect: 1, blastTransitive: 0 });
      orchestrator = new Orchestrator(gq, registry, eventBus);
    });

    it('should select direct strategy for simple goal', async () => {
      const input = makeGoalInput({ goal: 'Add a new button component' });
      const result = await orchestrator.process(input);

      expect(result.strategy.id).toBe('direct');
      expect(result.strategy.name).toBe('Direct Execution');
      expect(result.strategy.score).toBeGreaterThan(0);
    });

    it('should return complete OrchestratorResult with all fields', async () => {
      const input = makeGoalInput();
      const result = await orchestrator.process(input);

      // Strategy info
      expect(result.strategy).toBeDefined();
      expect(result.strategy.id).toBeDefined();
      expect(result.strategy.name).toBeDefined();
      expect(result.strategy.reason).toBeDefined();
      expect(result.strategy.score).toBeGreaterThanOrEqual(0);

      // Alternatives
      expect(result.alternatives).toBeInstanceOf(Array);
      expect(result.alternatives.length).toBeGreaterThan(0);

      // Context
      expect(result.context).toBeDefined();
      expect(result.context.files).toBeInstanceOf(Array);
      expect(result.context.blastRadius).toBeGreaterThanOrEqual(0);
      expect(result.context.relatedFiles).toBeInstanceOf(Array);

      // TaskContext
      expect(result.taskContext).toBeDefined();
      expect(result.taskContext.goal).toBe(input.goal);
      expect(result.taskContext.complexity).toBeDefined();
      expect(result.taskContext.risk).toBeDefined();

      // Output
      expect(result.output).toBeDefined();
      expect(result.output.strategyId).toBeDefined();
      expect(result.output.result).toBeTruthy();

      // Duration
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should populate context with graph data', async () => {
      const input = makeGoalInput();
      const result = await orchestrator.process(input);

      expect(result.context.files.length).toBe(2);
      expect(result.context.files[0].path).toContain('src/');
      expect(result.context.relatedFiles).toContain('src/related.ts');
    });

    it('should include all strategies as alternatives', async () => {
      const input = makeGoalInput();
      const result = await orchestrator.process(input);

      const ids = result.alternatives.map((a) => a.id);
      expect(ids).toContain('direct');
      expect(ids).toContain('advisor');
      expect(ids).toContain('self-refine');
    });
  });

  describe('process — complex goal', () => {
    beforeEach(() => {
      registry = mockStrategyRegistry();
      eventBus = new EventBus();
      // Complex context: 15 files, high blast radius -> advisor strategy
      const gq = mockGraphQuery({ contextFileCount: 15, blastDirect: 8, blastTransitive: 7 });
      orchestrator = new Orchestrator(gq, registry, eventBus);
    });

    it('should select advisor strategy for complex high-risk goal', async () => {
      const input = makeGoalInput({ goal: 'Refactor the entire auth system' });
      const result = await orchestrator.process(input);

      expect(result.strategy.id).toBe('advisor');
      expect(result.taskContext.complexity).toBe('complex');
      expect(result.taskContext.risk).toBe('high');
    });
  });

  describe('process — no active files', () => {
    beforeEach(() => {
      registry = mockStrategyRegistry();
      eventBus = new EventBus();
      const gq = mockGraphQuery({ contextFileCount: 0 });
      orchestrator = new Orchestrator(gq, registry, eventBus);
    });

    it('should handle missing active files gracefully', async () => {
      const input = makeGoalInput({ activeFiles: undefined });
      const result = await orchestrator.process(input);

      expect(result).toBeDefined();
      expect(result.context.files).toEqual([]);
      expect(result.context.blastRadius).toBe(0);
    });
  });

  describe('auto-refine', () => {
    it('should trigger auto-refine when evaluator recommends refine', async () => {
      const registry = new StrategyRegistry();
      const eventBus = new EventBus();

      // Direct strategy that returns confidence 0.65 -> triggers 'refine'
      registry.register({
        id: 'direct',
        name: 'Direct Execution',
        version: '1.0.0',
        description: 'Direct',
        shouldActivate: () => ({ score: 0.9, reason: 'default' }),
        execute: async (input: StrategyInput): Promise<StrategyOutput> => ({
          strategyId: 'direct',
          result: JSON.stringify({ type: 'direct', goal: input.context.goal }),
          confidence: 0.65,
          tokensUsed: 50,
          durationMs: 5,
          artifacts: {},
        }),
      });

      // Self-refine that boosts confidence
      registry.register({
        id: 'self-refine',
        name: 'Self-Refine',
        version: '1.0.0',
        description: 'Refine',
        shouldActivate: () => ({ score: 0.1, reason: 'n/a' }),
        execute: async (input: StrategyInput): Promise<StrategyOutput> => {
          const prev = input.previousOutputs?.[input.previousOutputs.length - 1];
          return {
            strategyId: 'self-refine',
            result: JSON.stringify({ type: 'self-refine', refined: true }),
            confidence: Math.min(0.95, (prev?.confidence ?? 0) + 0.2),
            tokensUsed: 100,
            durationMs: 10,
            artifacts: { refined: true },
          };
        },
      });

      const gq = mockGraphQuery({ contextFileCount: 2, blastDirect: 1 });
      const orchestrator = new Orchestrator(gq, registry, eventBus);

      const result = await orchestrator.process(makeGoalInput());

      // After auto-refine, the output should be from self-refine with improved confidence
      expect(result.output.strategyId).toBe('self-refine');
      expect(result.output.confidence).toBeCloseTo(0.85);
      expect(result.output.artifacts.refined).toBe(true);
    });

    it('should NOT auto-refine when self-refine is not registered', async () => {
      const registry = new StrategyRegistry();
      const eventBus = new EventBus();

      // Only direct, returning medium confidence
      registry.register({
        id: 'direct',
        name: 'Direct',
        version: '1.0.0',
        description: 'Direct',
        shouldActivate: () => ({ score: 0.9, reason: 'default' }),
        execute: async (): Promise<StrategyOutput> => ({
          strategyId: 'direct',
          result: JSON.stringify({ type: 'direct' }),
          confidence: 0.65,
          tokensUsed: 50,
          durationMs: 5,
          artifacts: {},
        }),
      });

      const gq = mockGraphQuery({ contextFileCount: 2 });
      const orchestrator = new Orchestrator(gq, registry, eventBus);

      const result = await orchestrator.process(makeGoalInput());

      // Should still be direct (no self-refine available)
      expect(result.output.strategyId).toBe('direct');
      expect(result.output.confidence).toBe(0.65);
    });
  });

  describe('processWithRetry', () => {
    it('should return immediately when evaluation is not escalate', async () => {
      registry = mockStrategyRegistry();
      eventBus = new EventBus();
      const gq = mockGraphQuery({ contextFileCount: 2 });
      orchestrator = new Orchestrator(gq, registry, eventBus);

      const result = await orchestrator.processWithRetry(makeGoalInput());

      // Direct strategy returns confidence 0.85 -> 'accept', no retry needed
      expect(result.strategy.id).toBe('direct');
      expect(result.output.confidence).toBe(0.85);
    });

    it('should retry with escalated hints when evaluation recommends escalate', async () => {
      let callCount = 0;
      const registry = new StrategyRegistry();
      const eventBus = new EventBus();

      // Strategy that returns low confidence initially, then better on retry
      registry.register({
        id: 'direct',
        name: 'Direct',
        version: '1.0.0',
        description: 'Direct',
        shouldActivate: () => ({ score: 0.9, reason: 'default' }),
        execute: async (): Promise<StrategyOutput> => {
          callCount++;
          return {
            strategyId: 'direct',
            result: JSON.stringify({ type: 'direct', attempt: callCount }),
            confidence: callCount === 1 ? 0.3 : 0.85,
            tokensUsed: 50,
            durationMs: 5,
            artifacts: { attempt: callCount },
          };
        },
      });

      // Advisor that also returns escalate-worthy confidence on first call
      registry.register({
        id: 'advisor',
        name: 'Advisor',
        version: '1.0.0',
        description: 'Advisor',
        shouldActivate: (ctx: TaskContext) => {
          if (ctx.complexity === 'complex' || ctx.complexity === 'critical') {
            return { score: 0.85, reason: 'Complex' };
          }
          return { score: 0.1, reason: 'Not needed' };
        },
        execute: async (): Promise<StrategyOutput> => ({
          strategyId: 'advisor',
          result: JSON.stringify({ type: 'advisor' }),
          confidence: 0.85,
          tokensUsed: 100,
          durationMs: 10,
          artifacts: {},
        }),
      });

      const gq = mockGraphQuery({ contextFileCount: 2 });
      const orchestrator = new Orchestrator(gq, registry, eventBus);

      const result = await orchestrator.processWithRetry(makeGoalInput(), 2);

      // Should have retried at least once
      expect(callCount).toBeGreaterThanOrEqual(1);
      expect(result).toBeDefined();
      expect(result.output.confidence).toBeGreaterThanOrEqual(0.5);
    });

    it('should stop after maxRetries even if still escalating', async () => {
      const registry = new StrategyRegistry();
      const eventBus = new EventBus();
      let callCount = 0;

      // Always returns low confidence -> always escalate
      registry.register({
        id: 'direct',
        name: 'Direct',
        version: '1.0.0',
        description: 'Direct',
        shouldActivate: () => ({ score: 0.9, reason: 'default' }),
        execute: async (): Promise<StrategyOutput> => {
          callCount++;
          return {
            strategyId: 'direct',
            result: JSON.stringify({ type: 'direct' }),
            confidence: 0.2,
            tokensUsed: 50,
            durationMs: 5,
            artifacts: {},
          };
        },
      });

      const gq = mockGraphQuery({ contextFileCount: 2 });
      const orchestrator = new Orchestrator(gq, registry, eventBus);

      const result = await orchestrator.processWithRetry(makeGoalInput(), 3);

      // 1 initial + up to 3 retries = 4 max calls
      expect(callCount).toBeLessThanOrEqual(4);
      expect(result).toBeDefined();
    });
  });
});
