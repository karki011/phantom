// Phantom — Global keyboard shortcuts
// Author: Subash Karki

import { setActiveTopTab } from './signals/app';
import { setLeftSidebarCollapsed, leftSidebarCollapsed } from './signals/worktrees';
import { setRightSidebarCollapsed, rightSidebarCollapsed } from './signals/files';
import { addTab, splitPane, activePaneId, tabs, activeTab, setActiveTab, removeTab, setActivePaneInTab } from './panes/signals';
import { getLayoutPaneIds } from './panes/layout-utils';
import { zoomIn, zoomOut, zoomReset } from './signals/zoom';
import { openSettings } from './signals/settings';
import { toggleQuickOpen } from './signals/quickopen';
import { toggleComposer } from './signals/composer';
import { toggleComposerDrawer } from './composer/signals';
import { toggleCommandPalette } from './signals/command-palette';
import { openRecipePicker } from './signals/recipes';
import { toggleShortcutSheet } from './signals/shortcut-sheet';

import { switcherVisible, openSwitcher, closeSwitcher, advanceSwitcher, commitSwitcher } from './signals/worktree-switcher';
import { goBack, goForward } from './signals/navigation';
import { toggleSearchPanel } from './signals/search-panel';

const HMR_KEY = '__phantom_keyboard_handler';
const HMR_KEYUP_KEY = '__phantom_keyboard_keyup_handler';

export function registerKeyboardShortcuts(): () => void {
  // Tear down any previous listeners (survives HMR module re-evaluation)
  const prev = (window as any)[HMR_KEY] as ((e: KeyboardEvent) => void) | undefined;
  if (prev) {
    document.removeEventListener('keydown', prev);
    (window as any)[HMR_KEY] = undefined;
  }
  const prevKeyup = (window as any)[HMR_KEYUP_KEY] as ((e: KeyboardEvent) => void) | undefined;
  if (prevKeyup) {
    document.removeEventListener('keyup', prevKeyup);
    (window as any)[HMR_KEYUP_KEY] = undefined;
  }

  let lastSplitTime = 0;

  function handler(e: KeyboardEvent): void {
    const meta = e.metaKey || e.ctrlKey;

    // Ctrl+Tab: Open/advance worktree switcher (Ctrl only — macOS captures Cmd+Tab)
    if (e.ctrlKey && e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      if (!switcherVisible()) {
        openSwitcher();
      } else {
        advanceSwitcher(1);
      }
      return;
    }

    // Ctrl+Shift+Tab: Reverse in worktree switcher
    if (e.ctrlKey && e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      if (!switcherVisible()) {
        openSwitcher();
        advanceSwitcher(-1);
      } else {
        advanceSwitcher(-1);
      }
      return;
    }

    // Escape: Close switcher (before other Escape handlers)
    if (e.key === 'Escape' && switcherVisible()) {
      e.preventDefault();
      closeSwitcher();
      return;
    }

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

    // Cmd+J: Toggle composer V2 drawer
    if (meta && e.key === 'j') {
      e.preventDefault();
      toggleComposerDrawer();
      return;
    }

    // Cmd+K: Command palette
    if (meta && e.key === 'k') {
      e.preventDefault();
      toggleCommandPalette();
      return;
    }

    // Cmd+/: Keyboard shortcut sheet
    if (meta && e.key === '/') {
      e.preventDefault();
      toggleShortcutSheet();
      return;
    }

    // Cmd+Shift+F: Search file contents
    if (meta && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
      e.preventDefault();
      toggleSearchPanel();
      return;
    }

    // Cmd+Shift+]: Next tab (must come before Cmd+])
    if (meta && e.shiftKey && e.key === ']') {
      e.preventDefault();
      const t = tabs();
      const current = activeTab();
      if (!current) return;
      const idx = t.findIndex((tab) => tab.id === current.id);
      if (idx < t.length - 1) setActiveTab(t[idx + 1].id);
      return;
    }

    // Cmd+Shift+[: Previous tab (must come before Cmd+[)
    if (meta && e.shiftKey && e.key === '[') {
      e.preventDefault();
      const t = tabs();
      const current = activeTab();
      if (!current) return;
      const idx = t.findIndex((tab) => tab.id === current.id);
      if (idx > 0) setActiveTab(t[idx - 1].id);
      return;
    }

    // Cmd+W: Close active tab
    if (meta && e.key === 'w') {
      e.preventDefault();
      const current = activeTab();
      if (current) removeTab(current.id);
      return;
    }

    // Cmd+Option+Left/Right: Cycle pane focus
    if (meta && e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const tab = activeTab();
      if (!tab) return;
      const paneIds = getLayoutPaneIds(tab.layout);
      if (paneIds.length < 2) return;
      const currentIdx = paneIds.indexOf(tab.activePaneId);
      const delta = e.key === 'ArrowRight' ? 1 : -1;
      const next = ((currentIdx + delta) % paneIds.length + paneIds.length) % paneIds.length;
      setActivePaneInTab(paneIds[next]);
      return;
    }

    // Cmd+]: Navigation forward (non-Shift, non-Alt only)
    if (meta && !e.shiftKey && !e.altKey && e.key === ']') {
      e.preventDefault();
      goForward();
      return;
    }

    // Cmd+[: Navigation back (non-Shift, non-Alt only)
    if (meta && !e.shiftKey && !e.altKey && e.key === '[') {
      e.preventDefault();
      goBack();
      return;
    }
  }

  function keyupHandler(e: KeyboardEvent): void {
    if ((e.key === 'Meta' || e.key === 'Control') && switcherVisible()) {
      commitSwitcher();
    }
  }

  (window as any)[HMR_KEY] = handler;
  (window as any)[HMR_KEYUP_KEY] = keyupHandler;
  document.addEventListener('keydown', handler);
  document.addEventListener('keyup', keyupHandler);
  return () => {
    document.removeEventListener('keydown', handler);
    document.removeEventListener('keyup', keyupHandler);
    if ((window as any)[HMR_KEY] === handler) (window as any)[HMR_KEY] = undefined;
    if ((window as any)[HMR_KEYUP_KEY] === keyupHandler) (window as any)[HMR_KEYUP_KEY] = undefined;
  };
}
