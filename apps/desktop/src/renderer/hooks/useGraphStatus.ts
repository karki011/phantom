/**
 * useGraphStatus — Reads graphStatusAtom and fetches initial stats on mount.
 *
 * Graph SSE events are dispatched directly via dispatchGraphEventAtom (write-only)
 * from useSystemEvents, eliminating the double-render of the old forwarding pattern.
 *
 * @author Subash Karki
 */
import { useAtom, useAtomValue } from 'jotai';
import { useEffect } from 'react';

import {
  graphStatusAtom,
  type GraphStatus,
} from '../atoms/graph';
import { activeWorktreeAtom } from '../atoms/worktrees';

const apiBase = (window as any).__PHANTOM_API_BASE ?? '';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Returns the current graph status.
 *
 * Side-effects:
 * 1. Fetches initial stats from `GET /api/graph/{projectId}/stats` on mount.
 */
export const useGraphStatus = (): GraphStatus => {
  const [status, setStatus] = useAtom(graphStatusAtom);
  const activeWorktree = useAtomValue(activeWorktreeAtom);
  const projectId = activeWorktree?.projectId ?? null;

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

  return status;
};
