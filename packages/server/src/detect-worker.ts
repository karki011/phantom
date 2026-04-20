/**
 * detect-worker.ts — Worker thread for running detectProject off the main thread.
 * Receives DetectTaskRequest messages, runs detectProject, returns results.
 * @author Subash Karki
 */
import { parentPort } from 'node:worker_threads';
import { detectProject } from './project-detector.js';
import type { ProjectProfile } from './project-detector.js';

export interface DetectTaskRequest {
  id: string;
  repoPath: string;
}

export interface DetectTaskResult {
  id: string;
  profile?: ProjectProfile;
  error?: string;
}

if (parentPort) {
  parentPort.on('message', (msg: DetectTaskRequest) => {
    try {
      const profile = detectProject(msg.repoPath);
      const result: DetectTaskResult = { id: msg.id, profile };
      parentPort!.postMessage(result);
    } catch (err) {
      const result: DetectTaskResult = {
        id: msg.id,
        error: err instanceof Error ? err.message : String(err),
      };
      parentPort!.postMessage(result);
    }
  });
}
