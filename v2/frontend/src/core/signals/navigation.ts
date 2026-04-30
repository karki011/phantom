// Phantom — Navigation history (back/forward)
// Author: Subash Karki

import { createMemo, createSignal } from 'solid-js';
import {
  activeTopTab,
  cockpitView,
  setActiveTopTab,
  setCockpitView,
  type CockpitView,
  type TopTab,
} from './app';

export interface NavEntry {
  tab: TopTab;
  view: CockpitView;
}

const [history, setHistory] = createSignal<NavEntry[]>([
  { tab: activeTopTab(), view: cockpitView() },
]);
const [cursor, setCursor] = createSignal(0);
const [traversing, setTraversing] = createSignal(false);

export const canGoBack = createMemo(() => cursor() > 0);
export const canGoForward = createMemo(() => cursor() < history().length - 1);

export function pushNav(entry: NavEntry): void {
  if (traversing()) return;
  const last = history()[cursor()];
  if (last && last.tab === entry.tab && last.view === entry.view) return;
  const next = history().slice(0, cursor() + 1).concat(entry);
  setHistory(next);
  setCursor(next.length - 1);
}

function applyEntry(entry: NavEntry): void {
  setTraversing(true);
  setActiveTopTab(entry.tab);
  setCockpitView(entry.view);
  queueMicrotask(() => setTraversing(false));
}

export function goBack(): void {
  if (!canGoBack()) return;
  const next = cursor() - 1;
  setCursor(next);
  applyEntry(history()[next]);
}

export function goForward(): void {
  if (!canGoForward()) return;
  const next = cursor() + 1;
  setCursor(next);
  applyEntry(history()[next]);
}
