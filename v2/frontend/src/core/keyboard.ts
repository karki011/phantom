// PhantomOS v2 — Global keyboard shortcuts
// Author: Subash Karki

import { setActiveTopTab } from './signals/app';
import { setLeftSidebarCollapsed, leftSidebarCollapsed } from './signals/worktrees';
import { setRightSidebarCollapsed, rightSidebarCollapsed } from './signals/files';
import { addTab, splitPane, activePaneId } from './panes/signals';
import { zoomIn, zoomOut, zoomReset } from './signals/zoom';
import { openSettings } from './signals/settings';
import { toggleQuickOpen } from './signals/quickopen';
// TODO(Phase 7h): import { runRecipe } from './bindings'; import { activeWorktreeId } from './signals/app';

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

    // Cmd+Shift+R: Run recipe on active worktree
    // TODO(Phase 7h): open a recipe picker UI, then call runRecipe(activeProjectId, selectedRecipeId)
    if (meta && e.key === 'r' && e.shiftKey) {
      e.preventDefault();
      console.log('[PhantomOS] Run recipe — recipe picker coming in Phase 7h');
      return;
    }

    // Cmd+= or Cmd++: Zoom in
    if (meta && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      zoomIn();
      return;
    }

    // Cmd+-: Zoom out
    if (meta && e.key === '-') {
      e.preventDefault();
      zoomOut();
      return;
    }

    // Cmd+0: Reset zoom
    if (meta && e.key === '0') {
      e.preventDefault();
      zoomReset();
      return;
    }

    // Cmd+,: Open settings
    if (meta && e.key === ',') {
      e.preventDefault();
      openSettings();
      return;
    }

    // Cmd+P: Quick Open file finder
    if (meta && e.key === 'p') {
      e.preventDefault();
      toggleQuickOpen();
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
