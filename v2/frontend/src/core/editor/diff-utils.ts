// Phantom — Diff viewer utilities
// Author: Subash Karki

import { addTabWithData, setActivePaneInTab, tabs, activeTab } from '@/core/panes/signals';
import { detectLanguage } from './language';

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
  } = options;

  const lang = language ?? detectLanguage(filePath);
  const label = filePath.split('/').pop() ?? filePath;

  // Look for an existing diff pane in the current tab
  const tab = activeTab();
  let diffPaneId: string | undefined;

  if (tab) {
    for (const pane of Object.values(tab.panes)) {
      if (pane.kind === 'editor' && pane.data?.originalContent !== undefined) {
        diffPaneId = pane.id;
        break;
      }
    }
  }

  if (diffPaneId) {
    setActivePaneInTab(diffPaneId);
    window.dispatchEvent(new CustomEvent('phantom:diff-open-file', {
      detail: {
        paneId: diffPaneId,
        filePath,
        originalContent,
        modifiedContent,
        originalLabel: originalLabel ?? 'Original',
        modifiedLabel: modifiedLabel ?? 'Modified',
        language: lang,
      },
    }));
  } else {
    addTabWithData('editor', `Diff: ${label}`, {
      workspaceId,
      filePath,
      originalContent,
      modifiedContent,
      originalLabel: originalLabel ?? 'Original',
      modifiedLabel: modifiedLabel ?? 'Modified',
      language: lang,
    });
  }
};
