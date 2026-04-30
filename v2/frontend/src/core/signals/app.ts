// Phantom — App-level signals
// Author: Subash Karki

import { createSignal } from 'solid-js';
import { onWailsEvent } from '../events';

export type TopTab = 'system' | 'worktree';
export type CockpitView = 'system' | 'hunter';

const [activeTopTab, setActiveTopTab] = createSignal<TopTab>('worktree');
const [activeWorktreeId, setActiveWorktreeId] = createSignal<string | null>(null);
const [backendConnected, setBackendConnected] = createSignal(false);
const [booted, setBooted] = createSignal(false);
const [cockpitView, setCockpitView] = createSignal<CockpitView>('system');

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
