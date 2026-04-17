/**
 * PhantomOS Desktop — IPC Handlers
 * Registers main-process IPC handlers for renderer communication.
 * Future: theme switching, settings, direct Hono calls bypassing HTTP.
 * @author Subash Karki
 */
import { app, ipcMain, dialog, shell, BrowserWindow } from 'electron';
import { setAllowQuit } from './lifecycle.js';
import { workerRequest } from './scanner-bridge.js';
import { execFile } from 'node:child_process';
import { watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { dirname } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Register all IPC handlers. Call once during app init. */
export const registerIpcHandlers = (): void => {
  ipcMain.handle('phantom:ping', () => {
    return { status: 'ok', timestamp: Date.now() };
  });

  /** Open native folder picker, returns selected path or null */
  ipcMain.handle('phantom:pick-folder', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Select Repository Folder',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  /** Open a path in macOS Finder */
  ipcMain.handle('phantom:open-in-finder', (_e, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  /** Open a path in the default editor */
  ipcMain.handle('phantom:open-in-editor', (_e, filePath: string) => {
    shell.openPath(filePath);
  });

  /** Return basic git status for a workspace path */
  ipcMain.handle('phantom:git-status', async (_e, repoPath: string) => {
    try {
      const { stdout } = await execFileAsync('git', [
        '-C', repoPath,
        'status', '--porcelain=v1', '-b', '--ahead-behind',
      ], { timeout: 5000 });

      const lines = stdout.split('\n').filter(Boolean);
      const branchLine = lines[0] ?? '';

      // Parse branch: ## main...origin/main [ahead 11]
      const branchMatch = branchLine.match(/^## (.+?)(?:\.\.\.(\S+))?(?:\s+\[(.+)])?$/);
      const branch = branchMatch?.[1] ?? 'unknown';
      const tracking = branchMatch?.[2] ?? null;
      const aheadBehind = branchMatch?.[3] ?? '';

      const aheadMatch = aheadBehind.match(/ahead (\d+)/);
      const behindMatch = aheadBehind.match(/behind (\d+)/);
      const ahead = aheadMatch ? Number(aheadMatch[1]) : 0;
      const behind = behindMatch ? Number(behindMatch[1]) : 0;

      // Count file statuses
      const files = lines.slice(1);
      let staged = 0;
      let modified = 0;
      let untracked = 0;
      for (const f of files) {
        const x = f[0]; // index status
        const y = f[1]; // worktree status
        if (x === '?') { untracked++; continue; }
        if (x !== ' ' && x !== '?') staged++;
        if (y !== ' ' && y !== '?') modified++;
      }

      return { branch, tracking, ahead, behind, staged, modified, untracked };
    } catch {
      return null;
    }
  });

  /** Read and parse tsconfig.json — delegated to utilityProcess worker */
  ipcMain.handle('phantom:read-tsconfig', async (_e, repoPath: string) => {
    try {
      return await workerRequest('read-tsconfig', { repoPath });
    } catch {
      return null;
    }
  });

  /** Scan node_modules/@types and dependency types — delegated to utilityProcess worker */
  ipcMain.handle('phantom:read-types', async (_e, repoPath: string) => {
    try {
      return await workerRequest('read-types', { repoPath });
    } catch {
      return [];
    }
  });

  /** Scan workspace source files for Monaco — delegated to utilityProcess worker */
  ipcMain.handle('phantom:scan-source-files', async (_e, repoPath: string) => {
    try {
      return await workerRequest('scan-source-files', { repoPath });
    } catch {
      return [];
    }
  });

  /** Set app-wide zoom factor */
  ipcMain.handle('phantom:set-zoom', (_e, factor: number) => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (win) win.webContents.setZoomFactor(factor);
  });

  /** Toggle full-screen mode on the main window */
  ipcMain.handle('phantom:set-fullscreen', (_e, enabled: boolean) => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (win) win.setFullScreen(enabled);
  });

  // ---------------------------------------------------------------
  // File watching for real-time file tree invalidation (macOS FSEvents)
  // ---------------------------------------------------------------
  const activeWatchers = new Map<string, FSWatcher>();

  // Debounce fs.watch events — batch per directory over 500ms
  const pendingChanges = new Map<string, Set<string>>();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  function flushPendingChanges(): void {
    flushTimer = null;
    const changes = Array.from(pendingChanges.entries());
    pendingChanges.clear();
    for (const [compositeKey, files] of changes) {
      const sepIdx = compositeKey.indexOf('\0');
      const rp = compositeKey.slice(0, sepIdx);
      const d = compositeKey.slice(sepIdx + 1);
      for (const wc of BrowserWindow.getAllWindows().map(w => w.webContents)) {
        wc.send('phantom:fs-change', { rootPath: rp, dir: d, fileCount: files.size });
      }
    }
  }

  function queueFsChange(rootPath: string, dir: string, filename: string): void {
    const key = `${rootPath}\0${dir}`;
    if (!pendingChanges.has(key)) pendingChanges.set(key, new Set());
    pendingChanges.get(key)!.add(filename);

    if (!flushTimer) {
      flushTimer = setTimeout(flushPendingChanges, 500);
    }
  }

  ipcMain.handle('phantom:watch-directory', (_event, rootPath: string) => {
    if (activeWatchers.has(rootPath)) return { ok: true };

    try {
      const watcher = watch(rootPath, { recursive: true }, (_eventType, filename) => {
        if (!filename) return;
        const isGitRef = filename.startsWith('.git/refs/') || filename.startsWith('.git\\refs\\');
        if (isGitRef) {
          queueFsChange(rootPath, '.git/refs', filename);
          return;
        }
        if (filename.startsWith('.git/') || filename.startsWith('.git\\')) return;
        const dir = dirname(filename);
        queueFsChange(rootPath, dir === '.' ? '/' : dir, filename);
      });

      watcher.on('error', () => {
        watcher.close();
        activeWatchers.delete(rootPath);
      });

      activeWatchers.set(rootPath, watcher);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle('phantom:unwatch-directory', (_event, rootPath: string) => {
    const watcher = activeWatchers.get(rootPath);
    if (watcher) {
      watcher.close();
      activeWatchers.delete(rootPath);
    }
    return { ok: true };
  });

  /** Read server logs — returns the last N lines of ~/.phantom-os/logs/server.log */
  ipcMain.handle('phantom:get-server-logs', (_e, maxLines = 200) => {
    try {
      const logPath = join(app.getPath('home'), '.phantom-os', 'logs', 'server.log');
      if (!existsSync(logPath)) return { lines: [], path: logPath };
      const content = readFileSync(logPath, 'utf-8');
      const allLines = content.split('\n').filter(Boolean);
      const lines = allLines.slice(-maxLines);
      return { lines, path: logPath };
    } catch {
      return { lines: [], path: '' };
    }
  });

  /** Read structured crash reports */
  ipcMain.handle('phantom:get-crash-reports', () => {
    try {
      const crashDir = join(app.getPath('home'), '.phantom-os', 'logs', 'crashes');
      if (!existsSync(crashDir)) return [];
      return readdirSync(crashDir)
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, 10)
        .map(f => {
          try {
            return JSON.parse(readFileSync(join(crashDir, f), 'utf-8'));
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  });

  /** Clear all crash reports */
  ipcMain.handle('phantom:clear-crash-reports', () => {
    try {
      const crashDir = join(app.getPath('home'), '.phantom-os', 'logs', 'crashes');
      if (!existsSync(crashDir)) return { cleared: 0 };
      const { rmSync } = require('fs');
      const files = readdirSync(crashDir).filter(f => f.endsWith('.json'));
      for (const f of files) {
        try { rmSync(join(crashDir, f)); } catch {}
      }
      return { cleared: files.length };
    } catch {
      return { cleared: 0 };
    }
  });

  /** Quit the app — called by shutdown ceremony after cleanup completes */
  ipcMain.handle('phantom:quit', () => {
    setAllowQuit(true);
    app.quit();
  });
};
