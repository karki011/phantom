/**
 * PhantomOS Task Routes
 * @author Subash Karki
 */
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db, tasks } from '@phantom-os/db';

export const taskRoutes = new Hono();

/** GET /sessions/:sessionId/tasks — All tasks for a session, ordered by taskNum */
taskRoutes.get('/sessions/:sessionId/tasks', (c) => {
  const sessionId = c.req.param('sessionId');

  const rows = db
    .select()
    .from(tasks)
    .where(eq(tasks.sessionId, sessionId))
    .orderBy(tasks.taskNum)
    .all();

  return c.json(rows);
});
