/**
 * PhantomOS Desktop — Server Bootstrap
 * Runs the Hono API server as a child process.
 * Dev: waits for turbo dev server.
 * Production: uses utilityProcess.fork() for Electron Node ABI + PTY compat.
 * @author Subash Karki
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { app } from 'electron';
import { writeCrashReport } from './crash-reporter.js';

let serverProcess: ChildProcess | null = null;

interface ServerManifest {
  pid: number;
  port: number;
  startedAt: string;
  version: string;
}

const MANIFEST_PATH = join(app.getPath('home'), '.phantom-os', 'server', 'manifest.json');

const getLogPath = () => {
  const logDir = join(app.getPath('home'), '.phantom-os', 'logs');
  mkdirSync(logDir, { recursive: true });
  return join(logDir, 'server.log');
};

const writeLog = (msg: string) => {
  try {
    const ts = new Date().toISOString();
    appendFileSync(getLogPath(), `[${ts}] ${msg}\n`);
  } catch {}
};

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

const tryAdoptServer = async (): Promise<boolean> => {
  try {
    if (!existsSync(MANIFEST_PATH)) return false;
    const manifest: ServerManifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));

    const appVersion = app.getVersion();
    if (manifest.version !== appVersion) {
      console.log(`[PhantomOS Desktop] Manifest version mismatch (${manifest.version} vs ${appVersion}), spawning fresh`);
      rmSync(MANIFEST_PATH, { force: true });
      return false;
    }

    try {
      process.kill(manifest.pid, 0);
    } catch {
      console.log('[PhantomOS Desktop] Manifest PID is dead, removing stale manifest');
      rmSync(MANIFEST_PATH, { force: true });
      return false;
    }

    const healthy = await isServerRunning(manifest.port);
    if (!healthy) {
      console.log('[PhantomOS Desktop] Manifest server not healthy, removing stale manifest');
      rmSync(MANIFEST_PATH, { force: true });
      return false;
    }

    console.log(`[PhantomOS Desktop] Adopted existing server (PID ${manifest.pid}, port ${manifest.port})`);
    writeLog(`Adopted existing server (PID ${manifest.pid}, port ${manifest.port})`);
    return true;
  } catch {
    return false;
  }
};

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

  await app.whenReady();

  // Try to adopt an already-running server from a previous session
  const adopted = await tryAdoptServer();
  if (adopted) return;

  // Use the preload wrapper that hooks Module._resolveFilename for native
  // modules BEFORE the bundled server code runs. Electron ignores NODE_PATH
  // in forked processes, so the preload intercepts require('better-sqlite3')
  // and redirects to app.asar.unpacked/node_modules/.
  const entry = join(process.resourcesPath, 'server-preload.cjs');

  console.log(`[PhantomOS Desktop] Starting API server: ${entry}`);
  writeLog(`Starting API server: ${entry}`);

  // Run via the Electron binary as Node (ELECTRON_RUN_AS_NODE) rather than
  // utilityProcess.fork. utilityProcess spawns a sandboxed child where
  // posix_spawn (used by node-pty's spawn-helper) is blocked — terminals
  // fail with "posix_spawnp failed". A plain child_process keeps Electron's
  // Node ABI (so better-sqlite3/node-pty load) without the sandbox.
  serverProcess = spawn(process.execPath, [entry], {
    cwd: app.getPath('home'),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
    },
  });

  const stderrBuffer: string[] = [];

  serverProcess.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    process.stdout.write(text);
    writeLog(`[stdout] ${text.trimEnd()}`);
  });
  serverProcess.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    process.stderr.write(text);
    writeLog(`[stderr] ${text.trimEnd()}`);
    stderrBuffer.push(text.trimEnd());
  });

  serverProcess.on('exit', (code) => {
    const msg = `Server process exited with code ${code}`;
    console.log(`[PhantomOS Desktop] ${msg}`);
    writeLog(msg);
    if (code !== 0 && code !== null) {
      const reportPath = writeCrashReport(code, stderrBuffer);
      writeLog(`Crash report written to: ${reportPath}`);
    }
    serverProcess = null;
  });

  try {
    await waitForServer(3849);
    console.log('[PhantomOS Desktop] API server is ready');
    writeLog('API server is ready on port 3849');
  } catch (err) {
    const msg = (err as Error).message;
    console.error('[PhantomOS Desktop]', msg);
    writeLog(`FAILED: ${msg}`);
    writeLog(`Diagnostic log saved to: ${getLogPath()}`);
  }
};

export const stopServer = (): void => {
  try { rmSync(MANIFEST_PATH, { force: true }); } catch {}
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
};
