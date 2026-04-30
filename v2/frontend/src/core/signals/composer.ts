// Phantom — Prompt composer visibility signal
// Author: Subash Karki

import { createSignal, createEffect } from 'solid-js';
import { activePaneId, activeTab, getPaneColor } from '../panes/signals';
import { sessions } from './sessions';

const [composerVisible, setComposerVisible] = createSignal(false);
const [composerTargetSession, setComposerTargetSession] = createSignal<string | null>(null);
const [composerColor, setComposerColor] = createSignal<string | null>(null);

const findActiveSession = (): string | null => {
  const active = sessions().find(
    (s) => s.status === 'active' || s.status === 'paused',
  );
  return active?.id ?? null;
};

export function openComposer(): void {
  const paneId = activePaneId();
  const tab = activeTab();
  const pane = paneId ? tab?.panes[paneId] : undefined;

  if (pane?.kind === 'terminal') {
    setComposerTargetSession(paneId!);
    setComposerColor(getPaneColor(paneId!));
  } else {
    const sessionId = findActiveSession();
    if (!sessionId) return;
    setComposerTargetSession(sessionId);
    setComposerColor(null);
  }

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
// - If new pane is a terminal → re-target
// - If no active pane (e.g. System tab) → keep current target
// - If new pane is non-terminal and no active session → close
createEffect(() => {
  if (!composerVisible()) return;
  const current = activePaneId();

  if (!current) return;

  const tab = activeTab();
  const pane = tab?.panes[current];
  if (pane?.kind === 'terminal') {
    setComposerTargetSession(current);
    setComposerColor(getPaneColor(current));
  }
});

export { composerVisible, composerTargetSession, composerColor };
