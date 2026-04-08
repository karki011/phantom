/**
 * PhantomOS Desktop — IPC Handlers
 * Registers main-process IPC handlers for renderer communication.
 * Future: theme switching, settings, direct Hono calls bypassing HTTP.
 * @author Subash Karki
 */
import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Register all IPC handlers. Call once during app init. */
export const registerIpcHandlers = (): void => {
  ipcMain.handle('phantom:ping', () => {
    return { status: 'ok', timestamp: Date.now() };
  });

  /** Open native folder picker, returns selected path or null */
  ipcMain.handle('phantom:pick-folder', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win!, {
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
};
