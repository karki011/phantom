-- 016_fts5_search.down.sql
-- Author: Subash Karki

DROP TRIGGER IF EXISTS ai_decisions_fts_au;
DROP TRIGGER IF EXISTS ai_decisions_fts_ad;
DROP TRIGGER IF EXISTS ai_decisions_fts_ai;
DROP TABLE IF EXISTS session_memories_fts;
DROP TABLE IF EXISTS ai_patterns_fts;
DROP TABLE IF EXISTS ai_decisions_fts;
