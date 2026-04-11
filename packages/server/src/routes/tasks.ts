/**
 * PhantomOS Task Routes
 * @author Subash Karki
 */
import { eq, and, desc } from 'drizzle-orm';
import { Hono } from 'hono';
import { db, sessions, tasks } from '@phantom-os/db';

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

/** GET /tasks/by-cwd?cwd=<path> — Tasks from sessions matching a working directory (active + recent) */
taskRoutes.get('/tasks/by-cwd', (c) => {
  const cwd = c.req.query('cwd');
  if (!cwd) return c.json([]);

  // Find sessions whose cwd exactly matches the worktree path
  const matchingSessions = db
    .select({ id: sessions.id, status: sessions.status })
    .from(sessions)
    .where(eq(sessions.cwd, cwd))
    .all();

  if (matchingSessions.length === 0) return c.json([]);

  // Get all tasks for those sessions
  const sessionIds = new Set(matchingSessions.map((s) => s.id));
  const allTasks = db
    .select()
    .from(tasks)
    .orderBy(desc(tasks.updatedAt))
    .all()
    .filter((t) => t.sessionId && sessionIds.has(t.sessionId));

  return c.json(allTasks.slice(0, 30));
});
