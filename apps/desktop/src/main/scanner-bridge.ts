/**
 * Scanner Bridge — manages the utilityProcess worker for heavy file scanning.
 *
 * The worker is lazily spawned on first request and automatically respawns if it exits.
 * All requests get a 30-second timeout to prevent hanging if the worker stalls.
 *
 * @author Subash Karki
 */
import { utilityProcess } from 'electron';
import { join } from 'node:path';

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

let scannerWorker: Electron.UtilityProcess | null = null;
const pendingRequests = new Map<string, PendingRequest>();

const WORKER_TIMEOUT_MS = 30_000;

/**
 * Returns the scanner worker, spawning it if needed.
 * The worker script path resolves to the compiled JS in the same output directory.
 */
function getScannerWorker(): Electron.UtilityProcess {
  if (!scannerWorker) {
    const workerPath = join(__dirname, 'scanner-worker.js');
    scannerWorker = utilityProcess.fork(workerPath);

    scannerWorker.on('message', (msg: { id: string; result?: unknown; error?: string }) => {
      const pending = pendingRequests.get(msg.id);
      if (!pending) return;

      pendingRequests.delete(msg.id);
      clearTimeout(pending.timer);

      if (msg.error) {
        pending.reject(new Error(msg.error));
      } else {
        pending.resolve(msg.result);
      }
    });

    scannerWorker.on('exit', (code) => {
      console.warn(`[scanner-bridge] Worker exited with code ${code}`);
      // Reject all pending requests — the worker is gone
      for (const [id, pending] of pendingRequests) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`Scanner worker exited unexpectedly (code ${code})`));
        pendingRequests.delete(id);
      }
      scannerWorker = null;
    });
  }
  return scannerWorker;
}

/**
 * Send a request to the scanner worker and wait for the response.
 * @param type - The scan operation to perform
 * @param payload - Arguments for the operation (e.g. { repoPath })
 * @returns The result from the worker
 */
export function workerRequest(
  type: 'read-types' | 'scan-source-files' | 'read-tsconfig',
  payload: Record<string, unknown>,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const timer = setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`Scanner worker timeout after ${WORKER_TIMEOUT_MS}ms: ${type}`));
      }
    }, WORKER_TIMEOUT_MS);

    pendingRequests.set(id, { resolve, reject, timer });

    try {
      getScannerWorker().postMessage({ id, type, payload });
    } catch (err) {
      pendingRequests.delete(id);
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/**
 * Gracefully shut down the scanner worker.
 * Called during app quit to clean up the child process.
 */
export function shutdownScannerWorker(): void {
  if (scannerWorker) {
    try {
      scannerWorker.kill();
    } catch { /* already dead */ }
    scannerWorker = null;
  }
  // Clean up any remaining pending requests
  for (const [id, pending] of pendingRequests) {
    clearTimeout(pending.timer);
    pending.reject(new Error('Scanner worker shutting down'));
    pendingRequests.delete(id);
  }
}
