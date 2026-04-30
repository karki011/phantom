// Phantom — File explorer and git changes signals
// Author: Subash Karki

import { createSignal, createMemo } from 'solid-js';

// Types
export interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
  gitStatus?: string; // 'M' | 'A' | 'D' | '?' | ''
  expanded?: boolean;
}

export interface GitChange {
  path: string;
  status: string; // 'modified' | 'added' | 'deleted' | 'untracked'
  staged: boolean;
}

export interface CommitEntry {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  timestamp: number;
}

// File tree (lazy-loaded per directory)
const [fileTree, setFileTree] = createSignal<FileNode[]>([]);
const [selectedFile, setSelectedFile] = createSignal<string | null>(null);

// Reveal-in-tree: set to a relative file path to auto-expand parents and scroll into view.
// Consumed by FileTreeItem — cleared automatically after reveal completes.
const [revealFilePath, setRevealFilePath] = createSignal<string | null>(null);

// Git changes
const [gitChanges, setGitChanges] = createSignal<GitChange[]>([]);
const [commitMessage, setCommitMessage] = createSignal('');

// Derived staged/unstaged
const stagedChanges = createMemo(() => gitChanges().filter((c) => c.staged));
const unstagedChanges = createMemo(() => gitChanges().filter((c) => !c.staged));

// Activity
const [recentCommits, setRecentCommits] = createSignal<CommitEntry[]>([]);

// Tab badge counts (updated by each view on data load)
const [filesCount, setFilesCount] = createSignal(0);
const [changesCount, setChangesCount] = createSignal(0);
const activityCount = createMemo(() => recentCommits().length);

// Right sidebar UI state
const [rightSidebarWidth, setRightSidebarWidth] = createSignal(300);
const [rightSidebarCollapsed, setRightSidebarCollapsed] = createSignal(false);
// True while the user is dragging the resize handle — used to pause the
// collapse/expand width animation so per-pixel drag doesn't ease.
const [isRightResizing, setIsRightResizing] = createSignal(false);
const [rightSidebarTab, setRightSidebarTab] = createSignal<'files' | 'changes' | 'alerts' | 'activity'>('files');

export {
  fileTree,
  setFileTree,
  selectedFile,
  setSelectedFile,
  revealFilePath,
  setRevealFilePath,
  gitChanges,
  setGitChanges,
  commitMessage,
  setCommitMessage,
  stagedChanges,
  unstagedChanges,
  recentCommits,
  setRecentCommits,
  rightSidebarWidth,
  setRightSidebarWidth,
  rightSidebarCollapsed,
  setRightSidebarCollapsed,
  isRightResizing,
  setIsRightResizing,
  rightSidebarTab,
  setRightSidebarTab,
  filesCount,
  setFilesCount,
  changesCount,
  setChangesCount,
  activityCount,
};
