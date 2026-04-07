/**
 * PhantomOS Desktop — App Lifecycle
 * Handles app.whenReady, activate, window-all-closed, and quit events.
 * @author Subash Karki
 */
import { app, BrowserWindow } from 'electron';

/**
 * Register Electron lifecycle handlers.
 * @param createWindowFn - Factory function to create the main window
 */
export const registerLifecycle = (createWindowFn: () => void): void => {
  app.whenReady().then(createWindowFn);

  // macOS: re-create window when dock icon clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindowFn();
    }
  });

  // Quit when all windows closed (except macOS)
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
};
