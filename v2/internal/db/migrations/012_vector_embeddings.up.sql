CREATE TABLE IF NOT EXISTS ai_embeddings (
    id TEXT PRIMARY KEY,
    memory_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    text_content TEXT NOT NULL,
    vector BLOB NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    UNIQUE(memory_type, source_id)
);
CREATE INDEX IF NOT EXISTS idx_embeddings_type ON ai_embeddings(memory_type);
CREATE INDEX IF NOT EXISTS idx_embeddings_source ON ai_embeddings(source_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_expires ON ai_embeddings(expires_at);
