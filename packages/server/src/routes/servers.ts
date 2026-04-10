/**
 * PhantomOS Server Routes — Running process management
 * @author Subash Karki
 */
import { Hono } from 'hono';
import { getProcesses } from '../process-registry.js';
import { destroyPty } from '../terminal-manager.js';

export const serverRoutes = new Hono();

/** GET /servers — List running processes */
serverRoutes.get('/servers', (c) => {
  const workspaceId = c.req.query('workspaceId');
  return c.json(getProcesses(workspaceId || undefined));
});

/** POST /servers/:termId/stop — Stop a running process */
serverRoutes.post('/servers/:termId/stop', (c) => {
  const termId = c.req.param('termId');
  // destroyPty kills the process and removes the PTY session.
  // The WebSocket close handler will call unregisterProcess.
  destroyPty(termId);
  return c.json({ ok: true });
});
