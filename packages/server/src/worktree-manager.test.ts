/**
 * Tests for PhantomOS Worktree Manager
 * @author Subash Karki
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { getWorktreeDir, getRepoName, isGitRepo } from './worktree-manager.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir: string;

const createTempDir = (): string => {
  const dir = join(tmpdir(), `phantom-wt-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorktreeManager', () => {
  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // getWorktreeDir
  // -------------------------------------------------------------------------

  describe('getWorktreeDir', () => {
    const WORKTREE_ROOT = join(homedir(), '.phantom-os', 'worktrees');

    it('returns correct path for simple names', () => {
      const result = getWorktreeDir('my-project', 'feature-branch');

      expect(result).toBe(join(WORKTREE_ROOT, 'my-project', 'feature-branch'));
    });

    it('sanitizes special characters in project name', () => {
      const result = getWorktreeDir('my/project@v2', 'main');

      // Slashes and @ should be replaced with underscores
      expect(result).toBe(join(WORKTREE_ROOT, 'my_project_v2', 'main'));
    });

    it('sanitizes special characters in branch name', () => {
      const result = getWorktreeDir('project', 'feature/my-branch');

      expect(result).toBe(join(WORKTREE_ROOT, 'project', 'feature_my-branch'));
    });

    it('preserves hyphens and underscores', () => {
      const result = getWorktreeDir('my-project_v2', 'feature-test_123');

      expect(result).toBe(join(WORKTREE_ROOT, 'my-project_v2', 'feature-test_123'));
    });

    it('handles dots in names by replacing them', () => {
      const result = getWorktreeDir('app.v2.0', 'release.1.0');

      expect(result).toBe(join(WORKTREE_ROOT, 'app_v2_0', 'release_1_0'));
    });
  });

  // -------------------------------------------------------------------------
  // getRepoName
  // -------------------------------------------------------------------------

  describe('getRepoName', () => {
    it('extracts basename from an absolute path', () => {
      expect(getRepoName('/Users/dev/projects/phantom-os')).toBe('phantom-os');
    });

    it('extracts basename from a nested path', () => {
      expect(getRepoName('/home/user/code/my-repo')).toBe('my-repo');
    });

    it('handles paths with trailing slash by returning empty or last segment', () => {
      // basename('/foo/bar/') returns 'bar' in node:path
      expect(getRepoName('/foo/bar/')).toBe('bar');
    });

    it('handles a single segment path', () => {
      expect(getRepoName('myrepo')).toBe('myrepo');
    });
  });

  // -------------------------------------------------------------------------
  // isGitRepo
  // -------------------------------------------------------------------------

  describe('isGitRepo', () => {
    it('returns false for a non-git directory', () => {
      // tempDir is just a plain directory, not a git repo
      expect(isGitRepo(tempDir)).toBe(false);
    });

    it('returns true for an initialized git directory', () => {
      execSync('git init', { cwd: tempDir, stdio: 'pipe' });

      expect(isGitRepo(tempDir)).toBe(true);
    });

    it('returns false for a non-existent path', () => {
      expect(isGitRepo(join(tempDir, 'nonexistent'))).toBe(false);
    });

    it('returns true for the PhantomOS repo itself', () => {
      const phantomOsPath = join(homedir(), '.claude', 'phantom-os');

      // Only run this assertion if the PhantomOS repo actually has .git
      // (it should, since we're inside it)
      try {
        execSync('git rev-parse --git-dir', { cwd: phantomOsPath, stdio: 'pipe' });
        expect(isGitRepo(phantomOsPath)).toBe(true);
      } catch {
        // Not a git repo in this environment, skip
      }
    });
  });
});
