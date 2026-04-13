/**
 * PhantomOS Cleanup Routes — graceful resource cleanup
 * @author Subash Karki
 */
import { Hono } from 'hono';
import { destroyAllPtys } from '../terminal-manager.js';
import { historyWriter } from '../terminal-history.js';

export const cleanupRoutes = new Hono();

/** POST /cleanup/terminals — Kill all active terminal/PTY sessions */
cleanupRoutes.post('/cleanup/terminals', (c) => {
  try {
    destroyAllPtys();
    return c.json({ ok: true });
  } catch (err: any) {
    return c.json({ ok: false, error: err?.message ?? 'Failed to cleanup terminals' }, 500);
  }
});

/** POST /cleanup/terminals/shutdown — Kill PTYs + purge DB records (shutdown ceremony) */
cleanupRoutes.post('/cleanup/terminals/shutdown', (c) => {
  try {
    destroyAllPtys();
    historyWriter.stopHistoryWriter();
    historyWriter.purgeAllSessions();
    return c.json({ ok: true });
  } catch (err: any) {
    return c.json({ ok: false, error: err?.message ?? 'Failed to shutdown terminals' }, 500);
  }
});
