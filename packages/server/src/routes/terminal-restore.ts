/**
 * PhantomOS Terminal Restore Routes — cold restore API
 * @author Subash Karki
 */
import { Hono } from 'hono';
import { historyWriter } from '../terminal-history.js';

export const terminalRestoreRoutes = new Hono();

/** GET /terminal-sessions/:worktreeId — restorable sessions for a worktree */
terminalRestoreRoutes.get('/terminal-sessions/:worktreeId', (c) => {
  const worktreeId = c.req.param('worktreeId');
  const sessions = historyWriter.getRestorableSessions(worktreeId);
  return c.json(sessions);
});

/** GET /terminal-sessions/scrollback/:paneId — scrollback for a session */
terminalRestoreRoutes.get('/terminal-sessions/scrollback/:paneId', (c) => {
  const paneId = c.req.param('paneId');
  const scrollback = historyWriter.getSessionScrollback(paneId);
  if (scrollback === null) return c.json({ scrollback: '' });
  return c.json({ scrollback });
});

/** DELETE /terminal-sessions/:paneId — clear a session record */
terminalRestoreRoutes.delete('/terminal-sessions/:paneId', (c) => {
  const paneId = c.req.param('paneId');
  historyWriter.clearSession(paneId);
  return c.json({ ok: true });
});
