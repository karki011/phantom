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

/** Start the API server and wait for it to be ready */
export const startServer = async (): Promise<void> => {
  // Skip spawning if a server is already running (e.g. turbo dev started it)
  if (await isServerRunning(3849)) {
    console.log('[PhantomOS Desktop] API server already running on :3849, reusing');
    return;
  }

  const entry = app.isPackaged
    ? join(process.resourcesPath, 'server', 'index.js')
    : join(monoRoot, 'packages', 'server', 'src', 'index.ts');

  // Use tsx (Node + TypeScript) for the server because better-sqlite3 doesn't
  // support the Bun runtime yet. Bun is used for package management only.
  const tsxBin = join(monoRoot, 'node_modules', '.bin', 'tsx');
  const cmd = app.isPackaged ? 'node' : tsxBin;
  const args = app.isPackaged ? [entry] : [entry];

  console.log(`[PhantomOS Desktop] Starting API server: ${cmd} ${args.join(' ')}`);

  serverProcess = spawn(cmd, args, {
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

  // Wait for the server to be ready before returning
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
