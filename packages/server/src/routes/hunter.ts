/**
 * PhantomOS Hunter Routes
 * @author Subash Karki
 */
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db, hunterProfile, hunterStats } from '@phantom-os/db';

export const hunterRoutes = new Hono();

/** GET /hunter — Return hunter profile joined with stats */
hunterRoutes.get('/hunter', (c) => {
  const profile = db.select().from(hunterProfile).where(eq(hunterProfile.id, 1)).get();
  const stats = db.select().from(hunterStats).where(eq(hunterStats.id, 1)).get();

  if (!profile) {
    return c.json({ error: 'Hunter profile not found' }, 404);
  }

  return c.json({ ...profile, stats: stats ?? null });
});

/** POST /hunter/name — Update hunter name */
hunterRoutes.post('/hunter/name', async (c) => {
  const body = await c.req.json<{ name?: string }>();
  const name = body?.name?.trim();

  if (!name) {
    return c.json({ error: 'Name is required' }, 400);
  }

  db.update(hunterProfile)
    .set({ name })
    .where(eq(hunterProfile.id, 1))
    .run();

  const updated = db.select().from(hunterProfile).where(eq(hunterProfile.id, 1)).get();
  return c.json(updated);
});
