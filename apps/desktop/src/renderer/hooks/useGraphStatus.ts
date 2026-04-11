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

    fetch(`/api/graph/${encodeURIComponent(projectId)}/stats`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const stats = data as GraphStats & { lastUpdated?: number };
        setStatus((prev) => ({
          ...prev,
          projectId,
          phase: prev.phase === 'idle' ? 'ready' : prev.phase,
          stats: { files: stats.files, edges: stats.edges, coverage: stats.coverage },
          lastUpdated: stats.lastUpdated ?? Date.now(),
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
      source = new EventSource('/events');

      source.onmessage = (event) => {
        let parsed: { type: string; data?: Record<string, unknown> };
        try {
          parsed = JSON.parse(event.data);
        } catch {
          return;
        }

        const eventType = parsed.type ?? '';
        if (!eventType.startsWith('graph:')) return;

        const graphEvent = { type: eventType, data: parsed.data } as GraphSSEEvent;

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
  switch (event.type) {
    case 'graph:build:start':
      return {
        ...prev,
        phase: 'building',
        projectId: event.data.projectId ?? projectId,
        progress: { current: 0, total: event.data.totalFiles, currentFile: '' },
        error: null,
      };

    case 'graph:build:progress':
      return {
        ...prev,
        progress: prev.progress
          ? { ...prev.progress, current: event.data.current, currentFile: event.data.currentFile }
          : { current: event.data.current, total: 0, currentFile: event.data.currentFile },
      };

    case 'graph:build:complete':
      return {
        ...prev,
        phase: 'ready',
        progress: null,
        stats: {
          files: event.data.files,
          edges: event.data.edges,
          coverage: event.data.coverage,
        },
        lastUpdated: Date.now(),
        error: null,
      };

    case 'graph:build:error':
      return {
        ...prev,
        phase: 'error',
        progress: null,
        error: event.data.message,
      };

    case 'graph:enrich:start':
      return {
        ...prev,
        phase: 'enriching',
        progress: { current: 0, total: event.data.totalFiles, currentFile: '' },
      };

    case 'graph:enrich:progress':
      return {
        ...prev,
        progress: prev.progress
          ? { ...prev.progress, current: event.data.current, currentFile: event.data.currentFile }
          : { current: event.data.current, total: 0, currentFile: event.data.currentFile },
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
        stats: event.data
          ? {
              files: (event.data.files as number) ?? prev.stats?.files ?? 0,
              edges: (event.data.edges as number) ?? prev.stats?.edges ?? 0,
              coverage: (event.data.coverage as number) ?? prev.stats?.coverage ?? 0,
            }
          : prev.stats,
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
