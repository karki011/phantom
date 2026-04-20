/**
 * Electron IPC helpers — shared utilities for Electron-specific operations.
 * @author Subash Karki
 */

export const pickFolder = async (): Promise<string | null> => {
  try {
    const api = window.phantomOS;
    if (api?.invoke) {
      return (await api.invoke('phantom:pick-folder')) as string | null;
    }
    return window.prompt('Enter directory path:');
  } catch {
    return window.prompt('Enter directory path:');
  }
};
