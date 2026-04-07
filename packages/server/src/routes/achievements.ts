/**
 * PhantomOS Achievement Routes
 * @author Subash Karki
 */
import { Hono } from 'hono';
import { db, achievements } from '@phantom-os/db';

export const achievementRoutes = new Hono();

/** GET /achievements — All achievements, with unlockedAt for unlocked ones */
achievementRoutes.get('/achievements', (c) => {
  const rows = db.select().from(achievements).all();
  return c.json(rows);
});
