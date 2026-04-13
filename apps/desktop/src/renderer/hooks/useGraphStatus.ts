/**
 * useGraphStatus — Listens to SSE graph events and updates atom
 * Consumes graph:* events from the shared EventSource and keeps the
 * graphStatusAtom in sync.  Also fetches initial stats on mount.
 *
 * @author Subash Karki
 */
import { useAtom, useAtomValue } from 'jotai';
import { useEffect, useRef } from 'react';

import {
  graphStatusAtom,
  type GraphStatus,
  type GraphStats,
} from '../atoms/graph';
import { activeWorktreeAtom } from '../atoms/worktrees';

const apiBase = (window as any).__PHANTOM_API_BASE ?? '';

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

type GraphSSEEvent =
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
// Hook
// ---------------------------------------------------------------------------

/**
 * Returns the current graph status.
 *
 * Side-effects:
 * 1. Subscribes to SSE `/events` for graph:* events (mirrors the pattern in
 *    useSystemEvents but only handles graph events).
 * 2. Fetches initial stats from `GET /api/graph/{projectId}/stats` on mount.
 */
export const useGraphStatus = (): GraphStatus => {
  const [status, setStatus] = useAtom(graphStatusAtom);
  const activeWorktree = useAtomValue(activeWorktreeAtom);
  const projectId = activeWorktree?.projectId ?? null;

  // Track projectId in a ref so the SSE handler always has the latest value
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  // ------- Fetch initial stats on mount / project change -------
  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;

    fetch(`${apiBase}/api/graph/${encodeURIComponent(projectId)}/stats`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        // API returns engine's GraphStats shape: { fileCount, totalEdges, coverage, ... }
        const apiStats = data as Record<string, unknown>;
        const files = (apiStats.fileCount as number) ?? 0;
        const edges = (apiStats.totalEdges as number) ?? 0;
        const coverage = (apiStats.coverage as number) ?? 0;
        const hasData = files > 0;
        setStatus((prev) => ({
          ...prev,
          projectId,
          phase: prev.phase === 'idle' && hasData ? 'ready' : prev.phase,
          stats: { files, edges, coverage },
          lastUpdated: (apiStats.lastUpdatedAt as number) ?? Date.now(),
        }));
      })
      .catch(() => {
        // API may not exist yet — stay idle
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, setStatus]);

  // ------- SSE listener for graph events -------
  useEffect(() => {
    let source: EventSource | null = null;
    let retryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let unmounted = false;

    const connect = () => {
      if (unmounted) return;
      source = new EventSource(`${apiBase}/events`);

      source.onmessage = (event) => {
        let parsed: { type: string; data?: Record<string, unknown> };
        try {
          parsed = JSON.parse(event.data);
        } catch {
          return;
        }

        // Server broadcasts: { type: 'graph', data: { type: 'graph:build:start', ... } }
        // We need to unwrap: outer type is 'graph', inner data.type is the actual event
        if (parsed.type !== 'graph' || !parsed.data) return;

        const inner = parsed.data as Record<string, unknown>;
        const eventType = (inner.type as string) ?? '';
        if (!eventType.startsWith('graph:')) return;

        // Map inner event fields to our SSE event shape
        const graphEvent = { type: eventType, data: inner } as GraphSSEEvent;

        setStatus((prev) => reduceGraphEvent(prev, graphEvent, projectIdRef.current));
      };

      source.onopen = () => {
        retryCount = 0;
      };

      source.onerror = () => {
        source?.close();
        source = null;
        const delay = Math.min(1000 * Math.pow(2, retryCount), 30_000);
        retryCount++;
        retryTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      unmounted = true;
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
    };
  }, [setStatus]);

  return status;
};

// ---------------------------------------------------------------------------
// Pure reducer — maps SSE event to next state
// ---------------------------------------------------------------------------

function reduceGraphEvent(
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
