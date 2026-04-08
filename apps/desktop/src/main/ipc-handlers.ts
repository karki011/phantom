/**
 * PhantomOS Desktop — IPC Handlers
 * Registers main-process IPC handlers for renderer communication.
 * Future: theme switching, settings, direct Hono calls bypassing HTTP.
 * @author Subash Karki
 */
import { ipcMain, dialog, shell, BrowserWindow } from 'electron';

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
};
