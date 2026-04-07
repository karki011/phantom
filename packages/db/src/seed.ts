/**
 * PhantomOS Database Seeder
 * @author Subash Karki
 */
import type Database from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from './schema';

export const seedDatabase = (
  _db: BetterSQLite3Database<typeof schema>,
  sqlite: Database.Database,
): void => {
  const profileCount = sqlite
    .prepare('SELECT COUNT(*) as count FROM hunter_profile')
    .get() as { count: number };

  if (profileCount.count === 0) {
    sqlite
      .prepare('INSERT INTO hunter_profile (id, created_at) VALUES (1, ?)')
      .run(Date.now());
  }

  const statsCount = sqlite
    .prepare('SELECT COUNT(*) as count FROM hunter_stats')
    .get() as { count: number };

  if (statsCount.count === 0) {
    sqlite.prepare('INSERT INTO hunter_stats (id) VALUES (1)').run();
  }
};
