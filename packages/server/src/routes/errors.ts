/**
 * Error Log Routes — GET /errors?limit=50
 * Surfaces recent structured errors from ~/.phantom-os/errors.log.
 *
 * @author Subash Karki
 */
import { Hono } from 'hono';
import { readRecentErrors } from '../services/error-logger.js';

export const errorRoutes = new Hono();

/** GET /errors?limit=50 — returns recent error entries (newest first) */
errorRoutes.get('/errors', (c) => {
  const limitParam = c.req.query('limit');
  const limit = limitParam ? Math.min(Math.max(Number.parseInt(limitParam, 10) || 50, 1), 500) : 50;
  return c.json(readRecentErrors(limit));
});
