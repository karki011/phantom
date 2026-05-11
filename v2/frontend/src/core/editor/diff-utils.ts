// Phantom — Diff viewer utilities
// Author: Subash Karki
//
// Helpers for opening file diffs in dedicated pane tabs.
// All diff-related entry points should route through showFileDiff().

import { addTabWithData, setActivePaneInTab, tabs } from '@/core/panes/signals';
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

  // Only reuse an existing entry if it's already open as a diff in the editor.
  // If the file is open in a regular EditorPane (Files tab / Cmd+P), we still
  // want to open a new diff tab — clicking from the Changes list should always
  // show the diff.
  const existing = getOpenFileEntry(filePath);
  if (existing) {
    const owningTab = tabs().find((t) => existing.paneId in t.panes);
    const existingPane = owningTab?.panes[existing.paneId];
    if (existingPane?.kind === 'editor' && existingPane.data?.originalContent !== undefined) {
      setActivePaneInTab(existing.paneId);
      return;
    }
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

  const paneId = addTabWithData('editor', label, data);
  if (paneId) {
    registerOpenFile(filePath, { paneId, tabIndex: 0, workspaceId });
  }
};
