-- 007_session_fork.down.sql — Revert session fork lineage column
-- Author: Subash Karki

DROP INDEX IF EXISTS idx_sessions_parent_session_id;
ALTER TABLE sessions DROP COLUMN parent_session_id;
