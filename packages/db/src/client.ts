/**
 * PhantomOS Database Client
 * @author Subash Karki
 */
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DB_PATH } from '@phantom-os/shared/constants-node';
import * as schema from './schema.js';

let _sqlite: Database.Database | null = null;
let _db: BetterSQLite3Database<typeof schema> | null = null;
export let dbError: string | null = null;

try {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  _sqlite = new Database(DB_PATH);
  _sqlite.pragma('journal_mode = WAL');
  _sqlite.pragma('busy_timeout = 5000');
  _sqlite.pragma('foreign_keys = ON');
  _db = drizzle(_sqlite, { schema });
} catch (err) {
  dbError = err instanceof Error ? err.message : String(err);
  console.error(`[phantom-db] Failed to initialize database: ${dbError}`);
  console.error(`[phantom-db] DB_PATH: ${DB_PATH}`);
}

// Expose as non-null for downstream consumers — the server's degraded-mode
// middleware returns 503 before any route handler touches these when dbError is set.
export const sqlite = _sqlite as Database.Database;
export const db = _db as BetterSQLite3Database<typeof schema>;
