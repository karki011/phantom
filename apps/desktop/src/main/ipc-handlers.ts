/**
 * PhantomOS Desktop — IPC Handlers
 * Registers main-process IPC handlers for renderer communication.
 * Future: theme switching, settings, direct Hono calls bypassing HTTP.
 * @author Subash Karki
 */
import { ipcMain } from 'electron';

/** Register all IPC handlers. Call once during app init. */
export const registerIpcHandlers = (): void => {
  ipcMain.handle('phantom:ping', () => {
    return { status: 'ok', timestamp: Date.now() };
  });

  // Future handlers:
  // ipcMain.handle('phantom:get-settings', () => { ... });
  // ipcMain.handle('phantom:set-theme', (_e, theme) => { ... });
};
