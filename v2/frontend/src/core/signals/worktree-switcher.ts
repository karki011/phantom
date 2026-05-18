// Author: Subash Karki

import { createSignal } from 'solid-js';
import { liveWorktrees } from './live-sessions';
import { selectWorktree } from './worktrees';
import { switchWorkspace } from '../panes/signals';
import { setActiveTopTab } from './app';

const [visible, setVisible] = createSignal(false);
const [selectedIndex, setSelectedIndex] = createSignal(0);

export const switcherVisible = visible;
export const switcherSelectedIndex = selectedIndex;

export const openSwitcher = (): void => {
  const live = liveWorktrees();
  if (live.length < 2) return;
  setSelectedIndex(1);
  setVisible(true);
};

export const closeSwitcher = (): void => {
  setVisible(false);
  setSelectedIndex(0);
};

export const advanceSwitcher = (delta: number): void => {
  const len = liveWorktrees().length;
  if (len === 0) return;
  setSelectedIndex((prev) => ((prev + delta) % len + len) % len);
};

export const commitSwitcher = (): void => {
  const live = liveWorktrees();
  const idx = selectedIndex();
  if (idx >= 0 && idx < live.length) {
    const worktreeId = live[idx].worktreeId;
    selectWorktree(worktreeId);
    switchWorkspace(worktreeId);
    setActiveTopTab('worktree');
  }
  closeSwitcher();
};

// For direct click on a card at a specific index
export const commitSwitcherAt = (index: number): void => {
  setSelectedIndex(index);
  commitSwitcher();
};
