// PhantomOS v2 — Diff viewer utilities
// Author: Subash Karki
//
// Helpers for opening file diffs in dedicated pane tabs.
// All diff-related entry points should route through showFileDiff().

import { addTabWithData, setActivePaneInTab } from '@/core/panes/signals';
import { getOpenFileEntry, registerOpenFile } from './open-file-registry';
import { detectLanguage } from './language';
import type { DiffPaneData } from './types';

/**
 * Open a dedicated diff pane tab comparing two versions of a file.
 * If the file is already open (in any pane), focus that tab instead.
 */
export const showFileDiff = (options: {
  workspaceId: string;
  filePath: string;
  originalContent: string;
  modifiedContent: string;
  originalLabel?: string;
  modifiedLabel?: string;
  language?: string;
  readOnly?: boolean;
}): void => {
  const {
    workspaceId,
    filePath,
    originalContent,
    modifiedContent,
    originalLabel,
    modifiedLabel,
    language,
    readOnly,
  } = options;

  const existing = getOpenFileEntry(filePath);
  if (existing) {
    setActivePaneInTab(existing.paneId);
    return;
  }

  const label = `Diff: ${filePath.split('/').pop() ?? filePath}`;
  const lang = language ?? detectLanguage(filePath);

  const data: DiffPaneData & Record<string, unknown> = {
    workspaceId,
    filePath,
    originalContent,
    modifiedContent,
    originalLabel: originalLabel ?? 'Original',
    modifiedLabel: modifiedLabel ?? 'Modified',
    language: lang,
    readOnly: readOnly ?? false,
  };

  const paneId = addTabWithData('diff', label, data);
  if (paneId) {
    registerOpenFile(filePath, { paneId, tabIndex: 0, workspaceId });
  }
};
