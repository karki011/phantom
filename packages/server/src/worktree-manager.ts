/**
 * PhantomOS Worktree Manager — Git worktree operations
 * @author Subash Karki
 */
import { exec, execSync, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { logger } from './logger.js';
import { runGitTask } from './git-pool.js';

interface WorktreeInfo {
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
  baseBranch?: string,
): Promise<void> => {
  mkdirSync(targetDir, { recursive: true });

  // Pull latest base branch before creating worktree
  const pullTarget = baseBranch ?? 'main';
  try {
    execSync(`git fetch origin "${pullTarget}"`, { cwd: repoPath, stdio: 'pipe', timeout: 15_000 });
  } catch { /* offline is fine — use local state */ }

  // Check if branch already exists
  try {
    execSync(`git rev-parse --verify "${branch}"`, { cwd: repoPath, stdio: 'pipe' });
    // Branch exists — create worktree from it
    execSync(`git worktree add "${targetDir}" "${branch}"`, {
      cwd: repoPath,
      stdio: 'pipe',
    });
  } catch {
    // Branch doesn't exist — create new branch from baseBranch (or HEAD)
    const startPoint = baseBranch ? ` "${baseBranch}"` : '';
    try {
      execSync(`git worktree add -b "${branch}" "${targetDir}"${startPoint}`, {
        cwd: repoPath,
        stdio: 'pipe',
      });
    } catch (innerErr) {
      throw new Error(`Failed to create worktree for branch "${branch}": ${innerErr instanceof Error ? innerErr.message : 'Unknown error'}`);
    }
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
    logger.warn('WorktreeManager', `Failed to remove worktree at ${worktreePath}`);
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

/** Detect the default branch using the git-pool worker thread (non-blocking) */
export const getDefaultBranchAsync = async (repoPath: string): Promise<string> => {
  try {
    // Try symbolic-ref first (works if there's a remote)
    const refResult = await runGitTask('raw', repoPath, ['symbolic-ref', 'refs/remotes/origin/HEAD']);
    if (refResult.exitCode === 0 && refResult.stdout.trim()) {
      return refResult.stdout.trim().replace('refs/remotes/origin/', '');
    }
  } catch { /* fall through */ }

  try {
    // Fallback: check for 'main'
    const mainResult = await runGitTask('raw', repoPath, ['rev-parse', '--verify', 'main']);
    if (mainResult.exitCode === 0) return 'main';
  } catch { /* fall through */ }

  try {
    // Fallback: check for 'master'
    const masterResult = await runGitTask('raw', repoPath, ['rev-parse', '--verify', 'master']);
    if (masterResult.exitCode === 0) return 'master';
  } catch { /* fall through */ }

  return 'main';
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

/** Clone a git repository to targetDir (async — doesn't block server) */
export const cloneRepo = (url: string, targetDir: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    exec(`git clone ${url} ${targetDir}`, {
      timeout: 300_000,
      env: {
        ...process.env,
        // Fail fast if credentials are needed instead of hanging for input
        GIT_TERMINAL_PROMPT: '0',
      },
    }, (err, _stdout, stderr) => {
      if (err) {
        const msg = stderr?.trim() || err.message;
        // Provide a helpful hint for auth failures
        if (msg.includes('Authentication failed') || msg.includes('terminal prompts disabled')) {
          reject(new Error('Authentication required. Use an SSH URL (git@github.com:...) or configure git credentials.'));
        } else {
          reject(new Error(msg));
        }
      } else {
        resolve();
      }
    });
  });
};

/** Checkout a branch in a directory */
export const checkoutBranch = (repoPath: string, branch: string): void => {
  execFileSync('git', ['checkout', branch], {
    cwd: repoPath,
    encoding: 'utf-8',
    timeout: 30_000,
    stdio: 'pipe',
  });
};

/** Create and checkout a new branch */
export const createAndCheckoutBranch = (repoPath: string, branch: string, baseBranch?: string): void => {
  const args = ['checkout', '-b', branch];
  if (baseBranch) args.push(baseBranch);
  execFileSync('git', args, {
    cwd: repoPath,
    encoding: 'utf-8',
    timeout: 30_000,
    stdio: 'pipe',
  });
};

/** Check for uncommitted changes */
export const hasUncommittedChanges = (repoPath: string): { dirty: boolean; changes: string } => {
  const output = execSync('git status --porcelain', {
    cwd: repoPath,
    encoding: 'utf-8',
    stdio: 'pipe',
  }).trim();
  return { dirty: output.length > 0, changes: output };
};
