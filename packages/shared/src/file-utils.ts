/**
 * PhantomOS File Utilities
 * @author Subash Karki
 */
import { readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { basename } from 'node:path';

export const safeReadJson = <T>(path: string): T | null => {
  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const safeReadDir = (dir: string): string[] => {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
};

/**
 * Batch-check multiple PIDs in a single `ps` call.
 * Returns the set of PIDs that are currently alive.
 */
export function getAlivePids(pids: number[]): Set<number> {
  if (pids.length === 0) return new Set();
  try {
    const output = execSync('ps -p ' + pids.join(',') + ' -o pid=', {
      timeout: 3000,
      encoding: 'utf-8',
    });
    return new Set(
      output
        .trim()
        .split('\n')
        .map((s: string) => parseInt(s.trim(), 10))
        .filter((n: number) => !isNaN(n)),
    );
  } catch {
    return new Set();
  }
}

// Cached alive-PID set, refreshed every 5 seconds
let _alivePidCache: Set<number> = new Set();
let _alivePidCacheTs = 0;
const ALIVE_PID_CACHE_TTL = 5000; // 5 seconds

/** Refresh the alive-PID cache if stale */
const refreshAlivePidCache = (pid: number): void => {
  const now = Date.now();
  if (now - _alivePidCacheTs > ALIVE_PID_CACHE_TTL) {
    // Collect all PIDs we might care about — at minimum the one being checked
    _alivePidCache = getAlivePids([pid]);
    _alivePidCacheTs = now;
  }
};

export const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    // Use cached batch check instead of individual ps calls
    refreshAlivePidCache(pid);
    return _alivePidCache.has(pid);
  } catch {
    return false;
  }
};

/**
 * Pre-warm the alive PID cache with a batch of PIDs.
 * Call this before iterating sessions to avoid per-PID ps calls.
 */
export const prewarmAlivePidCache = (pids: number[]): void => {
  _alivePidCache = getAlivePids(pids);
  _alivePidCacheTs = Date.now();
};

export const extractRepoName = (cwd: string): string => basename(cwd);

export const parseCrew = (
  subject: string,
): { crew: string | null; cleanSubject: string } => {
  const match = subject.match(/^\[([^\]]+)\]\s*(.*)/);
  if (match) {
    return { crew: match[1], cleanSubject: match[2] };
  }
  return { crew: null, cleanSubject: subject };
};
