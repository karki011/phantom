/**
 * PhantomOS Desktop — Auto Updater
 * Checks GitHub Releases for new versions and downloads them automatically.
 * Updates are installed silently on next app quit.
 * @author Subash Karki
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';

// ── Configuration ──────────────────────────────────────────────────
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// Suppress default OS-level update dialogs — we handle UI in the renderer
autoUpdater.autoRunAppAfterInstall = true;

/** Send a status payload to all open renderer windows. */
const broadcastUpdaterStatus = (payload: { status: string; version?: string; error?: string }): void => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('updater:status', payload);
    }
  }
};

// ── Events ─────────────────────────────────────────────────────────

autoUpdater.on('update-available', (info) => {
  const version = info.version;
  console.log(`[AutoUpdater] Update available: v${version}`);
  broadcastUpdaterStatus({ status: 'downloading', version });
});

autoUpdater.on('update-not-available', () => {
  console.log('[AutoUpdater] No update available.');
});

autoUpdater.on('update-downloaded', (info) => {
  const version = info.version;
  console.log(`[AutoUpdater] Update downloaded: v${version}`);
  broadcastUpdaterStatus({ status: 'ready', version });
});

autoUpdater.on('error', (err) => {
  console.error('[AutoUpdater] Error:', err.message);
  // Don't crash — just log and move on
});

// ── IPC: restart to apply update ───────────────────────────────────
ipcMain.on('updater:restart', () => {
  console.log('[AutoUpdater] User requested restart to install update.');
  autoUpdater.quitAndInstall();
});

// ── Public API ─────────────────────────────────────────────────────

/**
 * Check for updates. Only runs in production builds — skips silently in dev.
 * Safe to call on a timer; errors are caught and logged.
 */
export const checkForUpdates = (): void => {
  if (!app.isPackaged) {
    console.log('[AutoUpdater] Skipping update check in dev mode.');
    return;
  }

  try {
    autoUpdater.checkForUpdates();
  } catch (err) {
    console.error('[AutoUpdater] Failed to check for updates:', err);
  }
};
