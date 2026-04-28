-- 006_session_enrichment.up.sql — Rich session enrichment columns
-- Author: Subash Karki

-- Add enrichment columns to sessions for richer journal data
ALTER TABLE sessions ADD COLUMN session_goal TEXT;
ALTER TABLE sessions ADD COLUMN session_type TEXT;
ALTER TABLE sessions ADD COLUMN tool_summary TEXT;
ALTER TABLE sessions ADD COLUMN keywords TEXT;
