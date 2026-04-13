/**
 * KnowledgeDB -- Per-project SQLite database for AI engine knowledge data
 *
 * Manages decisions, outcomes, patterns, and strategy performance records.
 * Each project gets its own database at ~/.phantom-os/ai-engine/{projectId}.db,
 * enabling isolated knowledge graphs per codebase.
 *
 * @author Subash Karki
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { AI_ENGINE_DIR } from '@phantom-os/shared';

// ---------------------------------------------------------------------------
// KnowledgeDB
// ---------------------------------------------------------------------------

export class KnowledgeDB {
  private sqlite: Database.Database;
  readonly projectId: string;

  constructor(projectId: string) {
    this.projectId = projectId;

    // Ensure the ai-engine data directory exists
    mkdirSync(AI_ENGINE_DIR, { recursive: true });

    const dbPath = join(AI_ENGINE_DIR, `${projectId}.db`);
    this.sqlite = new Database(dbPath);

    // Performance & reliability pragmas (same as main DB)
    this.sqlite.pragma('journal_mode = WAL');
    this.sqlite.pragma('busy_timeout = 5000');
    this.sqlite.pragma('foreign_keys = ON');

    this.runMigrations();
  }

  /** Direct access to the underlying better-sqlite3 instance */
  get db(): Database.Database {
    return this.sqlite;
  }

  /** Gracefully close the database connection */
  close(): void {
    this.sqlite.close();
  }

  // ---------------------------------------------------------------------------
  // Migrations
  // ---------------------------------------------------------------------------

  /**
   * Create all tables and indexes.
   * Uses IF NOT EXISTS so this is safe to call on every instantiation.
   */
  private runMigrations(): void {
    this.sqlite.exec(`
      -- -----------------------------------------------------------------
      -- decisions: records each AI strategy decision made for a goal
      -- -----------------------------------------------------------------
      CREATE TABLE IF NOT EXISTS decisions (
        id              TEXT PRIMARY KEY,
        project_id      TEXT NOT NULL,
        goal            TEXT NOT NULL,
        strategy_id     TEXT NOT NULL,
        strategy_name   TEXT NOT NULL,
        confidence      REAL NOT NULL,
        complexity      TEXT NOT NULL,
        risk            TEXT NOT NULL,
        files_involved  TEXT,           -- JSON array of file paths
        duration_ms     INTEGER NOT NULL,
        created_at      INTEGER NOT NULL
      );

      -- -----------------------------------------------------------------
      -- outcomes: result of executing a decision
      -- -----------------------------------------------------------------
      CREATE TABLE IF NOT EXISTS outcomes (
        id                TEXT PRIMARY KEY,
        decision_id       TEXT NOT NULL REFERENCES decisions(id),
        success           INTEGER NOT NULL,   -- 0 = failure, 1 = success
        evaluation_score  REAL NOT NULL,
        recommendation    TEXT NOT NULL,
        failure_reason    TEXT,
        refinement_count  INTEGER DEFAULT 0,
        created_at        INTEGER NOT NULL
      );

      -- -----------------------------------------------------------------
      -- patterns: recurring patterns detected across decisions/outcomes
      -- -----------------------------------------------------------------
      CREATE TABLE IF NOT EXISTS patterns (
        id                       TEXT PRIMARY KEY,
        project_id               TEXT NOT NULL,
        name                     TEXT NOT NULL,
        description              TEXT NOT NULL,
        frequency                INTEGER NOT NULL,
        success_rate             REAL NOT NULL,
        applicable_complexities  TEXT,   -- JSON array
        applicable_risks         TEXT,   -- JSON array
        created_at               INTEGER NOT NULL,
        updated_at               INTEGER NOT NULL
      );

      -- -----------------------------------------------------------------
      -- strategy_performance: tracks how each strategy performs per context
      -- -----------------------------------------------------------------
      CREATE TABLE IF NOT EXISTS strategy_performance (
        id            TEXT PRIMARY KEY,
        project_id    TEXT NOT NULL,
        strategy_id   TEXT NOT NULL,
        goal          TEXT,
        complexity    TEXT,
        risk          TEXT,
        is_ambiguous  INTEGER,
        blast_radius  INTEGER,
        confidence    REAL,
        evaluation    TEXT,
        duration_ms   INTEGER,
        created_at    INTEGER NOT NULL
      );

      -- -----------------------------------------------------------------
      -- Indexes
      -- -----------------------------------------------------------------
      CREATE INDEX IF NOT EXISTS idx_decisions_project_created
        ON decisions(project_id, created_at);

      CREATE INDEX IF NOT EXISTS idx_decisions_goal
        ON decisions(goal);

      CREATE INDEX IF NOT EXISTS idx_outcomes_decision
        ON outcomes(decision_id);

      CREATE INDEX IF NOT EXISTS idx_patterns_project
        ON patterns(project_id);

      CREATE INDEX IF NOT EXISTS idx_strategy_perf_strategy
        ON strategy_performance(strategy_id, complexity);

      CREATE INDEX IF NOT EXISTS idx_strategy_perf_created
        ON strategy_performance(created_at);
    `);
  }
}
