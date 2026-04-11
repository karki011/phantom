/**
 * useSystemMetrics Hook
 * Polls /system-metrics for live CPU and memory data.
 *
 * @author Subash Karki
 */
import { useEffect, useState } from 'react';

export interface SystemMetrics {
  cpu: { usage: number; cores: number };
  memory: { used: number; total: number; usedPercent: number };
  loadAvg: number[];
}

const POLL_INTERVAL_MS = 3_000;

export const useSystemMetrics = () => {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);

  useEffect(() => {
    const fetchMetrics = () =>
      fetch('/api/system-metrics')
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
