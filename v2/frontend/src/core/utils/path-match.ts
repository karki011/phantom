// Author: Subash Karki

/**
 * Checks if two filesystem paths belong to the same project context.
 * Handles the repo-root vs worktree-path mismatch where:
 * - Session cwd might be: /Users/foo/repo
 * - Terminal cwd might be: /Users/foo/.phantom-os/worktrees/repo/branch
 * Returns true if either path is a prefix of the other.
 */
export function cwdMatchesBidirectional(pathA: string | null | undefined, pathB: string | null | undefined): boolean {
  if (!pathA || !pathB) return false;
  return (
    pathA === pathB ||
    pathA.startsWith(pathB + '/') ||
    pathB.startsWith(pathA + '/')
  );
}
