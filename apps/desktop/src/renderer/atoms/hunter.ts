/**
 * Hunter Jotai Atoms
 * Now backed by TanStack Query via atoms/queries.ts.
 * Re-exports for backward compatibility + legacy refresh atom that invalidates queries.
 *
 * @author Subash Karki
 */
import { atom } from 'jotai';

import { queryClient } from '../lib/queryClient';

// ---------------------------------------------------------------------------
// Re-exports from TanStack Query atoms
// ---------------------------------------------------------------------------

export {
  hunterProfileAtom,
  hunterStatsAtom,
  hunterLoadingStateAtom,
  hunterStatusAtom,
} from './queries';

// ---------------------------------------------------------------------------
// Backward-compatible refresh atom (now invalidates TanStack Query cache)
// ---------------------------------------------------------------------------

export const refreshHunterAtom = atom(null, () => {
  queryClient.invalidateQueries({ queryKey: ['hunter'] });
});
