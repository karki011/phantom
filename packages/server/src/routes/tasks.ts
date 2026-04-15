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

/** GET /tasks/by-cwd?cwd=<path> — Tasks from active sessions + most recent completed session */
taskRoutes.get('/tasks/by-cwd', (c) => {
  const cwd = c.req.query('cwd');
  if (!cwd) return c.json([]);

  // Find sessions whose cwd exactly matches the worktree path
  const matchingSessions = db
    .select({ id: sessions.id, status: sessions.status, startedAt: sessions.startedAt })
    .from(sessions)
    .where(eq(sessions.cwd, cwd))
    .orderBy(desc(sessions.startedAt))
    .all();

  if (matchingSessions.length === 0) return c.json([]);

  // Include: all active sessions + all completed sessions within 24h
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const activeSessions = matchingSessions.filter((s) => s.status === 'active');
  const recentCompleted = matchingSessions.filter(
    (s) => s.status !== 'active' && (s.startedAt ?? 0) > cutoff,
  );
  const relevantIds = new Set([
    ...activeSessions.map((s) => s.id),
    ...recentCompleted.map((s) => s.id),
  ]);

  if (relevantIds.size === 0) return c.json([]);

  const allTasks = db
    .select()
    .from(tasks)
    .orderBy(desc(tasks.updatedAt))
    .all()
    .filter((t) => t.sessionId && relevantIds.has(t.sessionId));

  return c.json(allTasks.slice(0, 20));
});
