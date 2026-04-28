/**
 * Structured error logger — writes NDJSON entries to ~/.phantom-os/errors.log.
 * Shared by all v1 hooks for observability without disrupting fail-open behavior.
 *
 * @author Subash Karki
 */
import { appendFileSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';

const PHANTOM_DIR = join(process.env.HOME || '', '.phantom-os');
const LOG_PATH = join(PHANTOM_DIR, 'errors.log');

export interface ErrorEntry {
  timestamp: string;
  component: string;
  operation: string;
  error: string;
  context?: string;
}

/**
 * Append a structured error entry to the shared NDJSON error log.
 * Never throws — the error logger must never itself become a source of errors.
 */
export const logError = (component: string, operation: string, error: unknown, context?: string): void => {
  try {
    mkdirSync(PHANTOM_DIR, { recursive: true });
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      component,
      operation,
      error: error instanceof Error ? error.message : String(error),
      ...(context ? { context } : {}),
    });
    appendFileSync(LOG_PATH, entry + '\n');
  } catch {
    /* truly last resort — never throw from error logger */
  }
};

/**
 * Read the last N error entries from the log file.
 * Returns an empty array if the file doesn't exist or can't be read.
 */
export const readRecentErrors = (limit = 50): ErrorEntry[] => {
  try {
    const data = readFileSync(LOG_PATH, 'utf-8');
    const lines = data.split('\n').filter(Boolean);
    const recent = lines.slice(-limit).reverse();
    return recent
      .map((line) => {
        try {
          return JSON.parse(line) as ErrorEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is ErrorEntry => e !== null);
  } catch {
    return [];
  }
};
