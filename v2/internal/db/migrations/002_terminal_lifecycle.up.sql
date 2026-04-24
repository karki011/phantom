-- 002_terminal_lifecycle.up.sql
-- Add session_id and project_id to terminal_sessions for lifecycle tracking
-- Author: Subash Karki

ALTER TABLE terminal_sessions ADD COLUMN session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL;
ALTER TABLE terminal_sessions ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_session_id ON terminal_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_project_id ON terminal_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_worktree_id ON terminal_sessions(worktree_id);
