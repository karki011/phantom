-- 003_activity_journal.up.sql — Activity Journal enrichment
-- Author: Subash Karki

-- Add journal columns to sessions
ALTER TABLE sessions ADD COLUMN date TEXT;
ALTER TABLE sessions ADD COLUMN summary TEXT;
ALTER TABLE sessions ADD COLUMN outcome TEXT DEFAULT 'unknown';
ALTER TABLE sessions ADD COLUMN files_touched TEXT;
ALTER TABLE sessions ADD COLUMN git_commits INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN git_lines_added INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN git_lines_removed INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN branch TEXT;
ALTER TABLE sessions ADD COLUMN pr_url TEXT;
ALTER TABLE sessions ADD COLUMN pr_status TEXT;

-- Daily stats for calendar view and rollups
CREATE TABLE IF NOT EXISTS daily_stats (
    date TEXT NOT NULL,
    project_id TEXT,
    session_count INTEGER DEFAULT 0,
    total_duration_secs INTEGER DEFAULT 0,
    total_cost_micros INTEGER DEFAULT 0,
    total_input_tokens INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,
    total_tool_calls INTEGER DEFAULT 0,
    total_commits INTEGER DEFAULT 0,
    pr_count INTEGER DEFAULT 0,
    top_files TEXT,
    PRIMARY KEY (date, COALESCE(project_id, '__global__'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date);
