/**
 * Graph state atoms
 * Tracks code-graph build progress, stats, and phase for UI indicators
 *
 * @author Subash Karki
 */
import { atom } from 'jotai';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GraphPhase =
  | 'idle'
  | 'building'
  | 'enriching'
  | 'updating'
  | 'ready'
  | 'stale'
  | 'error';

export interface GraphProgress {
  current: number;
  total: number;
  currentFile: string;
}

export interface GraphStats {
  files: number;
  edges: number;
  coverage: number;
}

export interface GraphStatus {
  phase: GraphPhase;
  projectId: string | null;
  progress: GraphProgress | null;
  stats: GraphStats | null;
  lastUpdated: number | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Atom
// ---------------------------------------------------------------------------

export const graphStatusAtom = atom<GraphStatus>({
  phase: 'idle',
  projectId: null,
  progress: null,
  stats: null,
  lastUpdated: null,
  error: null,
});
