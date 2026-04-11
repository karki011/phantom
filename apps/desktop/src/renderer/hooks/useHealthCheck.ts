/**
 * useHealthCheck Hook
 * Periodically polls the /health endpoint and exposes connection state.
 * Shows stale-data warning when the backend is unreachable.
 *
 * @author Subash Karki
 */
import { useEffect, useState } from 'react';

const HEALTH_URL = '/health';
const POLL_INTERVAL_MS = 10_000;

export const useHealthCheck = () => {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const check = () =>
      fetch(HEALTH_URL)
        .then((r) => setIsConnected(r.ok))
        .catch(() => setIsConnected(false));

    // Initial check
    check();

    const interval = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return { isConnected };
};
