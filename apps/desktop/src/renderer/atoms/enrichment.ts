/**
 * Enrichment Atoms — tracks background graph build progress.
 * Populated from SSE events, consumed by EnrichmentWidget and sidebar.
 * @author Subash Karki
 */
import { atom } from 'jotai';
import { prioritizeEnrichment as apiPrioritize } from '../lib/api';

export type EnrichmentStatus = 'queued' | 'building' | 'complete' | 'error';

export interface EnrichmentItem {
  projectId: string;
  projectName: string;
  status: EnrichmentStatus;
}

export interface EnrichmentState {
  completed: number;
  total: number;
  active: string[];
  items: Map<string, EnrichmentItem>;
}

const initialState: EnrichmentState = {
  completed: 0,
  total: 0,
  active: [],
  items: new Map(),
};

export const enrichmentStateAtom = atom<EnrichmentState>(initialState);

export const enrichmentActiveAtom = atom((get) => {
  const state = get(enrichmentStateAtom);
  return state.total > 0 && state.completed < state.total;
});

export const enrichmentItemStatusAtom = atom((get) => {
  const state = get(enrichmentStateAtom);
  return (projectId: string): EnrichmentStatus | null =>
    state.items.get(projectId)?.status ?? null;
});

export const updateEnrichmentAtom = atom(
  null,
  (_get, set, event: { type: string; data: Record<string, unknown> }) => {
    set(enrichmentStateAtom, (prev) => {
      const next = { ...prev, items: new Map(prev.items) };

      if (event.type === 'project:enrichment') {
        const { projectId, projectName, status } = event.data as {
          projectId: string;
          projectName?: string;
          status: EnrichmentStatus;
        };
        const existing = next.items.get(projectId);
        next.items.set(projectId, {
          projectId,
          projectName: projectName ?? existing?.projectName ?? projectId,
          status,
        });
      }

      if (event.type === 'enrichment:progress') {
        const { completed, total, active } = event.data as {
          completed: number;
          total: number;
          active: string[];
        };
        next.completed = completed;
        next.total = total;
        next.active = active;
      }

      return next;
    });
  },
);

export const resetEnrichmentAtom = atom(null, (_get, set) => {
  set(enrichmentStateAtom, initialState);
});

export const prioritizeEnrichmentAtom = atom(
  null,
  async (_get, _set, projectId: string) => {
    await apiPrioritize(projectId);
  },
);
