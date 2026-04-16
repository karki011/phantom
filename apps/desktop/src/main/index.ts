/**
 * PhantomOS Desktop — Main Process Entry
 * Boots server, creates window, registers lifecycle handlers.
 * @author Subash Karki
 */
import { app } from 'electron';

import { startServer, stopServer } from './server';
import { createWindow } from './window';
import { registerLifecycle, allowQuit } from './lifecycle';
import { registerIpcHandlers } from './ipc-handlers';
import { shutdownScannerWorker } from './scanner-bridge';

// Set app name immediately — before anything else so macOS dock shows "PhantomOS"
app.setName('PhantomOS');

// Register IPC handlers for renderer communication
registerIpcHandlers();

// Boot the API server, then create the window once ready.
// Terminal daemon is disabled — direct PTY (node-pty) is used instead.
startServer().then(() => {
  registerLifecycle(createWindow);
});

// Graceful shutdown — stop the server only when ceremony has completed
app.on('before-quit', () => {
  if (allowQuit()) {
    console.log('[PhantomOS Desktop] Shutting down server...');
    shutdownScannerWorker();
    stopServer();
    // In dev mode, electron-vite/turbo keep running after Electron exits.
    // Send SIGTERM to parent process (electron-vite) which cascades to turbo.
    setTimeout(() => {
      try {
        const ppid = process.ppid;
        if (ppid && ppid > 1) process.kill(ppid, 'SIGTERM');
      } catch { /* ignore — production has no dev parent */ }
      process.exit(0);
    }, 500);
  }
});
