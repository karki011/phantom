-- 004_multi_provider.down.sql — Remove multi-provider support
-- Author: Subash Karki

-- SQLite does not support DROP COLUMN before 3.35.0.
-- Since we require SQLite 3.35+, we can use ALTER TABLE ... DROP COLUMN.
DROP INDEX IF EXISTS idx_activity_log_provider;
ALTER TABLE activity_log DROP COLUMN provider;

DROP INDEX IF EXISTS idx_sessions_provider;
ALTER TABLE sessions DROP COLUMN provider;
