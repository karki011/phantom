// PhantomOS v2 — Unified openFileInEditor function (single entry point)
// Author: Subash Karki
//
// This is the ONLY function that should be used to open files in the editor.
// All entry points (file tree, Quick Open, terminal links, Claude events)
// must route through this function. It enforces single-instance tabs.

import { getOpenFileEntry } from './open-file-registry';
import { addTabWithData, setActivePaneInTab, activeTab } from '@/core/panes/signals';
import type { OpenFileOptions } from './types';

/**
 * Open a file in the editor. If the file is already open in any editor pane,
 * focus the existing tab instead of creating a duplicate.
 *
 * Entry points that call this:
 * - FilesView.tsx (file tree click)
 * - QuickOpen.tsx (file search select)
 * - Terminal error links (Wave 3.4)
 * - Claude file events (Wave 3.1)
 */
export const openFileInEditor = (options: OpenFileOptions): void => {
  const { workspaceId, filePath, line, column } = options;
  const fileName = filePath.split('/').pop() ?? 'Preview';

  // 1. Check if file is already open somewhere
  const existing = getOpenFileEntry(filePath);
  if (existing) {
    setActivePaneInTab(existing.paneId);
    window.dispatchEvent(new CustomEvent('phantom:editor-open-file', {
      detail: { paneId: existing.paneId, workspaceId, filePath, line, column },
    }));
    return;
  }

  // 2. File is NOT open — find an existing editor pane or create a new tab
  const tab = activeTab();
  let targetPaneId: string | undefined;

  // Look for an existing editor pane in the current tab's layout
  if (tab) {
    for (const pane of Object.values(tab.panes)) {
      if (pane.kind === 'editor') {
        targetPaneId = pane.id;
        break;
      }
    }
  }

  if (targetPaneId) {
    // Dispatch event to add a file tab to the existing editor pane
    window.dispatchEvent(new CustomEvent('phantom:editor-open-file', {
      detail: { paneId: targetPaneId, workspaceId, filePath, line, column },
    }));
  } else {
    addTabWithData('editor', 'Editor', {
      workspaceId,
      filePath,
      line: line ?? undefined,
      column: column ?? undefined,
    });
  }
};
