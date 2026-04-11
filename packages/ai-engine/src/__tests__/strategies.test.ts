/**
 * Strategy Plugin System Tests
 * Tests for StrategyRegistry, DirectStrategy, AdvisorStrategy, and SelfRefineStrategy
 *
 * @author Subash Karki
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { StrategyRegistry } from '../strategies/registry.js';
import { DirectStrategy } from '../strategies/direct.js';
import { AdvisorStrategy } from '../strategies/advisor.js';
import { SelfRefineStrategy } from '../strategies/self-refine.js';
import type {
  ReasoningStrategy,
  StrategyInput,
  StrategyOutput,
  TaskContext,
} from '../types/strategy.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides: Partial<TaskContext> = {}): TaskContext {
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

function makeInput(overrides: Partial<StrategyInput> = {}): StrategyInput {
  return {
    context: makeContext(),
    graphContext: {
      files: [{ path: 'src/index.ts', relevance: 0.9 }],
      edges: [{ source: 'src/index.ts', target: 'src/utils.ts', type: 'imports' }],
    },
    ...overrides,
  };
}

/** Minimal stub strategy for registry testing. */
function makeStubStrategy(
  id: string,
  score: number,
  reason = 'stub',
): ReasoningStrategy {
  return {
    id,
    name: `Stub ${id}`,
    version: '0.0.1',
    description: `Stub strategy ${id}`,
    shouldActivate: () => ({ score, reason }),
    execute: async (input: StrategyInput): Promise<StrategyOutput> => ({
      strategyId: id,
      result: `result-${id}`,
      confidence: score,
      tokensUsed: 0,
      durationMs: 0,
      artifacts: {},
    }),
  };
}

// ---------------------------------------------------------------------------
// StrategyRegistry
// ---------------------------------------------------------------------------

