// PhantomOS v2 — Prompt composer visibility signal
// Author: Subash Karki

import { createSignal, createEffect } from 'solid-js';
import { activePaneId, activeTab, getPaneColor } from '../panes/signals';

const [composerVisible, setComposerVisible] = createSignal(false);
const [composerTargetSession, setComposerTargetSession] = createSignal<string | null>(null);
const [composerColor, setComposerColor] = createSignal<string | null>(null);

export function openComposer(): void {
  const paneId = activePaneId();
  if (!paneId) return;

  const tab = activeTab();
  const pane = tab?.panes[paneId];
  if (!pane || pane.kind !== 'terminal') return;

  setComposerTargetSession(paneId);
  setComposerColor(getPaneColor(paneId));
  setComposerVisible(true);
}

export function closeComposer(): void {
  setComposerVisible(false);
  setComposerTargetSession(null);
  setComposerColor(null);
}

export function toggleComposer(): void {
  if (composerVisible()) {
    closeComposer();
  } else {
    openComposer();
  }
}

export function setComposerTarget(paneId: string): void {
  setComposerTargetSession(paneId);
  setComposerColor(getPaneColor(paneId));
}

// When active pane changes while composer is open:
// - If new pane is a terminal → re-target (don't close)
// - If new pane is NOT a terminal → close
createEffect(() => {
  if (!composerVisible()) return;
  const current = activePaneId();
  if (!current) return;

  const tab = activeTab();
  const pane = tab?.panes[current];
  if (pane?.kind === 'terminal') {
    setComposerTargetSession(current);
    setComposerColor(getPaneColor(current));
  } else {
    closeComposer();
  }
});

export { composerVisible, composerTargetSession, composerColor };
