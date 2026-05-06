// Author: Subash Karki

import { createSignal } from 'solid-js';
import { mruWorktrees } from './worktree-mru';
import { selectWorktree } from './worktrees';
import { switchWorkspace } from '../panes/signals';
import { setActiveTopTab } from './app';

const [visible, setVisible] = createSignal(false);
const [selectedIndex, setSelectedIndex] = createSignal(0);

export const switcherVisible = visible;
export const switcherSelectedIndex = selectedIndex;

export const openSwitcher = (): void => {
  const mru = mruWorktrees();
  if (mru.length < 2) return; // need at least 2 to switch
  setSelectedIndex(1); // start at second item (first after current)
  setVisible(true);
};

export const closeSwitcher = (): void => {
  setVisible(false);
  setSelectedIndex(0);
};

export const advanceSwitcher = (delta: number): void => {
  const len = mruWorktrees().length;
  if (len === 0) return;
  setSelectedIndex((prev) => ((prev + delta) % len + len) % len);
};

export const commitSwitcher = (): void => {
  const mru = mruWorktrees();
  const idx = selectedIndex();
  if (idx >= 0 && idx < mru.length) {
    const worktreeId = mru[idx];
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
