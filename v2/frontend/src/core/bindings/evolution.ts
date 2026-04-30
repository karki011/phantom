// Phantom — Evolution Panel bindings
// Data source: Wails binding (GetEvolution) with REST fallback
// REST endpoint: GET /api/orchestrator/:projectId/evolution
//
// Author: Subash Karki

import { normalize } from './_normalize';

const App = () => (window as any).go?.['app']?.App;

// ── Types ─────────────────────────────────────────────────────────────────

export interface GapAlert {
  strategy_id: string;
  label: string;
  severity: 'critical' | 'warning' | 'info';
  success_rate: number;
}

export interface StrategyTrend {
  strategy_id: string;
  label: string;
  success_rate: number;
  /** Recent success rates (newest last) for sparkline rendering. */
  history: number[];
}

export interface EvolutionData {
  health_score: number;
  active_patterns: number;
  deprecated_patterns: number;
  avg_success_rate: number;
  gaps: GapAlert[];
  trends: StrategyTrend[];
}

// ── Binding ───────────────────────────────────────────────────────────────

export async function getEvolution(): Promise<EvolutionData | null> {
  try {
    // Prefer Wails binding when running inside the desktop app.
    const raw = await App()?.GetEvolution();
    if (raw) return normalize<EvolutionData>(raw);

    // REST fallback for browser-only dev mode.
    const projectId = (window as any).__phantomProjectId;
    if (!projectId) return null;

    const res = await fetch(`/api/orchestrator/${projectId}/evolution`);
    if (!res.ok) return null;
    return normalize<EvolutionData>(await res.json());
  } catch {
    return null;
  }
}
