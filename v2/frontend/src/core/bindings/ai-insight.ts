// Phantom — AI Insight bindings
// Author: Subash Karki

import { normalize } from './_normalize';

const App = () => (window as any).go?.['app']?.App;

// ── Types ─────────────────────────────────────────────────────────────────

export interface StrategyInfo {
  id: string;
  name: string;
}

export interface AssessmentInfo {
  complexity: string;
  risk: string;
  ambiguity_score: number;
  is_ambiguous: boolean;
  file_count: number;
  blast_radius: number;
}

export interface ContextCoverage {
  files_indexed: number;
  symbols_indexed: number;
  edge_count: number;
  coverage_percent: number;
}

export interface KnowledgeStats {
  decisions_recorded: number;
  patterns_discovered: number;
  success_rate: number;
}

export interface DecisionEntry {
  id: string;
  goal: string;
  strategy_id: string;
  complexity: string;
  risk: string;
  success: boolean | null;
  created_at: string;
}

export interface AIInsightData {
  strategy: StrategyInfo;
  assessment: AssessmentInfo;
  context: ContextCoverage;
  knowledge: KnowledgeStats;
  recent_decisions: DecisionEntry[];
}

// ── Binding ───────────────────────────────────────────────────────────────

export async function getAIInsight(): Promise<AIInsightData | null> {
  try {
    const raw = await App()?.GetAIInsight();
    return raw ? normalize<AIInsightData>(raw) : null;
  } catch {
    return null;
  }
}
