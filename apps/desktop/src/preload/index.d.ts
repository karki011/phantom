import type { ElectronAPI } from '@electron-toolkit/preload';

declare global {
  interface Window {
    electron: ElectronAPI;
    phantomOS?: {
      platform: string;
      isDesktop: boolean;
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
      on: (channel: string, callback: (...args: unknown[]) => void) => void;
      watchDirectory: (rootPath: string) => Promise<unknown>;
      unwatchDirectory: (rootPath: string) => Promise<unknown>;
      onFsChange: (callback: (data: { rootPath: string; dir: string; fileCount: number }) => void) => () => void;
      onUpdaterStatus: (callback: (data: { status: string; version?: string; error?: string }) => void) => () => void;
      restartToUpdate: () => void;
    };
  }
}
