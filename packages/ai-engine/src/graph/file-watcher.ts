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
  private usePolling = false;
  private emfileRecoveryTimer: NodeJS.Timeout | null = null;
  private lastErrorLogAt = 0;
  private errorCountSinceLog = 0;
  private errorLogTimer: NodeJS.Timeout | null = null;

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
        // Polling fallback is activated after an EMFILE is observed — it uses
        // far fewer file descriptors at the cost of CPU. Suppresses the error
        // spam during large pulls / new-project adds.
        usePolling: this.usePolling,
        interval: 1000,
        binaryInterval: 2000,
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
        this.handleWatcherError(error);
      });

      // Watch .git/HEAD for branch switches
      this.startGitHeadWatcher();

      this.watching = true;
    } catch (error) {
      console.warn('[FileWatcher] Failed to start watcher:', (error as Error).message);
    }
  }

  /**
   * Handle watcher errors with throttled logging and EMFILE auto-recovery.
   * EMFILE floods during large git pulls or new-project adds — we log once,
   * then swap to polling mode which uses 1 FD instead of N.
   */
  private handleWatcherError(error: unknown): void {
    const msg = error instanceof Error ? error.message : String(error);
    const isEmfile = msg.includes('EMFILE') || msg.includes('ENFILE');

    // Throttle: log at most once per 5s, batch count of suppressed errors
    this.errorCountSinceLog += 1;
    const now = Date.now();
    if (now - this.lastErrorLogAt > 5000) {
      const suppressed = this.errorCountSinceLog - 1;
      const suffix = suppressed > 0 ? ` (+${suppressed} more suppressed)` : '';
      console.warn(`[FileWatcher] Watcher error: ${msg}${suffix}`);
      this.lastErrorLogAt = now;
      this.errorCountSinceLog = 0;
    } else if (!this.errorLogTimer) {
      // Ensure the final batched count is eventually logged
      this.errorLogTimer = setTimeout(() => {
        this.errorLogTimer = null;
        if (this.errorCountSinceLog > 0) {
          console.warn(
            `[FileWatcher] Watcher error batch: ${this.errorCountSinceLog} suppressed in last 5s`,
          );
          this.lastErrorLogAt = Date.now();
          this.errorCountSinceLog = 0;
        }
      }, 5000);
    }

    // On EMFILE, switch to polling — debounced so a burst triggers only one restart
    if (isEmfile && !this.usePolling && !this.emfileRecoveryTimer) {
      this.emfileRecoveryTimer = setTimeout(() => {
        this.emfileRecoveryTimer = null;
        console.warn(
          '[FileWatcher] EMFILE detected — switching to polling mode to reduce file descriptor usage',
        );
        this.usePolling = true;
        this.restart();
      }, 500);
    }
  }

  /** Stop and re-start watcher, preserving projectId and config. */
  private restart(): void {
    if (this.watcher) {
      void this.watcher.close();
      this.watcher = null;
    }
    if (this.gitHeadWatcher) {
      void this.gitHeadWatcher.close();
      this.gitHeadWatcher = null;
    }
    this.watching = false;
    this.start();
  }

  /**
   * Stop watching and clean up.
   * No-op if not watching.
   */
  stop(): void {
    if (this.emfileRecoveryTimer) {
      clearTimeout(this.emfileRecoveryTimer);
      this.emfileRecoveryTimer = null;
    }
    if (this.errorLogTimer) {
      clearTimeout(this.errorLogTimer);
      this.errorLogTimer = null;
    }

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
