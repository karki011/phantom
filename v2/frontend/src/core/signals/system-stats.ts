// PhantomOS v2 — System resource stats signals
// Author: Subash Karki

import { createSignal } from 'solid-js';

const App = () => (window as any).go?.['app']?.App;

export interface SystemStats {
  cpu_percent: number;
  mem_used_gb: number;
  mem_total_gb: number;
  battery_percent: number;
  battery_charging: boolean;
}

const defaultStats: SystemStats = {
  cpu_percent: 0,
  mem_used_gb: 0,
  mem_total_gb: 0,
  battery_percent: -1,
  battery_charging: false,
};

export const [systemStats, setSystemStats] =
  createSignal<SystemStats>(defaultStats);

let pollTimer: ReturnType<typeof setInterval> | undefined;

const poll = async (): Promise<void> => {
  try {
    const stats = await App()?.GetSystemStats();
    if (stats) setSystemStats(stats);
  } catch {
    /* backend unavailable — keep last known values */
  }
};

export const startSystemStatsPoll = (): void => {
  if (pollTimer) return;
  void poll();
  pollTimer = setInterval(poll, 3000);
};

export const stopSystemStatsPoll = (): void => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
};
