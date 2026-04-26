-- 003_activity_journal.down.sql — Revert Activity Journal enrichment
-- Author: Subash Karki

DROP INDEX IF EXISTS idx_daily_stats_date;
DROP INDEX IF EXISTS idx_sessions_date;
DROP TABLE IF EXISTS daily_stats;

-- SQLite pre-3.35 doesn't support DROP COLUMN; acceptable for dev
ALTER TABLE sessions DROP COLUMN date;
ALTER TABLE sessions DROP COLUMN summary;
ALTER TABLE sessions DROP COLUMN outcome;
ALTER TABLE sessions DROP COLUMN files_touched;
ALTER TABLE sessions DROP COLUMN git_commits;
ALTER TABLE sessions DROP COLUMN git_lines_added;
ALTER TABLE sessions DROP COLUMN git_lines_removed;
ALTER TABLE sessions DROP COLUMN branch;
ALTER TABLE sessions DROP COLUMN pr_url;
ALTER TABLE sessions DROP COLUMN pr_status;
