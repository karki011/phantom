/**
 * PhantomOS Desktop — Server Bootstrap
 * Runs the Hono API server as a child process using system Node.js
 * so native modules (better-sqlite3) work without Electron V8 conflicts.
 * @author Subash Karki
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { app } from 'electron';

let serverProcess: ChildProcess | null = null;

/** Monorepo root (two levels up from apps/desktop/) */
const monoRoot = join(__dirname, '..', '..', '..', '..');

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
 * Returns true if the server appeared within the deadline, false otherwise.
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
    // DEV MODE: turbo always starts the server — just wait for it.
    // Never spawn our own to avoid dual-process races and duplicate
    // GraphEngine instances writing to the same SQLite.
    console.log('[PhantomOS Desktop] Dev mode — waiting for turbo server on :3849');
    const ready = await waitForExternalServer(3849, 30_000, 500);
    if (ready) {
      console.log('[PhantomOS Desktop] API server is ready (turbo)');
    } else {
      console.error('[PhantomOS Desktop] Turbo server did not start within 30s');
    }
    return;
  }

  // PRODUCTION: Electron owns the server — spawn it as a child process.
  const entry = join(process.resourcesPath, 'server', 'index.js');

  console.log(`[PhantomOS Desktop] Starting API server: node ${entry}`);

  serverProcess = spawn('node', [entry], {
    cwd: monoRoot,
    env: { ...process.env },
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  serverProcess.on('error', (err) => {
    console.error('[PhantomOS Desktop] Server process error:', err.message);
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
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
};

// === DISABLED (M4): Terminal daemon — needs output routing rewrite ===
// ensureTerminalDaemon, isDaemonRunning, DAEMON_PID_FILE removed.
// Recover from git history when M4 terminal daemon work resumes.
