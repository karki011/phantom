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
};
