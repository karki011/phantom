/**
 * PhantomOS Pane State Routes — persist tab layout to SQLite
 * @author Subash Karki
 */
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db, paneStates } from '@phantom-os/db';

export const paneStateRoutes = new Hono();

/** GET /pane-states/:worktreeId — Get saved pane state */
paneStateRoutes.get('/pane-states/:worktreeId', (c) => {
  const worktreeId = c.req.param('worktreeId');
  const row = db.select().from(paneStates).where(eq(paneStates.worktreeId, worktreeId)).get();
  if (!row) return c.json(null);
  try {
    return c.json(JSON.parse(row.state));
  } catch {
    return c.json(null);
  }
});

/** PUT /pane-states/:worktreeId — Save pane state */
paneStateRoutes.put('/pane-states/:worktreeId', async (c) => {
  const worktreeId = c.req.param('worktreeId');
  const body = await c.req.json();
  const state = JSON.stringify(body);

  db.insert(paneStates)
    .values({ worktreeId, state, updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: paneStates.worktreeId,
      set: { state, updatedAt: Date.now() },
    })
    .run();

  return c.json({ ok: true });
});

/** DELETE /pane-states/:worktreeId — Clear pane state */
paneStateRoutes.delete('/pane-states/:worktreeId', (c) => {
  const worktreeId = c.req.param('worktreeId');
  db.delete(paneStates).where(eq(paneStates.worktreeId, worktreeId)).run();
  return c.json({ ok: true });
});
