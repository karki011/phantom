// Phantom — AI Engine Playground bindings
// Author: Subash Karki

import { normalize } from './_normalize';

const App = () => (window as any).go?.['app']?.App;

// ── Types ─────────────────────────────────────────────────────────────────

export interface PlaygroundAlternative {
  name: string;
  score: number;
  reason: string;
}

export interface PlaygroundGraphStats {
  files_indexed: number;
  symbols_indexed: number;
  edge_count: number;
}

export interface PlaygroundResult {
  strategy: string;
  confidence: number;
  complexity: string;
  risk: string;
  blast_radius: number;
  file_count: number;
  ambiguity_score: number;
  is_ambiguous: boolean;
  inferred_files: string[] | null;
  alternatives: PlaygroundAlternative[] | null;
  enriched_prompt: string;
  session_memory: string;
  graph_stats: PlaygroundGraphStats | null;
  duration_ms: number;
}

// ── Binding ───────────────────────────────────────────────────────────────

export const playgroundProcess = async (
  goal: string,
  cwd: string,
): Promise<PlaygroundResult | null> => {
  try {
    const raw = await App()?.PlaygroundProcess(goal, cwd);
    return raw ? normalize<PlaygroundResult>(raw) : null;
  } catch (err) {
    console.error('playground: process failed', err);
    return null;
  }
};
