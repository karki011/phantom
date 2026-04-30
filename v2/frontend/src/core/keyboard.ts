// PhantomOS v2 — Global keyboard shortcuts
// Author: Subash Karki

import { setActiveTopTab } from './signals/app';
import { setLeftSidebarCollapsed, leftSidebarCollapsed } from './signals/worktrees';
import { setRightSidebarCollapsed, rightSidebarCollapsed } from './signals/files';
import { addTab, splitPane, activePaneId } from './panes/signals';
import { zoomIn, zoomOut, zoomReset } from './signals/zoom';
import { openSettings } from './signals/settings';
import { toggleQuickOpen } from './signals/quickopen';
import { toggleComposer } from './signals/composer';
import { toggleCommandPalette } from './signals/command-palette';
import { openRecipePicker } from './signals/recipes';
import { activeSessionId, forkSession } from './signals/sessions';

const HMR_KEY = '__phantom_keyboard_handler';

export function registerKeyboardShortcuts(): () => void {
  // Tear down any previous listener (survives HMR module re-evaluation)
  const prev = (window as any)[HMR_KEY] as ((e: KeyboardEvent) => void) | undefined;
  if (prev) {
    document.removeEventListener('keydown', prev);
    (window as any)[HMR_KEY] = undefined;
  }

  let lastSplitTime = 0;

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
      const now = Date.now();
      if (now - lastSplitTime < 200) return;
      lastSplitTime = now;
      const paneId = activePaneId();
      if (paneId) splitPane(paneId, 'horizontal');
      return;
    }

    // Cmd+\: Split terminal right
    if (meta && e.key === '\\' && !e.shiftKey) {
      e.preventDefault();
      const now = Date.now();
      if (now - lastSplitTime < 200) return;
      lastSplitTime = now;
      const paneId = activePaneId();
      if (paneId) splitPane(paneId, 'vertical');
      return;
    }

    // Cmd+Shift+R: Open recipe picker
    if (meta && e.key === 'r' && e.shiftKey) {
      e.preventDefault();
      openRecipePicker();
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

    // Cmd+I: Toggle prompt composer
    if (meta && e.key === 'i') {
      e.preventDefault();
      toggleComposer();
      return;
    }

    // Cmd+K: Command palette
    if (meta && e.key === 'k') {
      e.preventDefault();
      toggleCommandPalette();
      return;
    }

    // Cmd+Shift+F: Fork active session
    if (meta && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
      const id = activeSessionId();
      if (id) {
        e.preventDefault();
        void forkSession(id, '');
      }
      return;
    }
  }

  (window as any)[HMR_KEY] = handler;
  document.addEventListener('keydown', handler);
  return () => {
    document.removeEventListener('keydown', handler);
    if ((window as any)[HMR_KEY] === handler) (window as any)[HMR_KEY] = undefined;
  };
}
