-- Composer (agentic edit pane) — turns + edits.
-- Author: Subash Karki

CREATE TABLE IF NOT EXISTS composer_turns (
    id            TEXT PRIMARY KEY,
    pane_id       TEXT NOT NULL,
    session_id    TEXT NOT NULL,                   -- claude --session-id, reused across turns in the same pane
    cwd           TEXT NOT NULL,
    prompt        TEXT NOT NULL,
    model         TEXT NOT NULL DEFAULT 'sonnet',
    status        TEXT NOT NULL DEFAULT 'running', -- running | done | error | cancelled
    input_tokens  INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd      REAL    NOT NULL DEFAULT 0,
    started_at    INTEGER NOT NULL,                -- unix seconds
    completed_at  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_composer_turns_pane    ON composer_turns(pane_id);
CREATE INDEX IF NOT EXISTS idx_composer_turns_session ON composer_turns(session_id);

CREATE TABLE IF NOT EXISTS composer_edits (
    id             TEXT PRIMARY KEY,
    turn_id        TEXT NOT NULL,
    pane_id        TEXT NOT NULL,
    path           TEXT NOT NULL,
    old_content    TEXT,
    new_content    TEXT,
    lines_added    INTEGER NOT NULL DEFAULT 0,
    lines_removed  INTEGER NOT NULL DEFAULT 0,
    status         TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | discarded
    created_at     INTEGER NOT NULL,
    decided_at     INTEGER,
    FOREIGN KEY (turn_id) REFERENCES composer_turns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_composer_edits_pane_status ON composer_edits(pane_id, status);
CREATE INDEX IF NOT EXISTS idx_composer_edits_turn        ON composer_edits(turn_id);
