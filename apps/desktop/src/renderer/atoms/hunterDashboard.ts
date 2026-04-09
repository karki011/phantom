/**
 * Hunter Dashboard Atoms
 * Data atoms for the Hunter Stats dashboard (heatmap, lifetime stats, model breakdown, timeline)
 * @author Subash Karki
 */
import { atom } from 'jotai';
import {
  type HeatmapDay,
  type LifetimeStats,
  type ModelBreakdownEntry,
  type TimelineSession,
  getHeatmap,
  getLifetimeStats,
  getModelBreakdown,
  getSessionTimeline,
} from '../lib/api';

// ---------------------------------------------------------------------------
// Data atoms — hold current values, never cleared during refetch
// ---------------------------------------------------------------------------

const heatmapDataAtom = atom<HeatmapDay[]>([]);
const lifetimeDataAtom = atom<LifetimeStats | null>(null);
const modelBreakdownDataAtom = atom<ModelBreakdownEntry[]>([]);
const timelineDataAtom = atom<TimelineSession[]>([]);
const dashboardLoadingAtom = atom(false);

// ---------------------------------------------------------------------------
// Refresh action — fetches all dashboard data in parallel
// ---------------------------------------------------------------------------

export const refreshDashboardAtom = atom(null, async (_get, set) => {
  set(dashboardLoadingAtom, true);
  try {
    const [heatmap, lifetime, breakdown, timeline] = await Promise.all([
      getHeatmap(),
      getLifetimeStats(),
      getModelBreakdown(),
      getSessionTimeline(),
    ]);
    set(heatmapDataAtom, heatmap);
    set(lifetimeDataAtom, lifetime);
    set(modelBreakdownDataAtom, breakdown);
    set(timelineDataAtom, timeline);
  } catch {
    // Keep previous data on error
  } finally {
    set(dashboardLoadingAtom, false);
  }
});

// ---------------------------------------------------------------------------
// Derived read atoms
// ---------------------------------------------------------------------------

export const heatmapAtom = atom((get) => get(heatmapDataAtom));
export const lifetimeStatsAtom = atom((get) => get(lifetimeDataAtom));
export const modelBreakdownAtom = atom((get) => get(modelBreakdownDataAtom));
export const timelineAtom = atom((get) => get(timelineDataAtom));
export const dashboardLoadingStateAtom = atom((get) => get(dashboardLoadingAtom));
