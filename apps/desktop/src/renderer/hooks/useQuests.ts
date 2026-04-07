/**
 * useQuests Hook
 * Provides daily quests, loading state, and refresh
 *
 * @author Subash Karki
 */
import { atom, useAtomValue, useSetAtom } from 'jotai';
import { loadable } from 'jotai/utils';
import { useMemo } from 'react';

import type { DailyQuestData } from '../lib/api';
import { getDailyQuests } from '../lib/api';

// ---------------------------------------------------------------------------
// Atoms (colocated — only used by this hook)
// ---------------------------------------------------------------------------

const questsRefreshAtom = atom(0);

const questsAtom = atom<Promise<DailyQuestData[]>>(async (get) => {
  get(questsRefreshAtom);
  return getDailyQuests();
});

const refreshQuestsAtom = atom(null, (_get, set) => {
  set(questsRefreshAtom, (c) => c + 1);
});

const loadableQuestsAtom = loadable(questsAtom);

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseQuestsReturn {
  quests: DailyQuestData[];
  loading: boolean;
  error: unknown;
  refresh: () => void;
}

export const useQuests = (): UseQuestsReturn => {
  const questsLoadable = useAtomValue(loadableQuestsAtom);
  const refresh = useSetAtom(refreshQuestsAtom);

  return useMemo(() => {
    if (questsLoadable.state === 'loading') {
      return { quests: [], loading: true, error: null, refresh };
    }
    if (questsLoadable.state === 'hasError') {
      return { quests: [], loading: false, error: questsLoadable.error, refresh };
    }
    return {
      quests: questsLoadable.data,
      loading: false,
      error: null,
      refresh,
    };
  }, [questsLoadable, refresh]);
};
