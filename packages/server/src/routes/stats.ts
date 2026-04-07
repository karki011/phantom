/**
 * PhantomOS Stats Routes
 * @author Subash Karki
 */
import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { db, sqlite, achievements, hunterProfile, sessions, tasks } from '@phantom-os/db';

export const statsRoutes = new Hono();

/** GET /stats — Dashboard aggregate statistics */
statsRoutes.get('/stats', (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const todayStart = new Date(today).getTime();
  const todayEnd = todayStart + 86_400_000;

  const activeSessions = db
    .select({ count: sql<number>`count(*)` })
    .from(sessions)
    .where(eq(sessions.status, 'active'))
    .get();

  const todayTasks = db
    .select({ count: sql<number>`count(*)` })
    .from(tasks)
    .where(sql`${tasks.createdAt} >= ${todayStart} AND ${tasks.createdAt} < ${todayEnd}`)
    .get();

  const totalSessions = db
    .select({ count: sql<number>`count(*)` })
    .from(sessions)
    .get();

  const totalTasks = db
    .select({ count: sql<number>`count(*)` })
    .from(tasks)
    .get();

  const profile = db
    .select()
    .from(hunterProfile)
    .where(eq(hunterProfile.id, 1))
    .get();

  const achievementsUnlocked = db
    .select({ count: sql<number>`count(*)` })
    .from(achievements)
    .where(sql`${achievements.unlockedAt} IS NOT NULL`)
    .get();

  const tokenStats = sqlite
    .prepare(
      'SELECT COALESCE(SUM(input_tokens + output_tokens), 0) as totalTokens, COALESCE(SUM(estimated_cost_micros), 0) as totalCost FROM sessions',
    )
    .get() as { totalTokens: number; totalCost: number } | undefined;

  const totalCompletedTasks = db
    .select({ count: sql<number>`count(*)` })
    .from(tasks)
    .where(eq(tasks.status, 'completed'))
    .get();

  return c.json({
    activeSessions: activeSessions?.count ?? 0,
    todayTasks: todayTasks?.count ?? 0,
    totalSessions: totalSessions?.count ?? 0,
    totalTasks: totalTasks?.count ?? 0,
    streak: profile?.streakCurrent ?? 0,
    achievementsUnlocked: achievementsUnlocked?.count ?? 0,
    totalTokens: tokenStats?.totalTokens ?? 0,
    totalCost: tokenStats?.totalCost ?? 0,
    totalCompletedTasks: totalCompletedTasks?.count ?? 0,
  });
});
