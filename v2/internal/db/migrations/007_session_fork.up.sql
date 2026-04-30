-- 007_session_fork.up.sql — Track session fork lineage
-- Author: Subash Karki

-- Nullable parent_session_id captures the source session a fork was cloned from.
-- Allows tracking arbitrary fork trees (fork-of-fork is supported).
ALTER TABLE sessions ADD COLUMN parent_session_id TEXT REFERENCES sessions(id);
CREATE INDEX IF NOT EXISTS idx_sessions_parent_session_id ON sessions(parent_session_id);