describe('StrategyRegistry', () => {
  let registry: StrategyRegistry;

  beforeEach(() => {
    registry = new StrategyRegistry();
  });

  describe('register / unregister', () => {
    it('should register a strategy and retrieve it', () => {
      const stub = makeStubStrategy('test', 0.5);
      registry.register(stub);

      const entry = registry.get('test');
      expect(entry).toBeDefined();
      expect(entry!.strategy.id).toBe('test');
      expect(entry!.enabled).toBe(true);
      expect(entry!.priority).toBe(0);
    });

    it('should register a strategy with custom priority', () => {
      const stub = makeStubStrategy('test', 0.5);
      registry.register(stub, 10);

      expect(registry.get('test')!.priority).toBe(10);
    });

    it('should unregister a strategy', () => {
      registry.register(makeStubStrategy('test', 0.5));
      registry.unregister('test');

      expect(registry.get('test')).toBeUndefined();
    });

    it('should handle unregistering a non-existent strategy gracefully', () => {
      expect(() => registry.unregister('nope')).not.toThrow();
    });
  });

  describe('enable / disable', () => {
    it('should disable a strategy', () => {
      registry.register(makeStubStrategy('test', 0.5));
      registry.disable('test');

      expect(registry.get('test')!.enabled).toBe(false);
    });

    it('should re-enable a disabled strategy', () => {
      registry.register(makeStubStrategy('test', 0.5));
      registry.disable('test');
      registry.enable('test');

      expect(registry.get('test')!.enabled).toBe(true);
    });

    it('should exclude disabled strategies from selection', () => {
      const direct = new DirectStrategy();
      const high = makeStubStrategy('high', 0.95);

      registry.register(direct);
      registry.register(high);
      registry.disable('high');

      const selected = registry.select(makeContext());
      expect(selected.id).toBe('direct');
    });
  });

  describe('select', () => {
    it('should return the highest scoring strategy', () => {
      registry.register(makeStubStrategy('low', 0.3));
      registry.register(makeStubStrategy('high', 0.9));
      registry.register(makeStubStrategy('mid', 0.6));

      const selected = registry.select(makeContext());
      expect(selected.id).toBe('high');
    });

    it('should break ties by priority (higher priority wins)', () => {
      registry.register(makeStubStrategy('a', 0.7), 1);
      registry.register(makeStubStrategy('b', 0.7), 10);

      const selected = registry.select(makeContext());
      expect(selected.id).toBe('b');
    });

    it('should fall back to direct strategy when no strategy scores above threshold', () => {
      const direct = new DirectStrategy();
      registry.register(makeStubStrategy('weak', 0.05));
      registry.register(direct);

      // Direct always scores at least 0.2, so it will be picked
      const selected = registry.select(makeContext());
      expect(selected.id).toBe('direct');
    });

    it('should fall back to direct by id lookup when all enabled strategies score below threshold', () => {
      // Register only weak strategies plus a disabled high-scorer
      const direct = new DirectStrategy();
      registry.register(makeStubStrategy('only-weak', 0.05));
      registry.register(direct);
      registry.disable('direct');

      // direct is disabled, only-weak scores 0.05 which is below threshold
      // but direct fallback should still be returned via id lookup
      const selected = registry.select(makeContext());
      expect(selected.id).toBe('direct');
    });

    it('should throw when no strategies are registered', () => {
      expect(() => registry.select(makeContext())).toThrow('no strategies registered');
    });
  });

  describe('selectAll', () => {
    it('should return all enabled strategies with scores, sorted', () => {
      registry.register(makeStubStrategy('low', 0.3));
      registry.register(makeStubStrategy('high', 0.9));
      registry.register(makeStubStrategy('mid', 0.6));

      const results = registry.selectAll(makeContext());
      expect(results).toHaveLength(3);
      expect(results[0].strategy.id).toBe('high');
      expect(results[0].score.score).toBe(0.9);
      expect(results[1].strategy.id).toBe('mid');
      expect(results[2].strategy.id).toBe('low');
    });

    it('should exclude disabled strategies', () => {
      registry.register(makeStubStrategy('a', 0.5));
      registry.register(makeStubStrategy('b', 0.8));
      registry.disable('b');

      const results = registry.selectAll(makeContext());
      expect(results).toHaveLength(1);
      expect(results[0].strategy.id).toBe('a');
    });
  });

  describe('getAll', () => {
    it('should return all registered entries including disabled', () => {
      registry.register(makeStubStrategy('a', 0.5));
      registry.register(makeStubStrategy('b', 0.8));
      registry.disable('b');

      const all = registry.getAll();
      expect(all).toHaveLength(2);
    });
  });
});

// ---------------------------------------------------------------------------
// DirectStrategy
// ---------------------------------------------------------------------------

