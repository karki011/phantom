-- 011_ai_outcomes_phase.up.sql
-- Tag every ai_outcomes row with the writer phase that produced it so the
-- learning loop can distinguish optimistic auto-records (orchestrator) from
-- ground-truth verifier results (Composer + MCP API). Fixes the dual-writer
-- pollution where orchestrator + verifier both INSERT under the same
-- decision_id, blending half-truths into GetSuccessRate.
--
-- ai_decisions / ai_outcomes are normally created lazily by NewDecisionStore.
-- We CREATE TABLE IF NOT EXISTS first so fresh installs have a target for the
-- ALTER below; existing installs no-op the CREATE and pick up only the column.
-- The DEFAULT 'orchestrator' backfill matches reality — every pre-PR-19 row
-- was an orchestrator-phase auto-record.
--
-- Author: Subash Karki

CREATE TABLE IF NOT EXISTS ai_decisions (
    id TEXT PRIMARY KEY,
    goal TEXT NOT NULL,
    strategy_id TEXT NOT NULL,
    confidence REAL DEFAULT 0,
    complexity TEXT DEFAULT '',
    risk TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_outcomes (
    id TEXT PRIMARY KEY,
    decision_id TEXT REFERENCES ai_decisions(id),
    success INTEGER NOT NULL DEFAULT 0,
    failure_reason TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_decisions_goal ON ai_decisions(goal);
CREATE INDEX IF NOT EXISTS idx_outcomes_decision ON ai_outcomes(decision_id);

ALTER TABLE ai_outcomes ADD COLUMN phase TEXT NOT NULL DEFAULT 'orchestrator';

CREATE INDEX IF NOT EXISTS idx_outcomes_phase ON ai_outcomes(phase);
