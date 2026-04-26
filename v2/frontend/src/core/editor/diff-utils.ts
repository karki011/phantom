// PhantomOS v2 — Diff viewer utilities
// Author: Subash Karki
//
// Helpers for opening file diffs in dedicated pane tabs.
// All diff-related entry points should route through showFileDiff().

import { addTabWithData } from '@/core/panes/signals';
import { detectLanguage } from './language';
import type { DiffPaneData } from './types';

/**
 * Open a dedicated diff pane tab comparing two versions of a file.
 *
 * Entry points that call this:
 * - EditorPane "Review Changes" mode (when exiting inline to standalone)
 * - Git changes view (comparing working tree to HEAD)
 * - Claude file events (showing before/after of AI edits)
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

  addTabWithData('diff', label, data);
};
