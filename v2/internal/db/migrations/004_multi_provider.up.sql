-- 004_multi_provider.up.sql — Multi-provider support
-- Author: Subash Karki

-- Track which AI provider owns each session.
ALTER TABLE sessions ADD COLUMN provider TEXT NOT NULL DEFAULT 'claude';
CREATE INDEX IF NOT EXISTS idx_sessions_provider ON sessions(provider);

-- Track which AI provider generated each activity log entry.
ALTER TABLE activity_log ADD COLUMN provider TEXT NOT NULL DEFAULT 'claude';
CREATE INDEX IF NOT EXISTS idx_activity_log_provider ON activity_log(provider);
