/**
 * Orchestrator Types — pipeline input/output contracts
 * @author Subash Karki
 */
import type { TaskContext } from '../types/strategy.js';
import type { StrategyOutput } from '../types/strategy.js';

// ---------------------------------------------------------------------------
// Pipeline Input
// ---------------------------------------------------------------------------

export interface GoalInput {
  /** What the user wants to accomplish */
  goal: string;
  /** Files the user is currently working with (if known) */
  activeFiles?: string[];
  /** Project ID for graph context */
  projectId: string;
  /** Optional hints about the task */
  hints?: {
    isAmbiguous?: boolean;
    isCritical?: boolean;
    estimatedComplexity?: 'simple' | 'moderate' | 'complex' | 'critical';
  };
}

// ---------------------------------------------------------------------------
// Pipeline Output
// ---------------------------------------------------------------------------

export interface OrchestratorResult {
  /** The selected strategy and why */
  strategy: {
    id: string;
    name: string;
    reason: string;
    score: number;
  };
  /** All strategies considered with scores */
  alternatives: Array<{
    id: string;
    name: string;
    score: number;
    reason: string;
  }>;
  /** Graph context selected for this goal */
  context: {
    files: Array<{ path: string; relevance: number }>;
    blastRadius: number;
    relatedFiles: string[];
  };
  /** The assessed task context */
  taskContext: TaskContext;
  /** Strategy execution output */
  output: StrategyOutput;
  /** Total pipeline duration */
  totalDurationMs: number;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export interface EvaluationResult {
  /** Overall confidence (0-1) */
  confidence: number;
  /** What was checked */
  checks: Array<{
    name: string;
    passed: boolean;
    detail: string;
  }>;
  /** Recommendation */
  recommendation: 'accept' | 'refine' | 'escalate';
}
