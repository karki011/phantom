/**
 * git-worker.ts — Worker thread for git operations.
 * Receives GitTaskRequest messages, runs git commands, returns results.
 * @author Subash Karki
 */
import { parentPort } from 'node:worker_threads';
import { execFile } from 'node:child_process';

export interface GitTaskRequest {
  id: string;
  op: 'status' | 'diff' | 'log' | 'branch-list' | 'raw';
  repoPath: string;
  args?: string[];
}

export interface GitTaskResult {
  id: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
}

if (parentPort) {
  parentPort.on('message', (msg: GitTaskRequest) => {
    const gitArgs = buildGitArgs(msg);

    execFile('git', gitArgs, { cwd: msg.repoPath, timeout: 30_000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      const result: GitTaskResult = {
        id: msg.id,
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        exitCode: err ? (err as NodeJS.ErrnoException & { code?: number }).code ?? 1 : 0,
      };
      if (err) result.error = err.message;
      parentPort!.postMessage(result);
    });
  });
}

function buildGitArgs(msg: GitTaskRequest): string[] {
  switch (msg.op) {
    case 'status': return ['status', '--porcelain=v1', '-b', '--ahead-behind', ...(msg.args ?? [])];
    case 'diff': return ['diff', ...(msg.args ?? [])];
    case 'log': return ['log', '--oneline', '-20', ...(msg.args ?? [])];
    case 'branch-list': return ['branch', '--list', '-a', ...(msg.args ?? [])];
    case 'raw': return msg.args ?? [];
    default: return msg.args ?? [];
  }
}
