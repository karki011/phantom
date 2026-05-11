-- 016_fts5_search.up.sql
-- FTS5 full-text search tables replacing the ONNX vector embedding system.
-- Used for AI decision matching, pattern retrieval, and session memory search.
--
-- ai_outcomes only has: id, decision_id, success, failure_reason, phase, created_at
-- ai_decisions has: id, goal, strategy_id, confidence, complexity, risk, created_at
-- We build the content-linked FTS5 on ai_decisions (the text-rich table).
--
-- Author: Subash Karki

-- FTS5 index for AI decisions (goal + strategy search)
-- content= links to ai_decisions so reads come from the base table,
-- keeping FTS5 as a lightweight index rather than a data copy.
CREATE VIRTUAL TABLE IF NOT EXISTS ai_decisions_fts USING fts5(
    goal,
    strategy_id,
    complexity,
    risk,
    content='ai_decisions',
    content_rowid='rowid',
    tokenize='porter unicode61'
);

-- FTS5 index for knowledge patterns (standalone — no base table yet)
CREATE VIRTUAL TABLE IF NOT EXISTS ai_patterns_fts USING fts5(
    pattern_text,
    category,
    source_context,
    tokenize='porter unicode61'
);

-- FTS5 index for session memories (standalone — no base table yet)
CREATE VIRTUAL TABLE IF NOT EXISTS session_memories_fts USING fts5(
    memory_text,
    memory_type,
    session_id,
    tokenize='porter unicode61'
);

-- Triggers to keep ai_decisions_fts in sync with ai_decisions.
-- Required because content= tables do not auto-update.

CREATE TRIGGER IF NOT EXISTS ai_decisions_fts_ai
AFTER INSERT ON ai_decisions BEGIN
    INSERT INTO ai_decisions_fts(rowid, goal, strategy_id, complexity, risk)
    VALUES (new.rowid, new.goal, new.strategy_id, new.complexity, new.risk);
END;

CREATE TRIGGER IF NOT EXISTS ai_decisions_fts_ad
AFTER DELETE ON ai_decisions BEGIN
    INSERT INTO ai_decisions_fts(ai_decisions_fts, rowid, goal, strategy_id, complexity, risk)
    VALUES ('delete', old.rowid, old.goal, old.strategy_id, old.complexity, old.risk);
END;

CREATE TRIGGER IF NOT EXISTS ai_decisions_fts_au
AFTER UPDATE ON ai_decisions BEGIN
    INSERT INTO ai_decisions_fts(ai_decisions_fts, rowid, goal, strategy_id, complexity, risk)
    VALUES ('delete', old.rowid, old.goal, old.strategy_id, old.complexity, old.risk);
    INSERT INTO ai_decisions_fts(rowid, goal, strategy_id, complexity, risk)
    VALUES (new.rowid, new.goal, new.strategy_id, new.complexity, new.risk);
END;

-- Backfill existing ai_decisions rows into FTS5 index.
-- Safe to run on empty table — INSERT ... SELECT produces zero rows.
INSERT INTO ai_decisions_fts(rowid, goal, strategy_id, complexity, risk)
SELECT rowid, goal, strategy_id, complexity, risk FROM ai_decisions;
