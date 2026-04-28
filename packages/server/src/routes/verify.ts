/**
 * Verification API Routes — execution-based outcome verification
 *
 * POST /verify/queue   — Queue a verification (debounced 5s after last edit)
 * GET  /verify/latest  — Get the latest verification result
 * POST /verify/run     — Run verification now (manual trigger)
 * GET  /verify/status  — Check if verification is running
 *
 * @author Subash Karki
 */
import { Hono } from 'hono';
import {
  findProjectRoot,
  getLatestResult,
  isVerificationRunning,
  queueVerification,
  verify,
} from '../services/execution-verifier.js';
import { logger } from '../logger.js';

export const verifyRoutes = new Hono();

/** POST /verify/queue — Queue a verification after a file edit (debounced) */
verifyRoutes.post('/verify/queue', async (c) => {
  try {
    const { filePath } = await c.req.json<{ filePath: string; timestamp?: number }>();

    if (!filePath) {
      return c.json({ error: 'filePath is required' }, 400);
    }

    const projectRoot = findProjectRoot(filePath);
    if (!projectRoot) {
      return c.json({ status: 'skipped', reason: 'no project root detected' });
    }

    queueVerification(projectRoot);
    return c.json({ status: 'queued', projectRoot });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to queue verification';
    logger.error('VerifyRoutes', message);
    return c.json({ error: message }, 500);
  }
});

/** GET /verify/latest — Get the latest verification result */
verifyRoutes.get('/verify/latest', (c) => {
  const result = getLatestResult();

  if (!result) {
    return c.json({ status: 'none', message: 'No verification has been run yet' });
  }

  return c.json(result);
});

/** POST /verify/run — Run verification now (manual trigger, bypasses debounce) */
verifyRoutes.post('/verify/run', async (c) => {
  try {
    const { projectRoot } = await c.req.json<{ projectRoot: string }>();

    if (!projectRoot) {
      return c.json({ error: 'projectRoot is required' }, 400);
    }

    if (isVerificationRunning()) {
      return c.json({ status: 'already_running', message: 'A verification is already in progress' });
    }

    const result = await verify(projectRoot);
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Verification failed';
    logger.error('VerifyRoutes', message);
    return c.json({ error: message }, 500);
  }
});

/** GET /verify/status — Check if a verification is currently running */
verifyRoutes.get('/verify/status', (c) => {
  return c.json({
    running: isVerificationRunning(),
    hasResult: getLatestResult() !== null,
  });
});
