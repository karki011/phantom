CREATE TABLE IF NOT EXISTS extraction_offsets (
    session_id TEXT PRIMARY KEY,
    byte_offset INTEGER NOT NULL DEFAULT 0,
    event_count INTEGER NOT NULL DEFAULT 0,
    last_extracted_at INTEGER NOT NULL
);

ALTER TABLE sessions ADD COLUMN session_profile TEXT DEFAULT '';
