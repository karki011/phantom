// PhantomOS v2 — Editor type definitions
// Author: Subash Karki

import type * as monaco from 'monaco-editor';

// ---------------------------------------------------------------------------
// File state within an editor pane
// ---------------------------------------------------------------------------

export interface EditorFileState {
  /** Relative path from workspace root */
  filePath: string;
  /** Workspace this file belongs to */
  workspaceId: string;
  /** Monaco language ID (auto-detected from extension) */
  language: string;
  /** Display label (filename) */
  label: string;
  /** Whether the buffer has unsaved modifications */
  dirty: boolean;
  /** Content at last save — used for dirty comparison */
  originalContent: string;
  /** Monaco editor view state for save/restore on tab switch */
  viewState: monaco.editor.ICodeEditorViewState | null;
}

// ---------------------------------------------------------------------------
// Per-pane editor state (stored in Pane.data)
// ---------------------------------------------------------------------------

export interface EditorPaneState {
  /** Ordered list of open file tabs */
  files: EditorFileState[];
  /** Index of the currently active file tab */
  activeFileIndex: number;
  /** Workspace ID this editor pane is bound to */
  workspaceId: string;
}

// ---------------------------------------------------------------------------
// Open File Registry entry (global singleton map)
// ---------------------------------------------------------------------------

export interface OpenFileEntry {
  /** Which editor pane owns this file */
  paneId: string;
  /** Index within that pane's file tab bar */
  tabIndex: number;
  /** Workspace context */
  workspaceId: string;
}

// ---------------------------------------------------------------------------
// Options for opening a file in the editor
// ---------------------------------------------------------------------------

export interface OpenFileOptions {
  workspaceId: string;
  /** Relative path from workspace root */
  filePath: string;
  /** Jump to this line after opening */
  line?: number;
  /** Jump to this column after opening */
  column?: number;
}

// ---------------------------------------------------------------------------
// Diff pane data — passed via addTabWithData('diff', ...)
// ---------------------------------------------------------------------------

export interface DiffPaneData {
  /** Workspace context */
  workspaceId: string;
  /** File path being diffed */
  filePath: string;
  /** Label for the original side (e.g. "HEAD", "Original") */
  originalLabel?: string;
  /** Label for the modified side (e.g. "Working", "Modified") */
  modifiedLabel?: string;
  /** Full content of the original version */
  originalContent: string;
  /** Full content of the modified version */
  modifiedContent: string;
  /** Monaco language ID */
  language?: string;
}
