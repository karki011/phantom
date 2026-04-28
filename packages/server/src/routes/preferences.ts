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
  sounds: 'false',
  fullscreen_on_start: 'true',
};

/** Default AI engine preferences — each controls a specific hook */
const AI_ENGINE_DEFAULTS: Record<string, boolean> = {
  'ai.autoContext': true,     // UserPromptSubmit hook (prompt-enricher)
  'ai.editGate': true,        // PreToolUse blocking gate
  'ai.outcomeCapture': true,  // Stop hook (knowledge learning)
  'ai.fileSync': true,        // FileChanged hook (graph sync)
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

// ---------------------------------------------------------------------------
// AI Engine Preferences
// ---------------------------------------------------------------------------

/** Helper: read AI prefs from DB, merged with defaults */
const getAiPreferences = (): Record<string, boolean> => {
  const result = { ...AI_ENGINE_DEFAULTS };
  for (const key of Object.keys(AI_ENGINE_DEFAULTS)) {
    const row = db.select().from(userPreferences).where(eq(userPreferences.key, key)).get();
    if (row) {
      result[key] = row.value === 'true';
    }
  }
  return result;
};

/** GET /preferences/ai — returns AI engine preferences merged with defaults */
preferencesRoutes.get('/preferences/ai', (c) => {
  return c.json(getAiPreferences());
});

/** PUT /preferences/ai — update individual AI engine preferences */
preferencesRoutes.put('/preferences/ai', async (c) => {
  const body = await c.req.json<Record<string, boolean>>();

  for (const [key, value] of Object.entries(body)) {
    // Only accept known AI preference keys
    if (!(key in AI_ENGINE_DEFAULTS)) continue;

    db.insert(userPreferences)
      .values({ key, value: String(value), updatedAt: Date.now() })
      .onConflictDoUpdate({
        target: userPreferences.key,
        set: { value: String(value), updatedAt: Date.now() },
      })
      .run();
  }

  return c.json(getAiPreferences());
});
