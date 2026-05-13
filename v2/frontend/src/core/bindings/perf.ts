// Author: Subash Karki

const App = () => (window as any).go?.['app']?.App;

export interface PerfSnapshot {
  count: number;
  min_ns: number;
  max_ns: number;
  mean_ns: number;
  p50_ns: number;
  p95_ns: number;
  p99_ns: number;
}

export interface PerfReport {
  boot_duration_ns: number;
  git_status: PerfSnapshot;
  project_switch: PerfSnapshot;
  sidebar_refresh: PerfSnapshot;
  mem_rss_bytes: number;
  heap_alloc_bytes: number;
  goroutine_count: number;
  worktree_count: number;
}

export interface PerfTargetCheck {
  target: string;
  actual: string;
  met: boolean;
}

export async function getPerfReport(): Promise<PerfReport | null> {
  try {
    return (await App()?.PerfReport()) ?? null;
  } catch {
    return null;
  }
}

export async function getPerfTargets(): Promise<Record<string, PerfTargetCheck> | null> {
  try {
    return (await App()?.PerfTargets()) ?? null;
  } catch {
    return null;
  }
}

export function nsToMs(ns: number): number {
  return ns / 1_000_000;
}

export function formatDuration(ns: number): string {
  if (ns < 1_000) return `${ns}ns`;
  if (ns < 1_000_000) return `${(ns / 1_000).toFixed(1)}µs`;
  if (ns < 1_000_000_000) return `${(ns / 1_000_000).toFixed(1)}ms`;
  return `${(ns / 1_000_000_000).toFixed(2)}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}
