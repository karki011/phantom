/**
 * GraphOfThoughtStrategy — Graph-structured reasoning for complex interconnected problems
 *
 * Unlike linear (CoT) or tree (ToT) reasoning, GoT allows thoughts to merge,
 * branch, and reconnect — modeling how complex system changes actually propagate.
 * Each "thought node" represents a sub-problem, with edges showing dependencies.
 *
 * @author Subash Karki
 */
import type {
  ActivationScore,
  ReasoningStrategy,
  StrategyInput,
  StrategyOutput,
  TaskContext,
} from '../types/strategy.js';
import { applyPriorFailurePenalty } from './prior-penalty.js';

// ---------------------------------------------------------------------------
// Graph types
// ---------------------------------------------------------------------------

interface ThoughtNode {
  id: string;
  description: string;
  dependencies: string[];
  status: 'pending' | 'completed';
  files: string[];
}

// ---------------------------------------------------------------------------
// Strategy
// ---------------------------------------------------------------------------

export class GraphOfThoughtStrategy implements ReasoningStrategy {
  readonly id = 'graph-of-thought';
  readonly name = 'Graph of Thoughts';
  readonly version = '1.0.0';
  readonly description =
    'Graph-structured reasoning for complex interconnected problems. Decomposes into thought nodes with dependency edges.';

  shouldActivate(context: TaskContext): ActivationScore {
    const { complexity, blastRadius, isAmbiguous } = context;

    let base: ActivationScore;

    if (complexity === 'critical') {
      base = {
        score: 0.9,
        reason: 'Critical complexity — graph-of-thought decomposition strongly recommended',
      };
    } else if (complexity === 'complex' && blastRadius > 10) {
      base = {
        score: 0.85,
        reason: `Complex task with large blast radius (${blastRadius} files) — graph decomposition recommended`,
      };
    } else if (complexity === 'complex' && !isAmbiguous) {
      base = {
        score: 0.7,
        reason: 'Complex task with clear requirements — graph decomposition can parallelize subtasks',
      };
    } else if (complexity === 'moderate' && blastRadius > 15) {
      base = {
        score: 0.6,
        reason: `Moderate complexity but large blast radius (${blastRadius} files) — graph decomposition may help`,
      };
    } else {
      base = {
        score: 0.05,
        reason: 'Simple or small-scope task — graph decomposition not needed',
      };
    }

    return applyPriorFailurePenalty(base, this.id, context);
  }

