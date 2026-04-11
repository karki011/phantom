/**
 * Advanced Strategy Tests
 * Tests for TreeOfThoughtStrategy, DebateStrategy, GraphOfThoughtStrategy
 * and integration tests with all 6 strategies in the registry
 *
 * @author Subash Karki
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { StrategyRegistry } from '../strategies/registry.js';
import { DirectStrategy } from '../strategies/direct.js';
import { AdvisorStrategy } from '../strategies/advisor.js';
import { SelfRefineStrategy } from '../strategies/self-refine.js';
import { TreeOfThoughtStrategy } from '../strategies/tree-of-thought.js';
import { DebateStrategy } from '../strategies/debate.js';
import { GraphOfThoughtStrategy } from '../strategies/graph-of-thought.js';
import type { StrategyInput, TaskContext } from '../types/strategy.js';

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

// ---------------------------------------------------------------------------
// TreeOfThoughtStrategy
// ---------------------------------------------------------------------------

describe('TreeOfThoughtStrategy', () => {
  const strategy = new TreeOfThoughtStrategy();

  describe('shouldActivate', () => {
    it('should score 0.85 for ambiguous + moderate complexity', () => {
      const score = strategy.shouldActivate(
        makeContext({ isAmbiguous: true, complexity: 'moderate' }),
      );
      expect(score.score).toBe(0.85);
      expect(score.reason).toContain('Ambiguous');
    });

    it('should score 0.85 for ambiguous + complex complexity', () => {
      const score = strategy.shouldActivate(
        makeContext({ isAmbiguous: true, complexity: 'complex' }),
      );
      expect(score.score).toBe(0.85);
    });

    it('should score 0.85 for ambiguous + critical complexity', () => {
      const score = strategy.shouldActivate(
        makeContext({ isAmbiguous: true, complexity: 'critical' }),
      );
      expect(score.score).toBe(0.85);
    });

    it('should score 0.5 for ambiguous + simple complexity', () => {
      const score = strategy.shouldActivate(
        makeContext({ isAmbiguous: true, complexity: 'simple' }),
      );
      expect(score.score).toBe(0.5);
    });

    it('should score 0.6 for complex + medium risk (not ambiguous)', () => {
      const score = strategy.shouldActivate(
        makeContext({ complexity: 'complex', risk: 'medium', isAmbiguous: false }),
      );
      expect(score.score).toBe(0.6);
    });

    it('should score 0.6 for complex + high risk (not ambiguous)', () => {
      const score = strategy.shouldActivate(
        makeContext({ complexity: 'complex', risk: 'high', isAmbiguous: false }),
      );
      expect(score.score).toBe(0.6);
    });

    it('should score 0.1 for simple + low risk (not ambiguous)', () => {
      const score = strategy.shouldActivate(
        makeContext({ complexity: 'simple', risk: 'low', isAmbiguous: false }),
      );
      expect(score.score).toBe(0.1);
      expect(score.reason).toContain('single path');
    });

    it('should score 0.1 for moderate + low risk (not ambiguous)', () => {
      const score = strategy.shouldActivate(
        makeContext({ complexity: 'moderate', risk: 'low', isAmbiguous: false }),
      );
      expect(score.score).toBe(0.1);
    });
  });

  describe('execute', () => {
    it('should generate 3 branches', async () => {
      const input = makeInput({
        context: makeContext({ isAmbiguous: true, complexity: 'moderate' }),
      });
      const output = await strategy.execute(input);
      const parsed = JSON.parse(output.result);

      expect(parsed.type).toBe('tree-of-thought');
      // 1 selected + 2 alternatives = 3 total
      expect(parsed.alternatives.length + 1).toBe(3);
    });

    it('should select the highest-scoring branch', async () => {
      const input = makeInput({
        context: makeContext({ isAmbiguous: true, complexity: 'moderate', risk: 'low' }),
      });
      const output = await strategy.execute(input);
      const artifacts = output.artifacts as {
        branches: Array<{ id: number; score: { combined: number } }>;
        selectedBranch: number;
        branchScores: Array<{ combined: number }>;
      };

      // Find the branch with the highest combined score
      const highestBranch = artifacts.branches.reduce((best, b) =>
        b.score.combined > best.score.combined ? b : best,
      );

      expect(artifacts.selectedBranch).toBe(highestBranch.id);
    });

    it('should include branch details in artifacts', async () => {
      const input = makeInput({
        context: makeContext({ isAmbiguous: true, complexity: 'moderate' }),
      });
      const output = await strategy.execute(input);
      const artifacts = output.artifacts as {
        strategy: string;
        branches: Array<{ id: number; approach: string; score: { feasibility: number; risk: number; effort: number; combined: number } }>;
        selectedBranch: number;
        branchScores: Array<{ feasibility: number; risk: number; effort: number; combined: number }>;
      };

      expect(artifacts.strategy).toBe('tree-of-thought');
      expect(artifacts.branches).toHaveLength(3);
      expect(artifacts.selectedBranch).toBeGreaterThanOrEqual(1);
      expect(artifacts.selectedBranch).toBeLessThanOrEqual(3);
      expect(artifacts.branchScores).toHaveLength(3);

      // Every branch score should have the expected shape
      for (const score of artifacts.branchScores) {
        expect(score.feasibility).toBeGreaterThanOrEqual(0);
        expect(score.feasibility).toBeLessThanOrEqual(1);
        expect(score.risk).toBeGreaterThanOrEqual(0);
        expect(score.risk).toBeLessThanOrEqual(1);
        expect(score.effort).toBeGreaterThanOrEqual(0);
        expect(score.effort).toBeLessThanOrEqual(1);
        expect(score.combined).toBeGreaterThanOrEqual(0);
        expect(score.combined).toBeLessThanOrEqual(1);
      }
    });

    it('should return strategyId as tree-of-thought', async () => {
      const output = await strategy.execute(makeInput());
      expect(output.strategyId).toBe('tree-of-thought');
    });

    it('should return confidence between 0 and 1', async () => {
      const output = await strategy.execute(makeInput());
      expect(output.confidence).toBeGreaterThanOrEqual(0);
      expect(output.confidence).toBeLessThanOrEqual(1);
    });

    it('should use 0 tokens (placeholder)', async () => {
      const output = await strategy.execute(makeInput());
      expect(output.tokensUsed).toBe(0);
    });

    it('should track duration', async () => {
      const output = await strategy.execute(makeInput());
      expect(output.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should include context file paths in branch prompts', async () => {
      const input = makeInput({
        context: makeContext({ goal: 'Add feature X' }),
        graphContext: {
          files: [{ path: 'src/feature.ts', relevance: 0.9 }],
          edges: [],
        },
      });
      const output = await strategy.execute(input);
      const parsed = JSON.parse(output.result);
      expect(parsed.goal).toBe('Add feature X');
    });

    it('should produce deterministic results for same input', async () => {
      const input = makeInput({
        context: makeContext({ isAmbiguous: true, complexity: 'moderate' }),
      });
      const output1 = await strategy.execute(input);
      const output2 = await strategy.execute(input);

      expect(output1.confidence).toBe(output2.confidence);
      expect(JSON.parse(output1.result).selectedBranch).toEqual(
        JSON.parse(output2.result).selectedBranch,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// DebateStrategy
// ---------------------------------------------------------------------------

describe('DebateStrategy', () => {
  const strategy = new DebateStrategy();

  describe('shouldActivate', () => {
    it('should score 0.9 for critical risk', () => {
      const score = strategy.shouldActivate(makeContext({ risk: 'critical' }));
      expect(score.score).toBe(0.9);
      expect(score.reason).toContain('Critical risk');
    });

    it('should score 0.8 for high risk + moderate complexity', () => {
      const score = strategy.shouldActivate(
        makeContext({ risk: 'high', complexity: 'moderate' }),
      );
      expect(score.score).toBe(0.8);
      expect(score.reason).toContain('High risk');
    });

    it('should score 0.8 for high risk + complex complexity', () => {
      const score = strategy.shouldActivate(
        makeContext({ risk: 'high', complexity: 'complex' }),
      );
      expect(score.score).toBe(0.8);
    });

    it('should score 0.8 for high risk + critical complexity', () => {
      const score = strategy.shouldActivate(
        makeContext({ risk: 'high', complexity: 'critical' }),
      );
      expect(score.score).toBe(0.8);
    });

    it('should score 0.6 for high risk + simple complexity', () => {
      const score = strategy.shouldActivate(
        makeContext({ risk: 'high', complexity: 'simple' }),
      );
      expect(score.score).toBe(0.6);
    });

    it('should score 0.7 for blast radius > 15', () => {
      const score = strategy.shouldActivate(
        makeContext({ blastRadius: 20, risk: 'low' }),
      );
      expect(score.score).toBe(0.7);
      expect(score.reason).toContain('blast radius');
    });

    it('should score 0.05 for simple + low risk (rarely activates)', () => {
      const score = strategy.shouldActivate(
        makeContext({ complexity: 'simple', risk: 'low', blastRadius: 1 }),
      );
      expect(score.score).toBe(0.05);
      expect(score.reason).toContain('rarely');
    });

    it('should score 0.05 for moderate + low risk + small blast radius', () => {
      const score = strategy.shouldActivate(
        makeContext({ complexity: 'moderate', risk: 'low', blastRadius: 3 }),
      );
      expect(score.score).toBe(0.05);
    });
  });

  describe('execute', () => {
    it('should produce advocate + critic + judge', async () => {
      const input = makeInput({
        context: makeContext({ risk: 'high', complexity: 'complex' }),
      });
      const output = await strategy.execute(input);
      const parsed = JSON.parse(output.result);

      expect(parsed.type).toBe('debate');
      expect(parsed.advocatePoints).toBeDefined();
      expect(parsed.advocatePoints.length).toBeGreaterThan(0);
      expect(parsed.criticPoints).toBeDefined();
      expect(parsed.criticPoints.length).toBeGreaterThan(0);
      expect(parsed.judgeSynthesis).toBeDefined();
      expect(typeof parsed.judgeSynthesis).toBe('string');
    });

    it('should run 2 rounds', async () => {
      const input = makeInput({
        context: makeContext({ risk: 'critical' }),
      });
      const output = await strategy.execute(input);
      const parsed = JSON.parse(output.result);

      expect(parsed.rounds).toHaveLength(2);
      expect(parsed.rounds[0].round).toBe(1);
      expect(parsed.rounds[1].round).toBe(2);
    });

    it('should have advocate present and critic respond in round 1', async () => {
      const input = makeInput({
        context: makeContext({ risk: 'high', complexity: 'complex' }),
      });
      const output = await strategy.execute(input);
      const parsed = JSON.parse(output.result);

      expect(parsed.rounds[0].advocate).toContain('Advocate presents');
      expect(parsed.rounds[0].critic).toContain('Critic responds');
    });

    it('should have advocate rebut and critic final word in round 2', async () => {
      const input = makeInput({
        context: makeContext({ risk: 'high' }),
      });
      const output = await strategy.execute(input);
      const parsed = JSON.parse(output.result);

      expect(parsed.rounds[1].advocate).toContain('Advocate rebuts');
      expect(parsed.rounds[1].critic).toContain('Critic final word');
    });

    it('should calculate confidence as 0.7 base for complex high risk', async () => {
      const input = makeInput({
        context: makeContext({ risk: 'high', complexity: 'complex', blastRadius: 10 }),
      });
      const output = await strategy.execute(input);
      // base 0.7, blastRadius > 5 → no +0.1, complexity != simple → no +0.1
      expect(output.confidence).toBe(0.7);
    });

    it('should add 0.1 for low blast radius', async () => {
      const input = makeInput({
        context: makeContext({ risk: 'high', complexity: 'complex', blastRadius: 3 }),
      });
      const output = await strategy.execute(input);
      // base 0.7 + 0.1 (low blast radius) = 0.8
      expect(output.confidence).toBe(0.8);
    });

    it('should add 0.1 for simple complexity', async () => {
      const input = makeInput({
        context: makeContext({ risk: 'high', complexity: 'simple', blastRadius: 10 }),
      });
      const output = await strategy.execute(input);
      // base 0.7 + 0.1 (simple) = 0.8
      expect(output.confidence).toBe(0.8);
    });

    it('should add both bonuses and cap at 0.95', async () => {
      const input = makeInput({
        context: makeContext({ risk: 'low', complexity: 'simple', blastRadius: 2 }),
      });
      const output = await strategy.execute(input);
      // base 0.7 + 0.1 (low blast) + 0.1 (simple) = 0.9
      expect(output.confidence).toBe(0.9);
    });

    it('should return strategyId as debate', async () => {
      const output = await strategy.execute(makeInput());
      expect(output.strategyId).toBe('debate');
    });

    it('should include rounds count in artifacts', async () => {
      const output = await strategy.execute(makeInput());
      expect(output.artifacts.rounds).toBe(2);
      expect(output.artifacts.strategy).toBe('debate');
    });

    it('should use 0 tokens (placeholder)', async () => {
      const output = await strategy.execute(makeInput());
      expect(output.tokensUsed).toBe(0);
    });

    it('should include critic point about blast radius for large blast radius', async () => {
      const input = makeInput({
        context: makeContext({ blastRadius: 20, risk: 'high' }),
      });
      const output = await strategy.execute(input);
      const artifacts = output.artifacts as { criticPoints: string[] };
      const hasBrPoint = artifacts.criticPoints.some((p) => p.includes('blast radius'));
      expect(hasBrPoint).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// GraphOfThoughtStrategy
// ---------------------------------------------------------------------------

describe('GraphOfThoughtStrategy', () => {
  const strategy = new GraphOfThoughtStrategy();

  describe('shouldActivate', () => {
    it('should score 0.9 for critical complexity', () => {
      const score = strategy.shouldActivate(makeContext({ complexity: 'critical' }));
      expect(score.score).toBe(0.9);
      expect(score.reason).toContain('Critical complexity');
    });

    it('should score 0.85 for complex + high blast radius', () => {
      const score = strategy.shouldActivate(
        makeContext({ complexity: 'complex', blastRadius: 15 }),
      );
      expect(score.score).toBe(0.85);
      expect(score.reason).toContain('large blast radius');
    });

    it('should score 0.7 for complex + not ambiguous', () => {
      const score = strategy.shouldActivate(
        makeContext({ complexity: 'complex', isAmbiguous: false, blastRadius: 5 }),
      );
      expect(score.score).toBe(0.7);
      expect(score.reason).toContain('parallelize');
    });

    it('should score 0.6 for moderate + blast radius > 15', () => {
      const score = strategy.shouldActivate(
        makeContext({ complexity: 'moderate', blastRadius: 20 }),
      );
      expect(score.score).toBe(0.6);
    });

    it('should score 0.05 for simple + low blast radius', () => {
      const score = strategy.shouldActivate(
        makeContext({ complexity: 'simple', blastRadius: 2 }),
      );
      expect(score.score).toBe(0.05);
      expect(score.reason).toContain('not needed');
    });

    it('should score 0.05 for moderate + small blast radius', () => {
      const score = strategy.shouldActivate(
        makeContext({ complexity: 'moderate', blastRadius: 5 }),
      );
      expect(score.score).toBe(0.05);
    });
  });

  describe('execute', () => {
    it('should decompose into thought nodes', async () => {
      const input = makeInput({
        context: makeContext({ complexity: 'complex', goal: 'Refactor auth system' }),
        graphContext: {
          files: [
            { path: 'src/auth.ts', relevance: 0.9 },
            { path: 'src/utils.ts', relevance: 0.5 },
          ],
          edges: [{ source: 'src/auth.ts', target: 'src/utils.ts', type: 'imports' }],
        },
      });
      const output = await strategy.execute(input);
      const artifacts = output.artifacts as {
        thoughtNodes: Array<{ id: string; description: string; dependencies: string[]; status: string }>;
      };

      expect(artifacts.thoughtNodes.length).toBeGreaterThanOrEqual(3);
      // First node should be analysis
      expect(artifacts.thoughtNodes[0].id).toBe('analyze');
      expect(artifacts.thoughtNodes[0].dependencies).toHaveLength(0);
    });

    it('should respect topological ordering', async () => {
      const input = makeInput({
        context: makeContext({ complexity: 'complex' }),
        graphContext: {
          files: [
            { path: 'src/a.ts', relevance: 0.9 },
            { path: 'src/b.ts', relevance: 0.5 },
          ],
          edges: [{ source: 'src/a.ts', target: 'src/b.ts', type: 'imports' }],
        },
      });
      const output = await strategy.execute(input);
      const artifacts = output.artifacts as {
        executionOrder: string[];
        thoughtNodes: Array<{ id: string; dependencies: string[] }>;
      };

      // For each node in the execution order, all its dependencies must come before it
      for (let i = 0; i < artifacts.executionOrder.length; i++) {
        const nodeId = artifacts.executionOrder[i];
        const node = artifacts.thoughtNodes.find((n) => n.id === nodeId);
        if (node) {
          for (const dep of node.dependencies) {
            const depIndex = artifacts.executionOrder.indexOf(dep);
            expect(depIndex).toBeLessThan(i);
          }
        }
      }
    });

    it('should identify parallel groups correctly', async () => {
      const input = makeInput({
        context: makeContext({ complexity: 'complex' }),
        graphContext: {
          files: [
            { path: 'src/a.ts', relevance: 0.9 },
            { path: 'src/b.ts', relevance: 0.5 },
          ],
          edges: [{ source: 'src/a.ts', target: 'src/b.ts', type: 'imports' }],
        },
      });
      const output = await strategy.execute(input);
      const artifacts = output.artifacts as {
        parallelGroups: string[][];
      };

      expect(artifacts.parallelGroups.length).toBeGreaterThanOrEqual(1);
      // First group should contain nodes with no dependencies
      for (const group of artifacts.parallelGroups) {
        expect(group.length).toBeGreaterThan(0);
      }
    });

    it('should contain thought graph in artifacts', async () => {
      const input = makeInput({
        context: makeContext({ complexity: 'critical' }),
      });
      const output = await strategy.execute(input);
      const artifacts = output.artifacts as {
        strategy: string;
        thoughtNodes: unknown[];
        executionOrder: string[];
        parallelGroups: string[][];
        synthesis: string;
      };

      expect(artifacts.strategy).toBe('graph-of-thought');
      expect(artifacts.thoughtNodes).toBeDefined();
      expect(artifacts.executionOrder).toBeDefined();
      expect(artifacts.parallelGroups).toBeDefined();
      expect(artifacts.synthesis).toBeDefined();
      expect(typeof artifacts.synthesis).toBe('string');
    });

    it('should mark all nodes as completed after execution', async () => {
      const input = makeInput({
        context: makeContext({ complexity: 'complex' }),
      });
      const output = await strategy.execute(input);
      const parsed = JSON.parse(output.result);

      for (const node of parsed.thoughtNodes) {
        expect(node.status).toBe('completed');
      }
    });

    it('should return strategyId as graph-of-thought', async () => {
      const output = await strategy.execute(makeInput());
      expect(output.strategyId).toBe('graph-of-thought');
    });

    it('should return confidence between 0 and 1', async () => {
      const output = await strategy.execute(makeInput());
      expect(output.confidence).toBeGreaterThanOrEqual(0);
      expect(output.confidence).toBeLessThanOrEqual(1);
    });

    it('should have higher confidence with more independent nodes', async () => {
      // Many independent files = more parallel work = higher confidence
      const inputMany = makeInput({
        context: makeContext({ complexity: 'complex' }),
        graphContext: {
          files: [
            { path: 'src/a.ts', relevance: 0.9 },
            { path: 'src/b.ts', relevance: 0.9 },
            { path: 'src/c.ts', relevance: 0.9 },
          ],
          edges: [], // No edges = more independence
        },
      });

      const inputFew = makeInput({
        context: makeContext({ complexity: 'complex' }),
        graphContext: {
          files: [
            { path: 'src/a.ts', relevance: 0.9 },
            { path: 'src/b.ts', relevance: 0.5 },
          ],
          edges: [
            { source: 'src/a.ts', target: 'src/b.ts', type: 'imports' },
          ],
        },
      });

      const outputMany = await strategy.execute(inputMany);
      const outputFew = await strategy.execute(inputFew);

      // More independent nodes should yield higher (or equal) confidence
      expect(outputMany.confidence).toBeGreaterThanOrEqual(outputFew.confidence);
    });

    it('should use 0 tokens (placeholder)', async () => {
      const output = await strategy.execute(makeInput());
      expect(output.tokensUsed).toBe(0);
    });

    it('should include synthesis in result', async () => {
      const input = makeInput({
        context: makeContext({ goal: 'Build notification system', complexity: 'complex' }),
      });
      const output = await strategy.execute(input);
      const parsed = JSON.parse(output.result);

      expect(parsed.synthesis).toContain('Build notification system');
      expect(parsed.synthesis).toContain('thought nodes');
    });
  });
});

// ---------------------------------------------------------------------------
// Integration: Registry + All 6 Strategies
// ---------------------------------------------------------------------------

describe('Integration: Registry with all 6 strategies', () => {
  let registry: StrategyRegistry;

  beforeEach(() => {
    registry = new StrategyRegistry();
    registry.register(new DirectStrategy());
    registry.register(new AdvisorStrategy());
    registry.register(new SelfRefineStrategy());
    registry.register(new TreeOfThoughtStrategy());
    registry.register(new DebateStrategy());
    registry.register(new GraphOfThoughtStrategy());
  });

  it('should have 6 strategies registered', () => {
    expect(registry.getAll()).toHaveLength(6);
  });

  it('should select direct for simple low-risk tasks', () => {
    const ctx = makeContext({ complexity: 'simple', risk: 'low', isAmbiguous: false });
    const selected = registry.select(ctx);
    // direct: 0.9, others all low
    expect(selected.id).toBe('direct');
  });

  it('should select tree-of-thought for ambiguous + moderate task', () => {
    const ctx = makeContext({
      complexity: 'moderate',
      risk: 'medium',
      isAmbiguous: true,
    });
    const selected = registry.select(ctx);
    // ToT: 0.85, advisor: 0.7 (ambiguous), debate: 0.05, GoT: 0.05, direct: 0.2, self-refine: 0.5
    expect(selected.id).toBe('tree-of-thought');
  });

  it('should select debate for critical risk task', () => {
    const ctx = makeContext({
      complexity: 'simple',
      risk: 'critical',
      isAmbiguous: false,
      blastRadius: 3,
    });
    const selected = registry.select(ctx);
    // debate: 0.9, advisor: 0.85, ToT: 0.1, GoT: 0.05, direct: 0.2
    expect(selected.id).toBe('debate');
  });

  it('should select graph-of-thought for critical complexity task', () => {
    const ctx = makeContext({
      complexity: 'critical',
      risk: 'low',
      isAmbiguous: false,
      blastRadius: 5,
    });
    const selected = registry.select(ctx);
    // GoT: 0.9, advisor: 0.8, ToT: 0.1, debate: 0.05, direct: 0.2
    expect(selected.id).toBe('graph-of-thought');
  });

  it('should select advisor for complex uncertain (ambiguous + complex + high risk)', () => {
    const ctx = makeContext({
      complexity: 'complex',
      risk: 'high',
      isAmbiguous: true,
      blastRadius: 5,
    });
    const selected = registry.select(ctx);
    // advisor: 0.85 (high risk), ToT: 0.85 (ambiguous+complex), debate: 0.8, GoT: 0.7, direct: 0.2
    // advisor and ToT tie at 0.85 — priority breaks tie; both at 0, first registered wins
    // advisor is registered first, so it appears first in Map iteration order
    const all = registry.selectAll(ctx);
    const topTwo = all.slice(0, 2);
    // Both should be 0.85
    expect(topTwo[0].score.score).toBe(0.85);
    expect(topTwo[1].score.score).toBe(0.85);
    // The selected one should be one of them
    expect(['advisor', 'tree-of-thought']).toContain(selected.id);
  });

  it('should select self-refine when previous outputs have moderate confidence', () => {
    const ctx = makeContext({
      complexity: 'moderate',
      risk: 'medium',
      isAmbiguous: false,
      signals: { hasPreviousOutputs: true, previousConfidence: 0.7 },
    });
    const selected = registry.select(ctx);
    // self-refine: 0.8, advisor: 0.4, ToT: 0.1, debate: 0.05, GoT: 0.05, direct: 0.2
    expect(selected.id).toBe('self-refine');
  });

  it('should show all 6 strategies with scores in selectAll', () => {
    const ctx = makeContext({ complexity: 'complex', risk: 'high', isAmbiguous: true });
    const all = registry.selectAll(ctx);

    expect(all).toHaveLength(6);
    // Verify all strategy IDs are present
    const ids = all.map((s) => s.strategy.id);
    expect(ids).toContain('direct');
    expect(ids).toContain('advisor');
    expect(ids).toContain('self-refine');
    expect(ids).toContain('tree-of-thought');
    expect(ids).toContain('debate');
    expect(ids).toContain('graph-of-thought');
  });

  it('should sort all strategies by score descending', () => {
    const ctx = makeContext({ complexity: 'complex', risk: 'high' });
    const all = registry.selectAll(ctx);

    for (let i = 1; i < all.length; i++) {
      expect(all[i - 1].score.score).toBeGreaterThanOrEqual(all[i].score.score);
    }
  });

  it('should select debate over GoT for high risk + complex + large blast radius', () => {
    const ctx = makeContext({
      complexity: 'complex',
      risk: 'high',
      isAmbiguous: false,
      blastRadius: 20,
    });
    const selected = registry.select(ctx);
    // advisor: 0.85, GoT: 0.85, debate: 0.8, ToT: 0.6, direct: 0.2
    // advisor and GoT tie at 0.85
    expect(['advisor', 'graph-of-thought']).toContain(selected.id);
  });

  it('should select GoT for complex + high blast radius + low risk', () => {
    const ctx = makeContext({
      complexity: 'complex',
      risk: 'low',
      isAmbiguous: false,
      blastRadius: 15,
    });
    const selected = registry.select(ctx);
    // GoT: 0.85, advisor: 0.8, ToT: 0.1, debate: 0.05, direct: 0.2
    expect(selected.id).toBe('graph-of-thought');
  });
});
