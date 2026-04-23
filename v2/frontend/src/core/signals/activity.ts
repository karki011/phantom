// PhantomOS v2 — Activity panel signals (PR, CI, creating state)
// Author: Subash Karki

import { createSignal } from 'solid-js';
import type { PrStatus, CiRun } from '../types';

const [prStatus, setPrStatus] = createSignal<PrStatus | null>(null);
const [ciRuns, setCiRuns] = createSignal<CiRun[] | null>(null);
const [isCreatingPr, setIsCreatingPr] = createSignal(false);
const [ghAvailable, setGhAvailable] = createSignal(false);

export {
  prStatus, setPrStatus,
  ciRuns, setCiRuns,
  isCreatingPr, setIsCreatingPr,
  ghAvailable, setGhAvailable,
};
