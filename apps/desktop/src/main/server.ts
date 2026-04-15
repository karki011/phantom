/**
 * PhantomOS Desktop — Server Bootstrap
 * Runs the Hono API server as a child process.
 * Dev: waits for turbo dev server.
 * Production: uses utilityProcess.fork() for Electron Node ABI + PTY compat.
 * @author Subash Karki
 */
import { type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { app, utilityProcess, type UtilityProcess } from 'electron';

let serverProcess: ChildProcess | UtilityProcess | null = null;

/** Poll the health endpoint until the server responds */
const waitForServer = (port: number, maxWaitMs = 15000): Promise<void> =>
  new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      fetch(`http://localhost:${port}/health`)
        .then((r) => {
          if (r.ok) resolve();
          else setTimeout(check, 300);
        })
        .catch(() => {
          if (Date.now() - start > maxWaitMs) {
            reject(new Error(`API server not ready after ${maxWaitMs}ms`));
          } else {
            setTimeout(check, 300);
          }
        });
    };
    check();
  });

/** Check if the server is already running on the given port */
const isServerRunning = async (port: number): Promise<boolean> => {
  try {
    const r = await fetch(`http://localhost:${port}/health`);
    return r.ok;
  } catch {
    return false;
  }
};

/**
 * Wait for an external server (e.g. turbo dev) to become reachable.
 */
const waitForExternalServer = (
  port: number,
  maxWaitMs = 5000,
  intervalMs = 400,
): Promise<boolean> =>
  new Promise((resolve) => {
    const start = Date.now();
    const poll = () => {
      isServerRunning(port).then((up) => {
        if (up) return resolve(true);
        if (Date.now() - start > maxWaitMs) return resolve(false);
        setTimeout(poll, intervalMs);
      });
    };
    poll();
  });

/** Start the API server and wait for it to be ready */
export const startServer = async (): Promise<void> => {
  if (!app.isPackaged) {
    console.log('[PhantomOS Desktop] Dev mode — waiting for turbo server on :3849');
    const ready = await waitForExternalServer(3849, 30_000, 500);
    if (ready) {
      console.log('[PhantomOS Desktop] API server is ready (turbo)');
    } else {
      console.error('[PhantomOS Desktop] Turbo server did not start within 30s');
    }
    return;
  }

  // PRODUCTION: wait for app ready (utilityProcess requires it)
  await app.whenReady();

  // Use the preload wrapper that hooks Module._resolveFilename for native
  // modules BEFORE the bundled server code runs. Electron's utilityProcess
  // ignores NODE_PATH, so the preload intercepts require('better-sqlite3')
  // and redirects to app.asar.unpacked/node_modules/.
  const entry = join(process.resourcesPath, 'server-preload.cjs');

  console.log(`[PhantomOS Desktop] Starting API server: ${entry}`);

  serverProcess = utilityProcess.fork(entry, [], {
    cwd: app.getPath('home'),
    stdio: 'pipe',
  });

  serverProcess.stdout?.on('data', (chunk: Buffer) => {
    process.stdout.write(chunk.toString());
  });
  serverProcess.stderr?.on('data', (chunk: Buffer) => {
    process.stderr.write(chunk.toString());
  });

  serverProcess.on('exit', (code) => {
    console.log(`[PhantomOS Desktop] Server process exited with code ${code}`);
    serverProcess = null;
  });

  try {
    await waitForServer(3849);
    console.log('[PhantomOS Desktop] API server is ready');
  } catch (err) {
    console.error('[PhantomOS Desktop]', (err as Error).message);
  }
};

export const stopServer = (): void => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
};
