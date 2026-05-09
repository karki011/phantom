-- fts_search.sql
-- FTS5 full-text search queries for AI decision matching,
-- pattern retrieval, and session memory search.
-- Author: Subash Karki

-- name: SearchDecisions :many
-- Full-text search over AI decisions ordered by FTS5 relevance rank.
-- Pass a FTS5 match expression, e.g. "deploy strategy" or "goal:migrate*".
SELECT
    d.id,
    d.goal,
    d.strategy_id,
    d.complexity,
    d.risk,
    d.confidence,
    d.created_at
FROM ai_decisions d
JOIN ai_decisions_fts ON d.rowid = ai_decisions_fts.rowid
WHERE ai_decisions_fts.goal MATCH sqlc.arg(query)
ORDER BY ai_decisions_fts.rank;

-- name: SearchPatterns :many
-- Full-text search over knowledge patterns ordered by FTS5 relevance rank.
SELECT
    pattern_text,
    category,
    source_context
FROM ai_patterns_fts
WHERE pattern_text MATCH sqlc.arg(query)
ORDER BY rank;

-- name: SearchMemories :many
-- Full-text search over session memories ordered by FTS5 relevance rank.
SELECT
    memory_text,
    memory_type,
    session_id
FROM session_memories_fts
WHERE memory_text MATCH sqlc.arg(query)
ORDER BY rank;

-- name: InsertPattern :exec
-- Insert a knowledge pattern into the standalone FTS5 index.
INSERT INTO ai_patterns_fts(pattern_text, category, source_context)
VALUES (sqlc.arg(pattern_text), sqlc.arg(category), sqlc.arg(source_context));

-- name: InsertMemory :exec
-- Insert a session memory into the standalone FTS5 index.
INSERT INTO session_memories_fts(memory_text, memory_type, session_id)
VALUES (sqlc.arg(memory_text), sqlc.arg(memory_type), sqlc.arg(session_id));
