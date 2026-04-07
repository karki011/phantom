/**
 * PhantomOS Desktop — Main Process Entry
 * Boots server, creates window, registers lifecycle handlers.
 * @author Subash Karki
 */
import { app } from 'electron';

import { startServer, stopServer, ensureTerminalDaemon } from './server';
import { createWindow } from './window';
import { registerLifecycle } from './lifecycle';
import { registerIpcHandlers } from './ipc-handlers';

// Register IPC handlers for renderer communication
registerIpcHandlers();

// Boot the terminal daemon first (persistent, survives restarts),
// then the API server, then create the window once everything is ready.
ensureTerminalDaemon()
  .catch((err) => console.warn('[PhantomOS Desktop] Daemon start warning:', err))
  .then(() => startServer())
  .then(() => {
    registerLifecycle(createWindow);
  });

// Graceful shutdown — stop the server child process
app.on('before-quit', () => {
  console.log('[PhantomOS Desktop] Shutting down...');
  stopServer();
});
