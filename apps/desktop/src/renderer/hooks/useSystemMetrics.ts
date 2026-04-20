/**
 * useSystemMetrics Hook
 * Polls /system-metrics for live CPU and memory data.
 * Uses timeout to prevent connection pool exhaustion when server is busy.
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

const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS = 4_000;

export const useSystemMetrics = () => {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);

  useEffect(() => {
    let active = true;

    const fetchMetrics = () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      fetch(`${apiBase}/api/system-metrics`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (active && data) setMetrics(data as SystemMetrics);
        })
        .catch(() => {})
        .finally(() => clearTimeout(timeout));
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return metrics;
};
