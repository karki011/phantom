/**
 * Graph state atoms
 * Tracks code-graph build progress, stats, and phase for UI indicators
 *
 * @author Subash Karki
 */
import { atom } from 'jotai';

import { activeWorktreeAtom } from './worktrees';

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
// SSE event shapes (from backend)
// ---------------------------------------------------------------------------

interface GraphBuildStartEvent {
  type: 'graph:build:start';
  data: { projectId: string; totalFiles: number };
}

interface GraphBuildProgressEvent {
  type: 'graph:build:progress';
  data: { current: number; currentFile: string };
}

interface GraphBuildCompleteEvent {
  type: 'graph:build:complete';
  data: { files: number; edges: number; coverage: number };
}

interface GraphBuildErrorEvent {
  type: 'graph:build:error';
  data: { message: string };
}

interface GraphUpdateStartEvent {
  type: 'graph:update:start';
}

interface GraphUpdateCompleteEvent {
  type: 'graph:update:complete';
  data: { files?: number; edges?: number; coverage?: number };
}

interface GraphStaleEvent {
  type: 'graph:stale';
  data?: { count?: number };
}

interface GraphEnrichStartEvent {
  type: 'graph:enrich:start';
  data: { totalFiles: number };
}

interface GraphEnrichProgressEvent {
  type: 'graph:enrich:progress';
  data: { current: number; currentFile: string };
}

interface GraphEnrichCompleteEvent {
  type: 'graph:enrich:complete';
}

export type GraphSSEEvent =
  | GraphBuildStartEvent
  | GraphBuildProgressEvent
  | GraphBuildCompleteEvent
  | GraphBuildErrorEvent
  | GraphUpdateStartEvent
  | GraphUpdateCompleteEvent
  | GraphStaleEvent
  | GraphEnrichStartEvent
  | GraphEnrichProgressEvent
  | GraphEnrichCompleteEvent;

// ---------------------------------------------------------------------------
// Pure reducer — maps SSE event to next state
// ---------------------------------------------------------------------------

export function reduceGraphEvent(
  prev: GraphStatus,
  event: GraphSSEEvent,
  projectId: string | null,
): GraphStatus {
  // After SSE unwrapping, event.data is the full graph event object from the server.
  // Server event shapes (from @phantom-os/ai-engine EventBus):
  //   graph:build:start    → { projectId, phase, totalFiles, timestamp }
  //   graph:build:progress → { projectId, phase, current, total, currentFile, timestamp }
  //   graph:build:complete → { projectId, phase, stats: { files, edges, durationMs }, timestamp }
  //   graph:build:error    → { projectId, phase, error, file?, timestamp }
  //   graph:update:start   → { projectId, changedFiles, timestamp }
  //   graph:update:complete→ { projectId, updatedNodes, updatedEdges, durationMs, timestamp }
  //   graph:stale          → { projectId, staleFiles, timestamp }
  const d = (event.data ?? {}) as Record<string, unknown>;

  switch (event.type) {
    case 'graph:build:start':
      return {
        ...prev,
        phase: 'building',
        projectId: (d.projectId as string) ?? projectId,
        progress: { current: 0, total: (d.totalFiles as number) ?? 0, currentFile: '' },
        error: null,
      };

    case 'graph:build:progress':
      return {
        ...prev,
        progress: prev.progress
          ? { ...prev.progress, current: (d.current as number) ?? 0, currentFile: (d.currentFile as string) ?? '' }
          : { current: (d.current as number) ?? 0, total: (d.total as number) ?? 0, currentFile: (d.currentFile as string) ?? '' },
      };

    case 'graph:build:complete': {
      const stats = (d.stats as Record<string, number>) ?? {};
      return {
        ...prev,
        phase: 'ready',
        progress: null,
        stats: {
          files: stats.files ?? 0,
          edges: stats.edges ?? 0,
          coverage: stats.files > 0 ? 100 : 0,
        },
        lastUpdated: Date.now(),
        error: null,
      };
    }

    case 'graph:build:error':
      return {
        ...prev,
        phase: 'error',
        progress: null,
        error: (d.error as string) ?? 'Build failed',
      };

    case 'graph:enrich:start':
      return {
        ...prev,
        phase: 'enriching',
        progress: { current: 0, total: (d.totalFiles as number) ?? 0, currentFile: '' },
      };

    case 'graph:enrich:progress':
      return {
        ...prev,
        progress: prev.progress
          ? { ...prev.progress, current: (d.current as number) ?? 0, currentFile: (d.currentFile as string) ?? '' }
          : { current: (d.current as number) ?? 0, total: 0, currentFile: (d.currentFile as string) ?? '' },
      };

    case 'graph:enrich:complete':
      return {
        ...prev,
        phase: 'ready',
        progress: null,
        lastUpdated: Date.now(),
      };

    case 'graph:update:start':
      return {
        ...prev,
        phase: 'updating',
        error: null,
      };

    case 'graph:update:complete':
      return {
        ...prev,
        phase: 'ready',
        stats: prev.stats,
        lastUpdated: Date.now(),
      };

    case 'graph:stale':
      return {
        ...prev,
        phase: 'stale',
      };

    default:
      return prev;
  }
}

// ---------------------------------------------------------------------------
// Atoms
// ---------------------------------------------------------------------------

export const graphStatusAtom = atom<GraphStatus>({
  phase: 'idle',
  projectId: null,
  progress: null,
  stats: null,
  lastUpdated: null,
  error: null,
});

/** Write-only atom — dispatches raw graph SSE event through the reducer directly.
 *  Eliminates the double-render of the old forwarding pattern. */
export const dispatchGraphEventAtom = atom(
  null,
  (get, set, rawEvent: Record<string, unknown>) => {
    const eventType = (rawEvent.type as string) ?? '';
    if (!eventType.startsWith('graph:')) return;

    const sseEvent = { type: eventType, data: rawEvent } as GraphSSEEvent;
    const activeWorktree = get(activeWorktreeAtom);
    const projectId = activeWorktree?.projectId ?? null;
    const prev = get(graphStatusAtom);
    set(graphStatusAtom, reduceGraphEvent(prev, sseEvent, projectId));
  },
);
