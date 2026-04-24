-- 002_terminal_lifecycle.down.sql
-- Revert terminal lifecycle columns
-- Author: Subash Karki

DROP INDEX IF EXISTS idx_terminal_sessions_session_id;
DROP INDEX IF EXISTS idx_terminal_sessions_project_id;
DROP INDEX IF EXISTS idx_terminal_sessions_worktree_id;
-- SQLite pre-3.35 doesn't support DROP COLUMN; acceptable for dev
ALTER TABLE terminal_sessions DROP COLUMN session_id;
ALTER TABLE terminal_sessions DROP COLUMN project_id;
