/**
 * PhantomOS Process Registry
 * In-memory tracker for running processes spawned by recipe buttons.
 * @author Subash Karki
 */
import { logger } from './logger.js';

export interface RunningProcess {
  termId: string;
  worktreeId: string;
  projectId: string;
  recipe: string;
  recipeLabel: string;
  category: string;
  port: number | null;
  pid: number | null;
  startedAt: number;
}

type Broadcast = (event: string, data: unknown) => void;

const registry = new Map<string, RunningProcess>();
let broadcastFn: Broadcast | null = null;

/** Initialize with SSE broadcast function — call once at server startup */
export const initProcessRegistry = (broadcast: Broadcast): void => {
  broadcastFn = broadcast;
};

/** Register a running process */
export const registerProcess = (process: RunningProcess): void => {
  registry.set(process.termId, process);
  logger.info('ProcessRegistry', `Registered: ${process.recipeLabel} (${process.recipe}) on port ${process.port ?? 'none'}`);
  broadcastFn?.('server:start', process);
};

/** Unregister a process (terminal closed or stopped) */
export const unregisterProcess = (termId: string): void => {
  const process = registry.get(termId);
  if (!process) return;
  registry.delete(termId);
  logger.info('ProcessRegistry', `Unregistered: ${process.recipeLabel} (termId=${termId})`);
  broadcastFn?.('server:stop', { termId, worktreeId: process.worktreeId });
};

/** Get all running processes, optionally filtered by worktreeId */
export const getProcesses = (worktreeId?: string): RunningProcess[] => {
  const all = Array.from(registry.values());
  return worktreeId ? all.filter((p) => p.worktreeId === worktreeId) : all;
};

/** Lookup a single process by terminal ID */
export const getProcessByTermId = (termId: string): RunningProcess | undefined =>
  registry.get(termId);