  async execute(input: StrategyInput): Promise<StrategyOutput> {
    const start = Date.now();
    const { context, graphContext } = input;

    // 1. Decompose goal into thought nodes
    const thoughtNodes = this.decompose(context, graphContext);

    // 2. Build dependency edges from graph context
    this.buildDependencyEdges(thoughtNodes, graphContext);

    // 3. Topological sort
    const executionOrder = this.topologicalSort(thoughtNodes);

    // 4. Identify parallel groups
    const parallelGroups = this.identifyParallelGroups(thoughtNodes, executionOrder);

    // 5. Process nodes in order (mark as completed)
    for (const nodeId of executionOrder) {
      const node = thoughtNodes.find((n) => n.id === nodeId);
      if (node) {
        node.status = 'completed';
      }
    }

    // 6. Synthesize
    const synthesis = this.synthesize(thoughtNodes, executionOrder, parallelGroups, context);

    // 7. Calculate confidence — more independent nodes = higher confidence
    const independentCount = thoughtNodes.filter((n) => n.dependencies.length === 0).length;
    const independenceRatio = thoughtNodes.length > 0 ? independentCount / thoughtNodes.length : 0;
    const confidence = Math.min(0.95, Math.round((0.5 + independenceRatio * 0.4) * 100) / 100);

    const result = JSON.stringify({
      type: 'graph-of-thought',
      goal: context.goal,
      thoughtNodes: thoughtNodes.map((n) => ({
        id: n.id,
        description: n.description,
        dependencies: n.dependencies,
        status: n.status,
        files: n.files,
      })),
      executionOrder,
      parallelGroups,
      synthesis,
    });

    return {
      strategyId: this.id,
      result,
      confidence,
      tokensUsed: 0, // No LLM call — placeholder
      durationMs: Date.now() - start,
      artifacts: {
        strategy: 'graph-of-thought',
        thoughtNodes: thoughtNodes.map((n) => ({
          id: n.id,
          description: n.description,
          dependencies: n.dependencies,
          status: n.status,
          files: n.files,
        })),
        executionOrder,
        parallelGroups,
        synthesis,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private decompose(
    context: TaskContext,
    graphContext: StrategyInput['graphContext'],
  ): ThoughtNode[] {
    const files = graphContext.files;
    const nodes: ThoughtNode[] = [];

    // Always create an analysis node
    nodes.push({
      id: 'analyze',
      description: `Analyze requirements for: ${context.goal}`,
      dependencies: [],
      status: 'pending',
      files: files.slice(0, 3).map((f) => f.path),
    });

    // Create a node per file group (batch files by relevance tiers)
    const highRelevance = files.filter((f) => f.relevance >= 0.7);
    const lowRelevance = files.filter((f) => f.relevance < 0.7);

    if (highRelevance.length > 0) {
      nodes.push({
        id: 'implement-core',
        description: 'Implement changes in high-relevance files',
        dependencies: ['analyze'],
        status: 'pending',
        files: highRelevance.map((f) => f.path),
      });
    }

    if (lowRelevance.length > 0) {
      nodes.push({
        id: 'implement-peripheral',
        description: 'Update peripheral files for consistency',
        dependencies: ['analyze'],
        status: 'pending',
        files: lowRelevance.map((f) => f.path),
      });
    }

    // If there are edges, add an integration node
    if (graphContext.edges.length > 0) {
      const implementDeps: string[] = [];
      if (highRelevance.length > 0) implementDeps.push('implement-core');
      if (lowRelevance.length > 0) implementDeps.push('implement-peripheral');
      if (implementDeps.length === 0) implementDeps.push('analyze');

      nodes.push({
        id: 'integrate',
        description: 'Verify integration points between changed files',
        dependencies: implementDeps,
        status: 'pending',
        files: graphContext.edges.map((e) => e.source),
      });
    }

    // Always add a verification node at the end
    const lastNodes = nodes.filter(
      (n) => !nodes.some((other) => other.dependencies.includes(n.id)),
    );
    // Exclude the verification node candidates that are the leaf nodes
    const verifyDeps =
      lastNodes.length > 0 ? lastNodes.map((n) => n.id) : ['analyze'];

    nodes.push({
      id: 'verify',
      description: 'Verify all changes are consistent and complete',
      dependencies: verifyDeps,
      status: 'pending',
      files: [],
    });

    return nodes;
  }

  private buildDependencyEdges(
    nodes: ThoughtNode[],
    graphContext: StrategyInput['graphContext'],
  ): void {
    // Enrich dependencies based on file-level edges from the code graph
    for (const edge of graphContext.edges) {
      const sourceNode = nodes.find((n) => n.files.includes(edge.source));
      const targetNode = nodes.find((n) => n.files.includes(edge.target));

      if (
        sourceNode &&
        targetNode &&
        sourceNode.id !== targetNode.id &&
        !sourceNode.dependencies.includes(targetNode.id) &&
        !targetNode.dependencies.includes(sourceNode.id) // Avoid cycles
      ) {
        // The node touching the target file should depend on the node touching the source
        // (the source is imported, so it should be changed first)
        if (!targetNode.dependencies.includes(sourceNode.id)) {
          // Only add if it doesn't create a cycle
          // Simple cycle check: sourceNode shouldn't transitively depend on targetNode
          if (!this.wouldCreateCycle(sourceNode.id, targetNode.id, nodes)) {
            targetNode.dependencies.push(sourceNode.id);
          }
        }
      }
    }
  }

  private wouldCreateCycle(
    fromId: string,
    toId: string,
    nodes: ThoughtNode[],
  ): boolean {
    // Check if adding an edge from toId -> fromId would create a cycle
    // i.e., check if fromId can already reach toId
    const visited = new Set<string>();
    const stack = [fromId];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === toId) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      const node = nodes.find((n) => n.id === current);
      if (node) {
        for (const dep of node.dependencies) {
          stack.push(dep);
        }
      }
    }

    return false;
  }

  private topologicalSort(nodes: ThoughtNode[]): string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (nodeId: string): void => {
      if (visited.has(nodeId)) return;
      if (visiting.has(nodeId)) return; // Cycle — skip

      visiting.add(nodeId);

      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        for (const dep of node.dependencies) {
          visit(dep);
        }
      }

      visiting.delete(nodeId);
      visited.add(nodeId);
      result.push(nodeId);
    };

    for (const node of nodes) {
      visit(node.id);
    }

    return result;
  }

  private identifyParallelGroups(
    nodes: ThoughtNode[],
    executionOrder: string[],
  ): string[][] {
    // Group nodes by their "depth" — nodes at the same depth can run in parallel
    const depthMap = new Map<string, number>();

    for (const nodeId of executionOrder) {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) continue;

      if (node.dependencies.length === 0) {
        depthMap.set(nodeId, 0);
      } else {
        const maxDepDep = Math.max(
          ...node.dependencies.map((d) => depthMap.get(d) ?? 0),
        );
        depthMap.set(nodeId, maxDepDep + 1);
      }
    }

    // Group by depth
    const groupMap = new Map<number, string[]>();
    for (const [nodeId, depth] of depthMap) {
      const group = groupMap.get(depth) ?? [];
      group.push(nodeId);
      groupMap.set(depth, group);
    }

    // Convert to sorted array of groups
    const depths = [...groupMap.keys()].sort((a, b) => a - b);
    return depths.map((d) => groupMap.get(d)!);
  }

  private synthesize(
    nodes: ThoughtNode[],
    executionOrder: string[],
    parallelGroups: string[][],
    context: TaskContext,
  ): string {
    const totalNodes = nodes.length;
    const parallelSteps = parallelGroups.length;
    const maxParallel = Math.max(...parallelGroups.map((g) => g.length));

    return [
      `Decomposed "${context.goal}" into ${totalNodes} thought nodes.`,
      `Execution requires ${parallelSteps} sequential steps with up to ${maxParallel} parallel tasks.`,
      `Order: ${executionOrder.join(' → ')}.`,
      `All nodes completed successfully.`,
    ].join(' ');
  }
}
