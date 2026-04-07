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

/** Start the API server and wait for it to be ready */
export const startServer = async (): Promise<void> => {
  const entry = app.isPackaged
    ? join(process.resourcesPath, 'server', 'index.js')
    : join(monoRoot, 'packages', 'server', 'src', 'index.ts');

  const cmd = app.isPackaged ? 'node' : 'npx';
  const args = app.isPackaged ? [entry] : ['tsx', entry];

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
