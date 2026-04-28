/**
 * Hook Health Routes — GET /hook-health and POST /hook-health/report
 * @author Subash Karki
 */
import { Hono } from 'hono';
import { getHookHealth, reportHookSuccess, reportHookError } from '../services/hook-health.js';
import { logger } from '../logger.js';

export const hookHealthRoutes = new Hono();

/** GET /hook-health — returns health data for all hooks */
hookHealthRoutes.get('/hook-health', (c) => {
  return c.json(getHookHealth());
});

/** POST /hook-health/report — hooks report their status here */
hookHealthRoutes.post('/hook-health/report', async (c) => {
  const body = await c.req.json<{ hook: string; status: 'success' | 'error'; error?: string }>();
  const { hook, status, error } = body;

  if (!hook || !status) {
    return c.json({ error: 'Missing hook or status' }, 400);
  }

  if (status === 'success') {
    reportHookSuccess(hook);
    logger.info('AI Engine', `🧠 Hook fired: ${hook} ✓`);
  } else {
    reportHookError(hook, error ?? 'unknown error');
    logger.warn('AI Engine', `🧠 Hook failed: ${hook} — ${error ?? 'unknown'}`);
  }

  return c.json({ ok: true });
});
