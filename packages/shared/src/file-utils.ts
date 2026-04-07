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

export const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    // Verify it's actually a Claude/node process, not a recycled PID
    try {
      const name = execSync(`ps -p ${pid} -o comm=`, { encoding: 'utf-8' }).trim();
      return name.includes('claude') || name.includes('node');
    } catch {
      return true; // If ps fails, fall back to PID-only check
    }
  } catch {
    return false;
  }
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
