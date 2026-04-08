/**
 * PhantomOS Migrations (raw SQL for simplicity)
 * @author Subash Karki
 */
import type Database from 'better-sqlite3';

const TABLES = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  pid INTEGER,
  cwd TEXT,
  repo TEXT,
  name TEXT,
  kind TEXT,
  entrypoint TEXT,
  started_at INTEGER,
  ended_at INTEGER,
  status TEXT DEFAULT 'active',
  task_count INTEGER DEFAULT 0,
  completed_tasks INTEGER DEFAULT 0,
  xp_earned INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id),
  task_num INTEGER,
  subject TEXT,
  description TEXT,
  crew TEXT,
  status TEXT DEFAULT 'pending',
  active_form TEXT,
  blocks TEXT,
  blocked_by TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  duration_ms INTEGER
);

CREATE TABLE IF NOT EXISTS hunter_profile (
  id INTEGER PRIMARY KEY DEFAULT 1,
  name TEXT DEFAULT 'Hunter',
  level INTEGER DEFAULT 1,
  xp INTEGER DEFAULT 0,
  xp_to_next INTEGER DEFAULT 100,
  rank TEXT DEFAULT 'E',
  title TEXT DEFAULT 'Awakened',
  total_sessions INTEGER DEFAULT 0,
  total_tasks INTEGER DEFAULT 0,
  total_repos INTEGER DEFAULT 0,
  streak_current INTEGER DEFAULT 0,
  streak_best INTEGER DEFAULT 0,
  last_active_date TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS hunter_stats (
  id INTEGER PRIMARY KEY DEFAULT 1,
  strength INTEGER DEFAULT 10,
  intelligence INTEGER DEFAULT 10,
  agility INTEGER DEFAULT 10,
  vitality INTEGER DEFAULT 10,
  perception INTEGER DEFAULT 10,
  sense INTEGER DEFAULT 10
);

CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  category TEXT,
  xp_reward INTEGER DEFAULT 50,
  unlocked_at INTEGER
);

CREATE TABLE IF NOT EXISTS daily_quests (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  quest_type TEXT NOT NULL,
  label TEXT NOT NULL,
  target INTEGER NOT NULL,
  progress INTEGER DEFAULT 0,
  completed INTEGER DEFAULT 0,
  xp_reward INTEGER DEFAULT 25
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  type TEXT NOT NULL,
  session_id TEXT,
  metadata TEXT,
  xp_earned INTEGER DEFAULT 0
);
`;

/** Delete activity_log and daily_quests rows older than 90 days */
const cleanupStaleData = (sqlite: Database.Database): void => {
  const CLEANUP_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
  const cutoff = Date.now() - CLEANUP_TTL_MS;
  const cutoffDate = new Date(cutoff).toISOString().split('T')[0];

  sqlite.exec(`DELETE FROM activity_log WHERE timestamp < ${cutoff}`);
  sqlite.exec(`DELETE FROM daily_quests WHERE date < '${cutoffDate}'`);
};

export const runMigrations = (sqlite: Database.Database): void => {
  sqlite.exec(TABLES);

  // Add token tracking columns to sessions (idempotent via try/catch)
  const addColumn = (table: string, col: string, type: string, dflt: string) => {
    try {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type} DEFAULT ${dflt}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('duplicate column') && !msg.includes('already exists')) {
        console.error('[Migration] Unexpected error:', msg);
      }
    }
  };
  addColumn('sessions', 'input_tokens', 'INTEGER', '0');
  addColumn('sessions', 'output_tokens', 'INTEGER', '0');
  addColumn('sessions', 'cache_read_tokens', 'INTEGER', '0');
  addColumn('sessions', 'cache_write_tokens', 'INTEGER', '0');
  addColumn('sessions', 'estimated_cost_micros', 'INTEGER', '0');
  addColumn('sessions', 'message_count', 'INTEGER', '0');
  addColumn('sessions', 'tool_use_count', 'INTEGER', '0');
  addColumn('sessions', 'first_prompt', 'TEXT', 'NULL');
  addColumn('sessions', 'tool_breakdown', 'TEXT', 'NULL');
  addColumn('sessions', 'last_input_tokens', 'INTEGER', '0');
  addColumn('sessions', 'context_used_pct', 'INTEGER', 'NULL');

  // Indexes for frequently-queried columns
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_pid ON sessions(pid)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_repo ON sessions(repo)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_session_id ON tasks(session_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp ON activity_log(timestamp)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_daily_quests_date ON daily_quests(date)`);

  // ---------------------------------------------------------------------------
  // Workspace System Tables
  // ---------------------------------------------------------------------------
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      repo_path TEXT NOT NULL UNIQUE,
      default_branch TEXT DEFAULT 'main',
      worktree_base_dir TEXT,
      color TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_sections (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      name TEXT NOT NULL,
      tab_order INTEGER DEFAULT 0,
      is_collapsed INTEGER DEFAULT 0,
      color TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      type TEXT NOT NULL CHECK(type IN ('worktree','branch')),
      name TEXT NOT NULL,
      branch TEXT NOT NULL,
      worktree_path TEXT,
      port_base INTEGER,
      section_id TEXT REFERENCES workspace_sections(id),
      tab_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `);

  // Workspace column migrations
  addColumn('workspaces', 'base_branch', 'TEXT', 'NULL');

  // Workspace indexes
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_workspaces_project_id ON workspaces(project_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_workspaces_section_id ON workspaces(section_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_workspaces_is_active ON workspaces(is_active)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_workspace_sections_project_id ON workspace_sections(project_id)`);

  // Cleanup stale data on boot
  cleanupStaleData(sqlite);
};
