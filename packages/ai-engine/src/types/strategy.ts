/**
 * Strategy Plugin System Types
 * Defines the contract for reasoning strategies
 *
 * @author Subash Karki
 */

// ---------------------------------------------------------------------------
// Task Context (input to strategy selection)
// ---------------------------------------------------------------------------

export type TaskComplexity = 'simple' | 'moderate' | 'complex' | 'critical';
export type TaskRisk = 'low' | 'medium' | 'high' | 'critical';

export interface TaskContext {
  /** What the user is trying to accomplish */
  goal: string;
  /** Relevant file paths from graph context */
  relevantFiles: string[];
  /** Number of files in blast radius */
  blastRadius: number;
  /** Assessed complexity */
  complexity: TaskComplexity;
  /** Assessed risk level */
  risk: TaskRisk;
  /** Whether the task involves ambiguous requirements */
  isAmbiguous: boolean;
  /** Additional signals from the graph */
  signals: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Strategy Interface
// ---------------------------------------------------------------------------

export interface ActivationScore {
  /** Should this strategy be used? (0-1, higher = more appropriate) */
  score: number;
  /** Why this strategy scored this way */
  reason: string;
}

export interface StrategyInput {
  context: TaskContext;
  /** Graph-selected context (files, edges) */
  graphContext: {
    files: Array<{ path: string; relevance: number }>;
    edges: Array<{ source: string; target: string; type: string }>;
  };
  /** Previous strategy outputs (for chained strategies) */
  previousOutputs?: StrategyOutput[];
}

export interface StrategyOutput {
  strategyId: string;
  /** The reasoning result */
  result: string;
  /** Confidence in the result (0-1) */
  confidence: number;
  /** Token usage for this strategy execution */
  tokensUsed: number;
  /** Time taken in ms */
  durationMs: number;
  /** Any artifacts produced */
  artifacts: Record<string, unknown>;
}

export interface ReasoningStrategy {
  id: string;
  name: string;
  version: string;
  description: string;

  /** Determine if this strategy should activate for the given context */
  shouldActivate(context: TaskContext): ActivationScore;

  /** Execute the reasoning strategy */
  execute(input: StrategyInput): Promise<StrategyOutput>;
}

// ---------------------------------------------------------------------------
// Strategy Registry
// ---------------------------------------------------------------------------

export interface StrategyRegistryEntry {
  strategy: ReasoningStrategy;
  enabled: boolean;
  priority: number;
}
