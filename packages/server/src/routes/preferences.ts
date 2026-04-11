/**
 * PhantomOS User Preferences Routes
 * @author Subash Karki
 */
import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import { db, userPreferences } from '@phantom-os/db';

// Auto-create table if it doesn't exist
db.run(sql`CREATE TABLE IF NOT EXISTS user_preferences (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
)`);

export const preferencesRoutes = new Hono();

/** Default preferences — seeded on first GET if table is empty */
const DEFAULTS: Record<string, string> = {
  gamification: 'false',
  caveman: 'false',
};

/** Seed defaults for any missing keys */
function ensureDefaults(): void {
  for (const [key, value] of Object.entries(DEFAULTS)) {
    const existing = db.select().from(userPreferences).where(eq(userPreferences.key, key)).get();
    if (!existing) {
      db.insert(userPreferences).values({ key, value, updatedAt: Date.now() }).run();
    }
  }
}

/** GET /preferences — returns all preferences as flat { key: value } object */
preferencesRoutes.get('/preferences', (c) => {
  ensureDefaults();
  const rows = db.select().from(userPreferences).all();
  const prefs: Record<string, string> = {};
  for (const row of rows) {
    prefs[row.key] = row.value;
  }
  return c.json(prefs);
});

/** PUT /preferences/:key — upsert a single preference */
preferencesRoutes.put('/preferences/:key', async (c) => {
  const key = c.req.param('key');
  const body = await c.req.json<{ value: string }>();

  if (body.value === undefined || body.value === null) {
    return c.json({ error: 'value is required' }, 400);
  }

  db.insert(userPreferences)
    .values({ key, value: String(body.value), updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: userPreferences.key,
      set: { value: String(body.value), updatedAt: Date.now() },
    })
    .run();

  // Return all preferences after update
  const rows = db.select().from(userPreferences).all();
  const prefs: Record<string, string> = {};
  for (const row of rows) {
    prefs[row.key] = row.value;
  }
  return c.json(prefs);
});
