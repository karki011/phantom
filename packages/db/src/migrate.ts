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
  addColumn('sessions', 'model', 'TEXT', 'NULL');
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

  // Cost recalculation with correct Anthropic pricing (Apr 2025):
  // Opus 4.5+: $5/$25, Opus 4/4.1: $15/$75, Sonnet: $3/$15, Haiku 4.5: $1/$5
  // Also fixes double-counting of cache read tokens in input.
  // Marker: cost_recalc_v3 column. Runs once.
  try {
    sqlite.exec(`ALTER TABLE sessions ADD COLUMN cost_recalc_v3 INTEGER DEFAULT 0`);
    // Column was just added — means this is the first run. Recalculate all costs.
    const rows = sqlite.prepare(
      `SELECT id, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
       FROM sessions WHERE input_tokens > 0`,
    ).all() as { id: string; model: string | null; input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number }[];

    const pricing: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
      opus: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
      opusLegacy: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
      sonnet: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
      haiku: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
      haikuLegacy: { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
    };
    const getPricing = (model: string | null) => {
      if (!model) return pricing.sonnet;
      const lower = model.toLowerCase();
      if (lower.includes('opus')) {
        if (lower.includes('opus-4-0') || lower.includes('opus-4-1') || lower === 'claude-opus-4' || lower.includes('opus-3'))
          return pricing.opusLegacy;
        return pricing.opus;
      }
      if (lower.includes('haiku')) {
        if (lower.includes('haiku-3')) return pricing.haikuLegacy;
        return pricing.haiku;
      }
      return pricing.sonnet;
    };

    const update = sqlite.prepare(`UPDATE sessions SET estimated_cost_micros = ?, cost_recalc_v3 = 1 WHERE id = ?`);
    const tx = sqlite.transaction(() => {
      for (const row of rows) {
        const p = getPricing(row.model);
        const nonCachedInput = Math.max(0, row.input_tokens - row.cache_read_tokens);
        const cost = Math.round(
          nonCachedInput * p.input +
          row.output_tokens * p.output +
          row.cache_read_tokens * p.cacheRead +
          row.cache_write_tokens * p.cacheWrite,
        );
        update.run(cost, row.id);
      }
    });
    tx();
    console.log(`[Migration] Recalculated costs for ${rows.length} sessions (correct Apr 2025 pricing)`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (!msg.includes('duplicate column') && !msg.includes('already exists')) {
      console.error('[Migration] Cost recalc error:', msg);
    }
    // Column already exists — recalculation already done
  }

  // One-time: force re-scan of sessions with Skill usage so per-skill keys get stored
  try {
    sqlite.exec(`ALTER TABLE sessions ADD COLUMN skill_rescan_v1 INTEGER DEFAULT 0`);
    const count = sqlite.prepare(
      `UPDATE sessions SET input_tokens = 0 WHERE tool_breakdown LIKE '%"Skill"%' AND tool_breakdown NOT LIKE '%"Skill:/%'`,
    ).run();
    console.log(`[Migration] Queued ${count.changes} sessions for Skill-detail rescan`);
  } catch { /* column already exists — already done */ }

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

  // Project Intelligence column
  try { sqlite.exec('ALTER TABLE projects ADD COLUMN profile TEXT'); } catch {}

  // Project starred/favorite column
  try { sqlite.exec('ALTER TABLE projects ADD COLUMN starred INTEGER DEFAULT 0'); } catch {}

  // Workspace column migrations
  addColumn('workspaces', 'base_branch', 'TEXT', 'NULL');

  // Add ticket_url column to workspaces (worktrees) — safe to re-run
  try {
    sqlite.exec(`ALTER TABLE workspaces ADD COLUMN ticket_url TEXT`);
  } catch { /* column already exists */ }

  // Workspace indexes
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_workspaces_project_id ON workspaces(project_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_workspaces_section_id ON workspaces(section_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_workspaces_is_active ON workspaces(is_active)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_workspace_sections_project_id ON workspace_sections(project_id)`);

  // ---------------------------------------------------------------------------
  // Chat Conversations & History Tables
  // ---------------------------------------------------------------------------
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS chat_conversations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      title TEXT NOT NULL,
      model TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_chat_conv_workspace ON chat_conversations(workspace_id)`);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      model TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  // Add conversation_id to existing chat_messages (may already exist)
  try { sqlite.exec('ALTER TABLE chat_messages ADD COLUMN conversation_id TEXT'); } catch {}

  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_chat_messages_workspace_id ON chat_messages(workspace_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id ON chat_messages(conversation_id)`);

  // ---------------------------------------------------------------------------
  // Pane State Persistence
  // ---------------------------------------------------------------------------
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS pane_states (
      worktree_id TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // ---------------------------------------------------------------------------
  // Terminal Session Persistence (cold restore)
  // ---------------------------------------------------------------------------
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS terminal_sessions (
      pane_id TEXT PRIMARY KEY,
      worktree_id TEXT,
      shell TEXT,
      cwd TEXT,
      env TEXT,
      cols INTEGER,
      rows INTEGER,
      scrollback TEXT,
      status TEXT DEFAULT 'active',
      started_at INTEGER,
      last_active_at INTEGER,
      ended_at INTEGER
    );
  `);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_terminal_sessions_worktree ON terminal_sessions(worktree_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_terminal_sessions_status ON terminal_sessions(status)`);
  addColumn('terminal_sessions', 'session_id', 'TEXT', 'NULL');
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_terminal_sessions_session_id ON terminal_sessions(session_id)`);

  // ---------------------------------------------------------------------------
  // AI Engine: Graph Tables
  // ---------------------------------------------------------------------------
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS graph_nodes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      type TEXT NOT NULL,
      path TEXT,
      name TEXT,
      content_hash TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS graph_edges (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      source_id TEXT NOT NULL REFERENCES graph_nodes(id),
      target_id TEXT NOT NULL REFERENCES graph_nodes(id),
      type TEXT NOT NULL,
      weight INTEGER DEFAULT 1,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS graph_meta (
      project_id TEXT PRIMARY KEY REFERENCES projects(id),
      last_built_at INTEGER,
      last_updated_at INTEGER,
      file_count INTEGER DEFAULT 0,
      edge_count INTEGER DEFAULT 0,
      layer2_count INTEGER DEFAULT 0,
      coverage INTEGER DEFAULT 0
    );
  `);

  // Graph indexes
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_graph_nodes_project ON graph_nodes(project_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_graph_nodes_type ON graph_nodes(type)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_graph_nodes_path ON graph_nodes(path)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_graph_edges_project ON graph_edges(project_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_graph_edges_type ON graph_edges(type)`);

  // Cleanup stale data on boot
  cleanupStaleData(sqlite);
};
