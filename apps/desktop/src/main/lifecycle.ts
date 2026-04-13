/**
 * PhantomOS Desktop — App Lifecycle
 * Handles app.whenReady, activate, window-all-closed, and quit events.
 * @author Subash Karki
 */
import { app, BrowserWindow } from 'electron';
import { getMainWindow } from './window.js';

// ── Shared quit gate ────────────────────────────────────────────────
// Prevents immediate quit until the shutdown ceremony completes.
let _allowQuit = false;
export const allowQuit = (): boolean => _allowQuit;
export const setAllowQuit = (v: boolean): void => { _allowQuit = v; };

/**
 * Register Electron lifecycle handlers.
 * @param createWindowFn - Factory function to create the main window
 */
export const registerLifecycle = (createWindowFn: () => void): void => {
  // Set app name (shown in dock tooltip and menu bar)
  app.setName('PhantomOS');

  app.whenReady().then(createWindowFn);

  // macOS: re-create window when dock icon clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindowFn();
    }
  });

  // Intercept quit — show shutdown ceremony instead of instant exit
  app.on('before-quit', (event) => {
    if (!_allowQuit) {
      event.preventDefault();
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send('phantom:initiate-shutdown');
      }
    }
  });

  // Quit when all windows closed (except macOS)
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      if (_allowQuit) {
        app.quit();
      }
      // If not allowed, the ceremony will handle quit
    }
  });
};
