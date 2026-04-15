/**
 * Cockpit dashboard Jotai atoms
 *
 * @author Subash Karki
 */
import { atom } from 'jotai';
import type { CockpitDashboard, CockpitPeriod } from '@phantom-os/shared';
import { API_PORT } from '@phantom-os/shared';

const BASE = `http://localhost:${API_PORT}`;

export const cockpitPeriodAtom = atom<CockpitPeriod>('7d');
export const cockpitLoadingAtom = atom(false);
export const cockpitErrorAtom = atom<string | null>(null);
export const cockpitDataAtom = atom<CockpitDashboard | null>(null);

export const refreshCockpitAtom = atom(null, async (get, set) => {
  const period = get(cockpitPeriodAtom);
  set(cockpitLoadingAtom, true);
  set(cockpitErrorAtom, null);
  try {
    const res = await fetch(`${BASE}/api/cockpit/dashboard?period=${period}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: CockpitDashboard = await res.json();
    set(cockpitDataAtom, data);
  } catch (err) {
    set(cockpitErrorAtom, err instanceof Error ? err.message : 'Failed to load');
  } finally {
    set(cockpitLoadingAtom, false);
  }
});
