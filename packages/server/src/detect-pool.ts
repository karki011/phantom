/**
 * detect-pool.ts — Worker thread pool for running detectProject off the main thread.
 * Falls back to inline execution (via setImmediate) if the worker fails to start.
 * @author Subash Karki
 */
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { detectProject } from './project-detector.js';
import type { ProjectProfile } from './project-detector.js';
import type { DetectTaskRequest, DetectTaskResult } from './detect-worker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let worker: Worker | null = null;
const pendingTasks = new Map<string, { resolve: (r: DetectTaskResult) => void; timer: ReturnType<typeof setTimeout> }>();
let taskCounter = 0;

function createWorker(): Worker | null {
  try {
    const w = new Worker(join(__dirname, 'detect-worker.js'));
    w.on('message', (result: DetectTaskResult) => {
      const pending = pendingTasks.get(result.id);
      if (pending) {
        clearTimeout(pending.timer);
        pendingTasks.delete(result.id);
        pending.resolve(result);
      }
    });
    w.on('error', () => { worker = null; });
    w.on('exit', () => { worker = null; });
    return w;
  } catch {
    return null;
  }
}

function getWorker(): Worker | null {
  if (!worker) worker = createWorker();
  return worker;
}

function fallbackInline(request: DetectTaskRequest): Promise<DetectTaskResult> {
  return new Promise((resolve) => {
    setImmediate(() => {
      try {
        const profile = detectProject(request.repoPath);
        resolve({ id: request.id, profile });
      } catch (err) {
        resolve({
          id: request.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  });
}

/**
 * Run detectProject in a worker thread.
 * Falls back to inline execution (via setImmediate) if the worker is unavailable.
 */
export const detectProjectAsync = (repoPath: string): Promise<ProjectProfile> => {
  const id = `detect-${++taskCounter}`;
  const request: DetectTaskRequest = { id, repoPath };

  const w = getWorker();

  const handleResult = (result: DetectTaskResult): ProjectProfile => {
    if (result.error) throw new Error(result.error);
    if (!result.profile) throw new Error(`detectProject returned no profile for ${repoPath}`);
    return result.profile;
  };

  if (!w) {
    return fallbackInline(request).then(handleResult);
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingTasks.delete(id);
      fallbackInline(request).then(handleResult).then(resolve, reject);
    }, 35_000);

    pendingTasks.set(id, {
      resolve: (result) => {
        try {
          resolve(handleResult(result));
        } catch (err) {
          reject(err);
        }
      },
      timer,
    });

    w.postMessage(request);
  });
};

export const shutdownDetectPool = (): void => {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  for (const [, { timer }] of pendingTasks) clearTimeout(timer);
  pendingTasks.clear();
};
