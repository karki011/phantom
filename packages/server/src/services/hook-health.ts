/**
 * Hook Health Monitor — lightweight health tracking for Claude Code hooks
 *
 * Hooks report success/error via POST /api/hook-health/report.
 * Dashboard reads via GET /api/hook-health.
 *
 * @author Subash Karki
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

const HEALTH_PATH = join(homedir(), '.phantom-os', 'hook-health.json');

interface HookHealthEntry {
  lastSuccess: string; // ISO timestamp
  lastError?: string;
  consecutiveFailures: number;
  totalRuns: number;
}

export interface HookHealth {
  [hookName: string]: HookHealthEntry;
}

const loadHealth = (): HookHealth => {
  try {
    if (existsSync(HEALTH_PATH)) {
      return JSON.parse(readFileSync(HEALTH_PATH, 'utf-8'));
    }
  } catch { /* corrupted file — start fresh */ }
  return {};
};

const saveHealth = (health: HookHealth): void => {
  const dir = dirname(HEALTH_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(HEALTH_PATH, JSON.stringify(health, null, 2));
};

export const reportHookSuccess = (hookName: string): void => {
  try {
    const health = loadHealth();
    health[hookName] = {
      ...health[hookName],
      lastSuccess: new Date().toISOString(),
      consecutiveFailures: 0,
      totalRuns: (health[hookName]?.totalRuns ?? 0) + 1,
    };
    saveHealth(health);
  } catch { /* never block hook execution */ }
};

export const reportHookError = (hookName: string, error: string): void => {
  try {
    const health = loadHealth();
    const existing = health[hookName] ?? { lastSuccess: '', consecutiveFailures: 0, totalRuns: 0 };
    health[hookName] = {
      ...existing,
      lastError: error,
      consecutiveFailures: existing.consecutiveFailures + 1,
      totalRuns: existing.totalRuns + 1,
    };
    saveHealth(health);
  } catch { /* never block hook execution */ }
};

export const getHookHealth = (): HookHealth => loadHealth();
