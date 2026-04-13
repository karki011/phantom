/**
 * useSystemMetrics Hook
 * Polls /system-metrics for live CPU and memory data.
 *
 * @author Subash Karki
 */
import { useEffect, useState } from 'react';

const apiBase = (window as any).__PHANTOM_API_BASE ?? '';

export interface TopProcess {
  name: string;
  memMB: number;
  pid: number;
}

export interface SystemMetrics {
  cpu: { usage: number; cores: number };
  memory: { used: number; total: number; usedPercent: number };
  swap: { used: number; total: number };
  loadAvg: number[];
  topProcesses: TopProcess[];
}

const POLL_INTERVAL_MS = 3_000;

export const useSystemMetrics = () => {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);

  useEffect(() => {
    const fetchMetrics = () =>
      fetch(`${apiBase}/api/system-metrics`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) setMetrics(data as SystemMetrics);
        })
        .catch(() => {});

    fetchMetrics();
    const interval = setInterval(fetchMetrics, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return metrics;
};
