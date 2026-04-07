/**
 * PhantomOS Workspace Manager — Git worktree operations
 * @author Subash Karki
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';

export interface WorktreeInfo {
  path: string;
  branch: string;
  commit: string;
  isBare: boolean;
}

const WORKTREE_ROOT = join(homedir(), '.phantom-os', 'worktrees');

/** Resolve the worktree directory for a project + branch */
export const getWorktreeDir = (projectName: string, branchName: string): string => {
  // Sanitize names for filesystem safety
  const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeBranch = branchName.replace(/[^a-zA-Z0-9_-]/g, '_');
  return join(WORKTREE_ROOT, safeName, safeBranch);
};

/** Create a new git worktree */
export const createWorktree = async (
  repoPath: string,
  branch: string,
  targetDir: string,
): Promise<void> => {
  mkdirSync(targetDir, { recursive: true });

  // Check if branch exists remotely or locally
  try {
    execSync(`git rev-parse --verify "${branch}"`, { cwd: repoPath, stdio: 'pipe' });
    // Branch exists — create worktree from it
    execSync(`git worktree add "${targetDir}" "${branch}"`, {
      cwd: repoPath,
      stdio: 'pipe',
    });
  } catch {
    // Branch doesn't exist — create new branch from HEAD
    execSync(`git worktree add -b "${branch}" "${targetDir}"`, {
      cwd: repoPath,
      stdio: 'pipe',
    });
  }
};

/** Remove a git worktree */
export const removeWorktree = async (worktreePath: string): Promise<void> => {
  if (!existsSync(worktreePath)) return;

  // Find the main repo from the worktree
  try {
    const mainRepo = execSync('git rev-parse --git-common-dir', {
      cwd: worktreePath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    // Use the main repo's parent to run worktree remove
    const repoRoot = join(mainRepo, '..');
    execSync(`git worktree remove "${worktreePath}" --force`, {
      cwd: repoRoot,
      stdio: 'pipe',
    });
  } catch {
    // Fallback: prune if remove fails
    console.warn(`[WorkspaceManager] Failed to remove worktree at ${worktreePath}`);
  }
};

/** List all worktrees for a repository */
export const listWorktrees = async (repoPath: string): Promise<WorktreeInfo[]> => {
  try {
    const output = execSync('git worktree list --porcelain', {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const worktrees: WorktreeInfo[] = [];
    let current: Partial<WorktreeInfo> = {};

    for (const line of output.split('\n')) {
      if (line.startsWith('worktree ')) {
        if (current.path) worktrees.push(current as WorktreeInfo);
        current = { path: line.slice(9), isBare: false };
      } else if (line.startsWith('HEAD ')) {
        current.commit = line.slice(5);
      } else if (line.startsWith('branch ')) {
        // Strip refs/heads/ prefix
        current.branch = line.slice(7).replace('refs/heads/', '');
      } else if (line === 'bare') {
        current.isBare = true;
      }
    }
    if (current.path) worktrees.push(current as WorktreeInfo);

    return worktrees;
  } catch {
    return [];
  }
};

/** Detect the default branch of a git repository */
export const getDefaultBranch = async (repoPath: string): Promise<string> => {
  try {
    // Try symbolic-ref first (works if there's a remote)
    const ref = execSync('git symbolic-ref refs/remotes/origin/HEAD', {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return ref.replace('refs/remotes/origin/', '');
  } catch {
    // Fallback: check for common branch names
    try {
      execSync('git rev-parse --verify main', {
        cwd: repoPath,
        stdio: 'pipe',
      });
      return 'main';
    } catch {
      try {
        execSync('git rev-parse --verify master', {
          cwd: repoPath,
          stdio: 'pipe',
        });
        return 'master';
      } catch {
        return 'main';
      }
    }
  }
};

/** Check if a path is a valid git repository */
export const isGitRepo = (path: string): boolean => {
  try {
    execSync('git rev-parse --git-dir', {
      cwd: path,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
};

/** Get the repo name from path */
export const getRepoName = (repoPath: string): string => {
  return basename(repoPath);
};
