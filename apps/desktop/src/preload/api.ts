/**
 * PhantomOS Desktop — Preload API
 * Defines the PhantomOS bridge object exposed to the renderer.
 * @author Subash Karki
 */
import { ipcRenderer } from 'electron';

export const phantomAPI = {
  platform: process.platform,
  isDesktop: true,

  /** Invoke a main-process handler and await the result. */
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> =>
    ipcRenderer.invoke(channel, ...args),

  /** Listen for events from the main process. */
  on: (channel: string, callback: (...args: unknown[]) => void): void => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  },

  // --- File watching (real-time file tree invalidation) ---

  /** Start watching a directory for file system changes (recursive). */
  watchDirectory: (rootPath: string): Promise<unknown> =>
    ipcRenderer.invoke('phantom:watch-directory', rootPath),

  /** Stop watching a directory. */
  unwatchDirectory: (rootPath: string): Promise<unknown> =>
    ipcRenderer.invoke('phantom:unwatch-directory', rootPath),

  /**
   * Subscribe to file system change events from the main process.
   * Returns an unsubscribe function.
   */
  onFsChange: (callback: (data: { rootPath: string; dir: string; fileCount: number }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { rootPath: string; dir: string; fileCount: number }) =>
      callback(data);
    ipcRenderer.on('phantom:fs-change', handler);
    return () => ipcRenderer.removeListener('phantom:fs-change', handler);
  },
};
