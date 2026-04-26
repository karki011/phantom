// PhantomOS v2 — Editor file I/O bindings (Go backend wrappers)
// Author: Subash Karki

import type { BlameLine } from '../types';

const App = () => (window as any).go?.['app']?.App;

/**
 * Read file contents from a workspace.
 * @param workspaceId — workspace/worktree identifier
 * @param relativePath — path relative to workspace root
 */
export const readFileContents = async (workspaceId: string, relativePath: string): Promise<string> => {
  try {
    return (await App()?.ReadFileContents(workspaceId, relativePath)) ?? '';
  } catch (err) {
    console.error('[bindings] readFileContents error:', err);
    return '';
  }
};

/**
 * Write file contents to a workspace.
 * @param workspaceId — workspace/worktree identifier
 * @param relativePath — path relative to workspace root
 * @param content — the full file content to write
 */
export const writeFileContents = async (
  workspaceId: string,
  relativePath: string,
  content: string,
): Promise<boolean> => {
  try {
    await App()?.WriteFileContents(workspaceId, relativePath, content);
    return true;
  } catch (err) {
    console.error('[bindings] writeFileContents error:', err);
    return false;
  }
};

/**
 * Get file content at a specific git revision (e.g. "HEAD", a commit SHA).
 * Wraps `git show <revision>:<relativePath>`.
 * @param workspaceId — workspace/worktree identifier
 * @param relativePath — path relative to workspace root
 * @param revision — git revision (e.g. "HEAD", "HEAD~1", commit SHA)
 */
export const getFileAtRevision = async (
  workspaceId: string,
  relativePath: string,
  revision: string,
): Promise<string> => {
  try {
    return (await App()?.GetFileAtRevision(workspaceId, relativePath, revision)) ?? '';
  } catch {
    return '';
  }
};

/**
 * Get per-line git blame for a file in a workspace.
 * Returns an empty array for untracked files or on error.
 * @param workspaceId — workspace/worktree identifier
 * @param relativePath — path relative to workspace root
 */
export const getWorkspaceBlame = async (
  workspaceId: string,
  relativePath: string,
): Promise<BlameLine[]> => {
  try {
    return (await App()?.GetWorkspaceBlame(workspaceId, relativePath)) ?? [];
  } catch (err) {
    console.error('[bindings] getWorkspaceBlame error:', err);
    return [];
  }
};
