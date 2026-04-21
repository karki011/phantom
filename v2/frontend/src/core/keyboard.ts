// PhantomOS v2 — Global keyboard shortcuts
// Author: Subash Karki

import { setActiveTopTab } from './signals/app';
import { setLeftSidebarCollapsed, leftSidebarCollapsed } from './signals/worktrees';
import { setRightSidebarCollapsed, rightSidebarCollapsed } from './signals/files';
import { addTab, splitPane, activePaneId } from './panes/signals';

export function registerKeyboardShortcuts(): () => void {
  function handler(e: KeyboardEvent): void {
    const meta = e.metaKey || e.ctrlKey;

    // Cmd+1: System tab
    if (meta && e.key === '1') {
      e.preventDefault();
      setActiveTopTab('system');
      return;
    }

    // Cmd+2: Worktree tab
    if (meta && e.key === '2') {
      e.preventDefault();
      setActiveTopTab('worktree');
      return;
    }

    // Cmd+Shift+B: Toggle right sidebar (must come before Cmd+B)
    if (meta && e.key === 'b' && e.shiftKey) {
      e.preventDefault();
      setRightSidebarCollapsed(!rightSidebarCollapsed());
      return;
    }

    // Cmd+B: Toggle left sidebar
    if (meta && e.key === 'b' && !e.shiftKey) {
      e.preventDefault();
      setLeftSidebarCollapsed(!leftSidebarCollapsed());
      return;
    }

    // Cmd+T: New terminal tab
    if (meta && e.key === 't') {
      e.preventDefault();
      addTab('terminal');
      return;
    }

    // Cmd+Shift+\: Split terminal down (must come before Cmd+\)
    if (meta && e.key === '\\' && e.shiftKey) {
      e.preventDefault();
      const paneId = activePaneId();
      if (paneId) splitPane(paneId, 'horizontal');
      return;
    }

    // Cmd+\: Split terminal right
    if (meta && e.key === '\\' && !e.shiftKey) {
      e.preventDefault();
      const paneId = activePaneId();
      if (paneId) splitPane(paneId, 'vertical');
      return;
    }

    // Cmd+K: Command palette (placeholder)
    if (meta && e.key === 'k') {
      e.preventDefault();
      console.log('[PhantomOS] Command palette — coming in Phase 7h');
      return;
    }
  }

  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}
