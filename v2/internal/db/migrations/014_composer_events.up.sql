-- Author: Subash Karki
CREATE TABLE IF NOT EXISTS composer_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    turn_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    seq INTEGER NOT NULL DEFAULT 0,
    type TEXT NOT NULL,
    subtype TEXT DEFAULT '',
    tool_name TEXT DEFAULT '',
    tool_use_id TEXT DEFAULT '',
    content TEXT DEFAULT '',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (turn_id) REFERENCES composer_turns(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_composer_events_turn ON composer_events(turn_id, seq);
CREATE INDEX IF NOT EXISTS idx_composer_events_session ON composer_events(session_id);
