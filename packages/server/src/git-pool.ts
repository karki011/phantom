/**
 * git-pool.ts — Worker pool for git operations with inline fallback.
 * @author Subash Karki
 */
import { Worker } from 'node:worker_threads';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { GitTaskRequest, GitTaskResult } from './git-worker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let worker: Worker | null = null;
const pendingTasks = new Map<string, { resolve: (r: GitTaskResult) => void; timer: ReturnType<typeof setTimeout> }>();
let taskCounter = 0;

function createWorker(): Worker | null {
  try {
    const w = new Worker(join(__dirname, 'git-worker.js'));
    w.on('message', (result: GitTaskResult) => {
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

function fallbackExec(request: GitTaskRequest): Promise<GitTaskResult> {
  return new Promise((resolve) => {
    const args = request.args ?? [];
    execFile('git', args, { cwd: request.repoPath, timeout: 30_000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({
        id: request.id,
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        exitCode: err ? 1 : 0,
        error: err?.message,
      });
    });
  });
}

export const runGitTask = (op: GitTaskRequest['op'], repoPath: string, args?: string[]): Promise<GitTaskResult> => {
  const id = `git-${++taskCounter}`;
  const request: GitTaskRequest = { id, op, repoPath, args };

  const w = getWorker();
  if (!w) return fallbackExec(request);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingTasks.delete(id);
      fallbackExec(request).then(resolve);
    }, 35_000);

    pendingTasks.set(id, { resolve, timer });
    w.postMessage(request);
  });
};

export const shutdownGitPool = (): void => {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  for (const [, { timer }] of pendingTasks) clearTimeout(timer);
  pendingTasks.clear();
};