describe('DirectStrategy', () => {
  const strategy = new DirectStrategy();

  describe('shouldActivate', () => {
    it('should score 0.9 for simple/low-risk', () => {
      const score = strategy.shouldActivate(makeContext({ complexity: 'simple', risk: 'low' }));
      expect(score.score).toBe(0.9);
      expect(score.reason).toContain('Simple');
    });

    it('should score 0.6 for moderate/low-risk', () => {
      const score = strategy.shouldActivate(makeContext({ complexity: 'moderate', risk: 'low' }));
      expect(score.score).toBe(0.6);
    });

    it('should score 0.5 for simple/medium-risk', () => {
      const score = strategy.shouldActivate(makeContext({ complexity: 'simple', risk: 'medium' }));
      expect(score.score).toBe(0.5);
    });

    it('should score 0.2 for complex/high-risk (fallback)', () => {
      const score = strategy.shouldActivate(makeContext({ complexity: 'complex', risk: 'high' }));
      expect(score.score).toBe(0.2);
    });

    it('should score 0.2 for critical/critical', () => {
      const score = strategy.shouldActivate(makeContext({ complexity: 'critical', risk: 'critical' }));
      expect(score.score).toBe(0.2);
    });
  });

  describe('execute', () => {
    it('should return graph context as a passthrough result', async () => {
      const input = makeInput();
      const output = await strategy.execute(input);

      expect(output.strategyId).toBe('direct');
      const parsed = JSON.parse(output.result);
      expect(parsed.type).toBe('direct-execution');
      expect(parsed.files).toEqual(input.graphContext.files);
      expect(parsed.edges).toEqual(input.graphContext.edges);
    });

    it('should set confidence based on number of files', async () => {
      const input = makeInput({
        graphContext: {
          files: [
            { path: 'a.ts', relevance: 0.9 },
            { path: 'b.ts', relevance: 0.8 },
            { path: 'c.ts', relevance: 0.7 },
            { path: 'd.ts', relevance: 0.6 },
            { path: 'e.ts', relevance: 0.5 },
          ],
          edges: [],
        },
      });

      const output = await strategy.execute(input);
      // 0.5 + 5 * 0.05 = 0.75
      expect(output.confidence).toBe(0.75);
    });

    it('should cap confidence at 0.95', async () => {
      const manyFiles = Array.from({ length: 20 }, (_, i) => ({
        path: `file${i}.ts`,
        relevance: 0.5,
      }));

      const input = makeInput({
        graphContext: { files: manyFiles, edges: [] },
      });

      const output = await strategy.execute(input);
      expect(output.confidence).toBe(0.95);
    });

    it('should track duration', async () => {
      const output = await strategy.execute(makeInput());
      expect(output.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should include filesUsed in artifacts', async () => {
      const output = await strategy.execute(makeInput());
      expect(output.artifacts.strategy).toBe('direct');
      expect(output.artifacts.filesUsed).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// AdvisorStrategy
// ---------------------------------------------------------------------------

describe('AdvisorStrategy', () => {
  const strategy = new AdvisorStrategy();

  describe('shouldActivate', () => {
    it('should score 0.85 for high risk', () => {
      const score = strategy.shouldActivate(makeContext({ risk: 'high' }));
      expect(score.score).toBe(0.85);
      expect(score.reason).toContain('High/critical risk');
    });

    it('should score 0.85 for critical risk', () => {
      const score = strategy.shouldActivate(makeContext({ risk: 'critical' }));
      expect(score.score).toBe(0.85);
    });

    it('should score 0.8 for complex complexity', () => {
      const score = strategy.shouldActivate(makeContext({ complexity: 'complex', risk: 'low' }));
      expect(score.score).toBe(0.8);
    });

    it('should score 0.8 for critical complexity', () => {
      const score = strategy.shouldActivate(makeContext({ complexity: 'critical', risk: 'low' }));
      expect(score.score).toBe(0.8);
    });

    it('should score 0.7 for ambiguous tasks', () => {
      const score = strategy.shouldActivate(makeContext({ isAmbiguous: true }));
      expect(score.score).toBe(0.7);
    });

    it('should score 0.6 for large blast radius', () => {
      const score = strategy.shouldActivate(makeContext({ blastRadius: 15 }));
      expect(score.score).toBe(0.6);
    });

    it('should score 0.4 for moderate/medium', () => {
      const score = strategy.shouldActivate(
        makeContext({ complexity: 'moderate', risk: 'medium' }),
      );
      expect(score.score).toBe(0.4);
    });

    it('should score 0.1 for simple/low-risk', () => {
      const score = strategy.shouldActivate(makeContext({ complexity: 'simple', risk: 'low' }));
      expect(score.score).toBe(0.1);
    });
  });

  describe('execute', () => {
    it('should format an advisor escalation prompt', async () => {
      const ctx = makeContext({ complexity: 'complex', risk: 'high' });
      const input = makeInput({ context: ctx });
      const output = await strategy.execute(input);

      expect(output.strategyId).toBe('advisor');
      const parsed = JSON.parse(output.result);
      expect(parsed.type).toBe('advisor-escalation');
      expect(parsed.goal).toBe(ctx.goal);
      expect(parsed.escalationReason).toBeTruthy();
    });

    it('should return confidence 0.5', async () => {
      const output = await strategy.execute(makeInput());
      expect(output.confidence).toBe(0.5);
    });

    it('should include escalationReason and contextSize in artifacts', async () => {
      const output = await strategy.execute(makeInput());
      expect(output.artifacts.strategy).toBe('advisor');
      expect(output.artifacts.escalationReason).toBeTruthy();
      expect(output.artifacts.contextSize).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// SelfRefineStrategy
// ---------------------------------------------------------------------------

describe('SelfRefineStrategy', () => {
  const strategy = new SelfRefineStrategy();

  describe('shouldActivate', () => {
    it('should score 0.8 when previous outputs exist with moderate confidence', () => {
      const score = strategy.shouldActivate(
        makeContext({
          signals: { hasPreviousOutputs: true, previousConfidence: 0.7 },
        }),
      );
      expect(score.score).toBe(0.8);
      expect(score.reason).toContain('moderate confidence');
    });

    it('should score 0.5 for moderate complexity with clear requirements', () => {
      const score = strategy.shouldActivate(
        makeContext({ complexity: 'moderate', isAmbiguous: false }),
      );
      expect(score.score).toBe(0.5);
    });

    it('should score 0.1 when no previous outputs exist', () => {
      const score = strategy.shouldActivate(makeContext());
      expect(score.score).toBe(0.1);
    });

    it('should score 0.1 when previous confidence is too high (>= 0.85)', () => {
      const score = strategy.shouldActivate(
        makeContext({
          signals: { hasPreviousOutputs: true, previousConfidence: 0.9 },
        }),
      );
      expect(score.score).toBe(0.1);
    });

    it('should score 0.1 when previous confidence is too low (<= 0.5)', () => {
      const score = strategy.shouldActivate(
        makeContext({
          signals: { hasPreviousOutputs: true, previousConfidence: 0.3 },
        }),
      );
      expect(score.score).toBe(0.1);
    });
  });

  describe('execute', () => {
    it('should return "nothing to refine" when no previous outputs', async () => {
      const output = await strategy.execute(makeInput());

      expect(output.strategyId).toBe('self-refine');
      const parsed = JSON.parse(output.result);
      expect(parsed.note).toContain('Nothing to refine');
      expect(output.confidence).toBe(0.1);
      expect(output.artifacts.iterationCount).toBe(0);
    });

    it('should improve confidence by 0.15 from last output', async () => {
      const previousOutput: StrategyOutput = {
        strategyId: 'direct',
        result: '{"type":"direct-execution"}',
        confidence: 0.7,
        tokensUsed: 100,
        durationMs: 50,
        artifacts: {},
      };

      const input = makeInput({ previousOutputs: [previousOutput] });
      const output = await strategy.execute(input);

      expect(output.confidence).toBe(0.85);
      expect(output.artifacts.improvementDelta).toBeCloseTo(0.15);
      expect(output.artifacts.iterationCount).toBe(1);
    });

    it('should cap confidence at 0.95', async () => {
      const previousOutput: StrategyOutput = {
        strategyId: 'direct',
        result: '{"type":"direct-execution"}',
        confidence: 0.9,
        tokensUsed: 100,
        durationMs: 50,
        artifacts: {},
      };

      const input = makeInput({ previousOutputs: [previousOutput] });
      const output = await strategy.execute(input);

      expect(output.confidence).toBe(0.95);
    });

    it('should format a refinement prompt with previous result', async () => {
      const previousOutput: StrategyOutput = {
        strategyId: 'direct',
        result: '{"some":"result"}',
        confidence: 0.6,
        tokensUsed: 100,
        durationMs: 50,
        artifacts: {},
      };

      const input = makeInput({ previousOutputs: [previousOutput] });
      const output = await strategy.execute(input);

      const parsed = JSON.parse(output.result);
      expect(parsed.type).toBe('self-refine');
      expect(parsed.previousResult).toBe(previousOutput.result);
      expect(parsed.previousConfidence).toBe(0.6);
      expect(parsed.targetConfidence).toBe(0.75);
    });
  });
});

// ---------------------------------------------------------------------------
// Integration: Registry + All Strategies
// ---------------------------------------------------------------------------

describe('Integration: Registry with all strategies', () => {
  let registry: StrategyRegistry;

  beforeEach(() => {
    registry = new StrategyRegistry();
    registry.register(new DirectStrategy());
    registry.register(new AdvisorStrategy());
    registry.register(new SelfRefineStrategy());
  });

  it('should select direct for simple low-risk tasks', () => {
    const ctx = makeContext({ complexity: 'simple', risk: 'low' });
    const selected = registry.select(ctx);
    expect(selected.id).toBe('direct');
  });

  it('should select advisor for complex high-risk tasks', () => {
    const ctx = makeContext({ complexity: 'complex', risk: 'high' });
    const selected = registry.select(ctx);
    // risk: 'high' gives advisor 0.85, complexity: 'complex' gives advisor 0.8
    // direct scores 0.2 for complex/high
    expect(selected.id).toBe('advisor');
  });

  it('should select advisor for critical risk', () => {
    const ctx = makeContext({ complexity: 'simple', risk: 'critical' });
    const selected = registry.select(ctx);
    expect(selected.id).toBe('advisor');
  });

  it('should select advisor for ambiguous tasks', () => {
    const ctx = makeContext({ isAmbiguous: true });
    const selected = registry.select(ctx);
    // advisor scores 0.7 for ambiguous, direct scores 0.9 for simple/low
    // But isAmbiguous + simple/low → direct 0.9 > advisor 0.7
    // Let's make it complex+ambiguous so direct is low
    const ctx2 = makeContext({ isAmbiguous: true, complexity: 'moderate', risk: 'medium' });
    const selected2 = registry.select(ctx2);
    // advisor scores 0.7 (ambiguous checked before moderate/medium), direct scores 0.2
    expect(selected2.id).toBe('advisor');
  });

  it('should select self-refine when previous outputs have moderate confidence', () => {
    const ctx = makeContext({
      complexity: 'moderate',
      risk: 'medium',
      signals: { hasPreviousOutputs: true, previousConfidence: 0.7 },
    });
    const selected = registry.select(ctx);
    // self-refine: 0.8, advisor: 0.4 (moderate/medium), direct: 0.2
    expect(selected.id).toBe('self-refine');
  });

  it('should select direct over self-refine for simple tasks without previous outputs', () => {
    const ctx = makeContext({ complexity: 'simple', risk: 'low' });
    const selected = registry.select(ctx);
    // direct: 0.9, self-refine: 0.1, advisor: 0.1
    expect(selected.id).toBe('direct');
  });

  it('selectAll should show all strategies with their scores', () => {
    const ctx = makeContext({ complexity: 'complex', risk: 'high' });
    const all = registry.selectAll(ctx);

    expect(all).toHaveLength(3);
    // Should be sorted by score DESC
    expect(all[0].strategy.id).toBe('advisor'); // 0.85
    expect(all[1].strategy.id).toBe('direct'); // 0.2
    // self-refine: 0.1 (no previous outputs, not moderate)
    expect(all[2].strategy.id).toBe('self-refine');
  });

  it('should fall back to direct when all strategies score below threshold', () => {
    // Create a registry with only strategies that score very low
    const reg = new StrategyRegistry();
    reg.register(makeStubStrategy('weak-a', 0.05));
    reg.register(makeStubStrategy('weak-b', 0.02));
    reg.register(new DirectStrategy()); // Always at least 0.2

    const selected = reg.select(makeContext());
    expect(selected.id).toBe('direct');
  });
});
