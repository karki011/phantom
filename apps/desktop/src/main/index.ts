/**
 * PhantomOS Desktop — Main Process Entry
 * Boots server, creates window, registers lifecycle handlers.
 * @author Subash Karki
 */
import { app } from 'electron';

import { startServer, stopServer } from './server';
import { createWindow } from './window';
import { registerLifecycle } from './lifecycle';
import { registerIpcHandlers } from './ipc-handlers';

// Register IPC handlers for renderer communication
registerIpcHandlers();

// Boot the API server first, then create the window once it's ready
startServer().then(() => {
  registerLifecycle(createWindow);
});

// Graceful shutdown — stop the server child process
app.on('before-quit', () => {
  console.log('[PhantomOS Desktop] Shutting down...');
  stopServer();
});
