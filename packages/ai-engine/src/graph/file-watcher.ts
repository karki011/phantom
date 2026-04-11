/**
 * FileWatcher — Watches project directories for file changes
 * Feeds changes to IncrementalUpdater for live graph updates
 *
 * @author Subash Karki
 */
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

import { watch, type FSWatcher } from 'chokidar';

import type { EventBus } from '../events/event-bus.js';
import type { IncrementalUpdater } from './incremental.js';

const execAsync = promisify(exec);

/** File extensions considered "source" files worth watching */
const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.json',
]);

/** Directory names to ignore during watching */
const IGNORED_DIR_NAMES = new Set([
  'node_modules', '.git', '.claude', 'dist', 'build', 'coverage',
  '.next', '.turbo', '.cache', '__pycache__',
  '.venv', 'venv', 'target', '.gradle', 'bin', 'obj',
]);

/**
 * Check whether a path contains an ignored directory segment.
 * Works with both absolute and relative paths on any platform.
 */
function isIgnoredPath(filePath: string): boolean {
  const segments = filePath.split(/[/\\]/);
  return segments.some((seg) => IGNORED_DIR_NAMES.has(seg));
}

export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private gitHeadWatcher: FSWatcher | null = null;
  private watching = false;
  private projectId = '';

  constructor(
    private updater: IncrementalUpdater,
    private rootDir: string,
    private eventBus: EventBus,
  ) {
    // Derive projectId from the updater's event context — the updater's projectId
    // will be set by the caller who creates both the updater and watcher together
  }

  /** Set the project ID used in events */
  setProjectId(projectId: string): void {
    this.projectId = projectId;
  }

  /**
   * Start watching the rootDir for source file changes.
   * No-op if already watching.
   */
  start(): void {
    if (this.watching) return;

    try {
      this.watcher = watch(this.rootDir, {
        ignored: (path: string) => isIgnoredPath(path),
        ignoreInitial: true,
        persistent: true,
        awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
      });

      this.watcher.on('add', (path: string) => {
        if (this.isSourceFile(path)) {
          this.updater.queueChange({ path, type: 'add' });
        }
      });

      this.watcher.on('change', (path: string) => {
        if (this.isSourceFile(path)) {
          this.updater.queueChange({ path, type: 'change' });
        }
      });

      this.watcher.on('unlink', (path: string) => {
        if (this.isSourceFile(path)) {
          this.updater.queueChange({ path, type: 'unlink' });
        }
      });

      this.watcher.on('ready', () => {
        this.eventBus.emit({
          type: 'graph:update:complete',
          projectId: this.projectId,
          updatedNodes: 0,
          updatedEdges: 0,
          durationMs: 0,
          timestamp: Date.now(),
        });
      });

      this.watcher.on('error', (error: unknown) => {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn('[FileWatcher] Watcher error:', msg);
      });

      // Watch .git/HEAD for branch switches
      this.startGitHeadWatcher();

      this.watching = true;
    } catch (error) {
      console.warn('[FileWatcher] Failed to start watcher:', (error as Error).message);
    }
  }

  /**
   * Stop watching and clean up.
   * No-op if not watching.
   */
  stop(): void {
    if (!this.watching && !this.watcher && !this.gitHeadWatcher) return;

    if (this.watcher) {
      void this.watcher.close();
      this.watcher = null;
    }

    if (this.gitHeadWatcher) {
      void this.gitHeadWatcher.close();
      this.gitHeadWatcher = null;
    }

    this.watching = false;
  }

  /** Whether the watcher is currently active */
  isWatching(): boolean {
    return this.watching;
  }

  // ---------------------------------------------------------------------------
  // Git branch switch detection
  // ---------------------------------------------------------------------------

  private startGitHeadWatcher(): void {
    const gitHeadPath = `${this.rootDir}/.git/HEAD`;

    try {
      this.gitHeadWatcher = watch(gitHeadPath, {
        ignoreInitial: true,
        persistent: true,
      });

      this.gitHeadWatcher.on('change', () => {
        void this.handleGitBranchSwitch();
      });

      this.gitHeadWatcher.on('error', () => {
        // .git/HEAD may not exist (not a git repo) — silently ignore
      });
    } catch {
      // Not a git repo or .git/HEAD inaccessible — skip
    }
  }

  private async handleGitBranchSwitch(): Promise<void> {
    try {
      const { stdout } = await execAsync('git diff --name-only HEAD@{1} HEAD', {
        cwd: this.rootDir,
      });
      const changedFiles = stdout
        .trim()
        .split('\n')
        .filter((f) => f.length > 0);

      if (changedFiles.length > 0) {
        await this.updater.handleBranchSwitch(changedFiles);
      }
    } catch {
      // git diff failed (e.g., first checkout, shallow clone) — trigger full staleness check
      try {
        await this.updater.checkStaleness();
      } catch {
        console.warn('[FileWatcher] Staleness check failed after branch switch');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private isSourceFile(filePath: string): boolean {
    const dotIdx = filePath.lastIndexOf('.');
    if (dotIdx === -1) return false;
    return SOURCE_EXTENSIONS.has(filePath.slice(dotIdx));
  }
}
