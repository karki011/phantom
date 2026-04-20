/**
 * useHealthCheck Hook
 * Periodically polls the /health endpoint and exposes connection state.
 * Uses timeout to prevent connection pool exhaustion when server is busy.
 *
 * @author Subash Karki
 */
import { useEffect, useState } from 'react';

const apiBase = (window as any).__PHANTOM_API_BASE ?? '';
const HEALTH_URL = `${apiBase}/health`;
const POLL_INTERVAL_MS = 10_000;
const TIMEOUT_MS = 4_000;

export const useHealthCheck = () => {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let active = true;

    const check = () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      fetch(HEALTH_URL, { signal: controller.signal })
        .then((r) => { if (active) setIsConnected(r.ok); })
        .catch(() => { if (active) setIsConnected(false); })
        .finally(() => clearTimeout(timeout));
    };

    check();
    const interval = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return { isConnected };
};
