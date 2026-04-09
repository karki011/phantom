/**
 * useHunterDashboard Hook
 * Provides heatmap, lifetime stats, model breakdown, timeline with background refresh
 * @author Subash Karki
 */
import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect } from 'react';

import {
  heatmapAtom,
  lifetimeStatsAtom,
  modelBreakdownAtom,
  timelineAtom,
  dashboardLoadingStateAtom,
  refreshDashboardAtom,
} from '../atoms/hunterDashboard';
import type { HeatmapDay, LifetimeStats, ModelBreakdownEntry, TimelineSession } from '../lib/api';

interface UseHunterDashboardReturn {
  heatmap: HeatmapDay[];
  lifetime: LifetimeStats | null;
  modelBreakdown: ModelBreakdownEntry[];
  timeline: TimelineSession[];
  loading: boolean;
  refresh: () => void;
}

export const useHunterDashboard = (): UseHunterDashboardReturn => {
  const heatmap = useAtomValue(heatmapAtom);
  const lifetime = useAtomValue(lifetimeStatsAtom);
  const modelBreakdown = useAtomValue(modelBreakdownAtom);
  const timeline = useAtomValue(timelineAtom);
  const loading = useAtomValue(dashboardLoadingStateAtom);
  const refresh = useSetAtom(refreshDashboardAtom);

  // Initial fetch on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  return { heatmap, lifetime, modelBreakdown, timeline, loading, refresh };
};
