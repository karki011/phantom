// Phantom — App-level signals
// Author: Subash Karki

import { createSignal } from 'solid-js';
import { onWailsEvent } from '../events';
import { setPref, loadPref } from './preferences';

export type TopTab = 'system' | 'worktree';
export type CockpitView = 'system' | 'hunter';

const [_activeTopTab, _setActiveTopTab] = createSignal<TopTab>('worktree');
const [activeWorktreeId, setActiveWorktreeId] = createSignal<string | null>(null);
const [backendConnected, setBackendConnected] = createSignal(false);
const [booted, setBooted] = createSignal(false);
const [cockpitView, setCockpitView] = createSignal<CockpitView>('system');

// Exported read accessor — same shape as the original createSignal accessor
const activeTopTab = _activeTopTab;

// Persisted setter — writes through to prefs so the tab survives restarts
function setActiveTopTab(tab: TopTab): void {
  _setActiveTopTab(tab);
  setPref('active_top_tab', tab).catch(() => {});
}

// Restore activeTopTab from prefs. Called early in app startup (onMount).
export async function restoreActiveTopTab(): Promise<void> {
  const saved = await loadPref('active_top_tab');
  if (saved === 'system' || saved === 'worktree') {
    _setActiveTopTab(saved);
  }
}

export function bootstrapApp(): void {
  // Check backend health on mount
  import('../bindings').then(({ healthCheck }) => {
    healthCheck().then((resp) => {
      setBackendConnected(resp !== null);
    });
  });

  // Listen for backend health events
  onWailsEvent<{ healthy: boolean }>('system:health', ({ healthy }) => {
    setBackendConnected(healthy);
  });
}

export {
  activeTopTab, setActiveTopTab,
  activeWorktreeId, setActiveWorktreeId,
  backendConnected, setBackendConnected,
  booted, setBooted,
  cockpitView, setCockpitView,
};
