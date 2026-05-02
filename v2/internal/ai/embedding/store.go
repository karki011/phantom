// Author: Subash Karki
package embedding

import (
	"database/sql"
	"encoding/binary"
	"fmt"
	"log/slog"
	"math"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Memory represents a stored vector embedding with metadata.
type Memory struct {
	ID          string
	MemoryType  string // "decision", "pattern", "file", "session"
	SourceID    string
	TextContent string
	Vector      []float32
	Score       float64   // populated on retrieval
	CreatedAt   time.Time
	ExpiresAt   *time.Time
}

// StoreStats reports vector store metrics.
type StoreStats struct {
	TotalMemories  int
	ByType         map[string]int
	IndexSize      int
	EmbedderActive bool
}

// VectorStore provides semantic search over Memory entries using an in-memory
// cosine-similarity index backed by SQLite persistence. The HNSW index is
// rebuilt from the database on startup.
type VectorStore struct {
	db       *sql.DB
	embedder Embedder
	// In-memory index: ID -> Memory (for cosine search).
	memories map[string]*Memory
	mu       sync.RWMutex
}

// NewVectorStore creates a store, ensures the schema exists, and loads all
// existing embeddings into the in-memory index. Returns an error only if the
// database is inaccessible.
func NewVectorStore(db *sql.DB, embedder Embedder) (*VectorStore, error) {
	vs := &VectorStore{
		db:       db,
		embedder: embedder,
		memories: make(map[string]*Memory),
	}
	if err := vs.ensureSchema(); err != nil {
		return nil, fmt.Errorf("embedding store schema: %w", err)
	}
	if err := vs.loadAll(); err != nil {
		slog.Warn("embedding: failed to load existing vectors — starting empty", "err", err)
	}
	return vs, nil
}

// Store embeds text and persists it as a Memory entry. If a memory with the
// same (memoryType, sourceID) exists, it is replaced (upsert).
func (vs *VectorStore) Store(memoryType, sourceID, text string) error {
	vec, err := vs.embedder.Embed(text)
	if err != nil {
		slog.Debug("embedding: embed failed, storing text without vector", "type", memoryType, "err", err)
		vec = nil
	}

	id := uuid.New().String()
	blob := vectorToBlob(vec)

	vs.mu.Lock()
	defer vs.mu.Unlock()

	// Upsert: delete old entry with same type+source first.
	_, _ = vs.db.Exec(
		"DELETE FROM ai_embeddings WHERE memory_type = ? AND source_id = ?",
		memoryType, sourceID,
	)
	// Remove from in-memory index.
	for mid, m := range vs.memories {
		if m.MemoryType == memoryType && m.SourceID == sourceID {
			delete(vs.memories, mid)
			break
		}
	}

	_, err = vs.db.Exec(
		"INSERT INTO ai_embeddings (id, memory_type, source_id, text_content, vector) VALUES (?, ?, ?, ?, ?)",
		id, memoryType, sourceID, text, blob,
	)
	if err != nil {
		return fmt.Errorf("insert embedding: %w", err)
	}

	vs.memories[id] = &Memory{
		ID:          id,
		MemoryType:  memoryType,
		SourceID:    sourceID,
		TextContent: text,
		Vector:      vec,
		CreatedAt:   time.Now(),
	}
	return nil
}

// StoreWithTTL is like Store but sets an expiration time.
func (vs *VectorStore) StoreWithTTL(memoryType, sourceID, text string, ttl time.Duration) error {
	vec, err := vs.embedder.Embed(text)
	if err != nil {
		slog.Debug("embedding: embed failed, storing text without vector", "type", memoryType, "err", err)
		vec = nil
	}

	id := uuid.New().String()
	blob := vectorToBlob(vec)
	expiresAt := time.Now().Add(ttl)

	vs.mu.Lock()
	defer vs.mu.Unlock()

	_, _ = vs.db.Exec(
		"DELETE FROM ai_embeddings WHERE memory_type = ? AND source_id = ?",
		memoryType, sourceID,
	)
	for mid, m := range vs.memories {
		if m.MemoryType == memoryType && m.SourceID == sourceID {
			delete(vs.memories, mid)
			break
		}
	}

	_, err = vs.db.Exec(
		"INSERT INTO ai_embeddings (id, memory_type, source_id, text_content, vector, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
		id, memoryType, sourceID, text, blob, expiresAt,
	)
	if err != nil {
		return fmt.Errorf("insert embedding: %w", err)
	}

	vs.memories[id] = &Memory{
		ID:          id,
		MemoryType:  memoryType,
		SourceID:    sourceID,
		TextContent: text,
		Vector:      vec,
		CreatedAt:   time.Now(),
		ExpiresAt:   &expiresAt,
	}
	return nil
}

// FindSimilar returns up to topK memories whose embeddings are most similar to
// the query text, filtered by optional memoryTypes. Results are sorted by
// descending similarity score.
func (vs *VectorStore) FindSimilar(query string, topK int, memoryTypes ...string) ([]Memory, error) {
	queryVec, err := vs.embedder.Embed(query)
	if err != nil {
		return nil, fmt.Errorf("embed query: %w", err)
	}

	vs.mu.RLock()
	defer vs.mu.RUnlock()

	typeFilter := make(map[string]bool, len(memoryTypes))
	for _, t := range memoryTypes {
		typeFilter[t] = true
	}

	// Collect candidates.
	candidates := make([]ScoredVector, 0, len(vs.memories))
	idToMemory := make(map[string]*Memory, len(vs.memories))
	now := time.Now()
	for _, m := range vs.memories {
		// Skip expired.
		if m.ExpiresAt != nil && m.ExpiresAt.Before(now) {
			continue
		}
		// Skip if type filter is active and doesn't match.
		if len(typeFilter) > 0 && !typeFilter[m.MemoryType] {
			continue
		}
		candidates = append(candidates, ScoredVector{
			ID:     m.ID,
			Vector: m.Vector,
		})
		idToMemory[m.ID] = m
	}

	results := TopK(queryVec, candidates, topK)

	out := make([]Memory, 0, len(results))
	for _, r := range results {
		m := idToMemory[r.ID]
		out = append(out, Memory{
			ID:          m.ID,
			MemoryType:  m.MemoryType,
			SourceID:    m.SourceID,
			TextContent: m.TextContent,
			Vector:      m.Vector,
			Score:       float64(r.Score),
			CreatedAt:   m.CreatedAt,
			ExpiresAt:   m.ExpiresAt,
		})
	}
	return out, nil
}

// Delete removes all memories matching the given type and sourceID.
func (vs *VectorStore) Delete(memoryType, sourceID string) error {
	vs.mu.Lock()
	defer vs.mu.Unlock()

	_, err := vs.db.Exec(
		"DELETE FROM ai_embeddings WHERE memory_type = ? AND source_id = ?",
		memoryType, sourceID,
	)
	if err != nil {
		return fmt.Errorf("delete embedding: %w", err)
	}

	for id, m := range vs.memories {
		if m.MemoryType == memoryType && m.SourceID == sourceID {
			delete(vs.memories, id)
		}
	}
	return nil
}

// PruneExpired removes all memories past their expires_at. Returns the number
// of rows deleted.
func (vs *VectorStore) PruneExpired() (int, error) {
	vs.mu.Lock()
	defer vs.mu.Unlock()

	now := time.Now()

	res, err := vs.db.Exec(
		"DELETE FROM ai_embeddings WHERE expires_at IS NOT NULL AND expires_at < ?",
		now,
	)
	if err != nil {
		return 0, fmt.Errorf("prune expired: %w", err)
	}
	affected, _ := res.RowsAffected()

	// Prune in-memory index.
	for id, m := range vs.memories {
		if m.ExpiresAt != nil && m.ExpiresAt.Before(now) {
			delete(vs.memories, id)
		}
	}
	return int(affected), nil
}

// RebuildIndex drops the in-memory index and reloads from SQLite.
func (vs *VectorStore) RebuildIndex() error {
	vs.mu.Lock()
	defer vs.mu.Unlock()

	vs.memories = make(map[string]*Memory)
	return vs.loadAll()
}

// Stats returns current store metrics.
func (vs *VectorStore) Stats() StoreStats {
	vs.mu.RLock()
	defer vs.mu.RUnlock()

	byType := make(map[string]int)
	for _, m := range vs.memories {
		byType[m.MemoryType]++
	}

	return StoreStats{
		TotalMemories:  len(vs.memories),
		ByType:         byType,
		IndexSize:      len(vs.memories),
		EmbedderActive: vs.embedder != nil,
	}
}

// --- internal helpers ---

// ensureSchema creates the ai_embeddings table if it doesn't exist.
// This is a fallback for environments where the migration hasn't run yet.
func (vs *VectorStore) ensureSchema() error {
	_, err := vs.db.Exec(`
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
	`)
	return err
}

// loadAll reads every row from ai_embeddings into the in-memory index.
// Caller must NOT hold vs.mu.
func (vs *VectorStore) loadAll() error {
	rows, err := vs.db.Query(
		"SELECT id, memory_type, source_id, text_content, vector, created_at, expires_at FROM ai_embeddings",
	)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var (
			m         Memory
			blob      []byte
			expiresAt sql.NullTime
		)
		if err := rows.Scan(&m.ID, &m.MemoryType, &m.SourceID, &m.TextContent, &blob, &m.CreatedAt, &expiresAt); err != nil {
			slog.Warn("embedding: skip corrupt row", "err", err)
			continue
		}
		if expiresAt.Valid {
			t := expiresAt.Time
			m.ExpiresAt = &t
		}
		m.Vector = blobToVector(blob)
		if len(m.Vector) != Dimensions {
			slog.Warn("embedding: skip row with wrong dimensions", "id", m.ID, "got", len(m.Vector))
			continue
		}
		vs.memories[m.ID] = &m
	}
	return rows.Err()
}

// vectorToBlob serializes a float32 slice to raw little-endian bytes.
// 384 floats * 4 bytes = 1536 bytes.
func vectorToBlob(v []float32) []byte {
	buf := make([]byte, len(v)*4)
	for i, f := range v {
		binary.LittleEndian.PutUint32(buf[i*4:], math.Float32bits(f))
	}
	return buf
}

// blobToVector deserializes raw little-endian bytes back to float32 slice.
func blobToVector(b []byte) []float32 {
	n := len(b) / 4
	v := make([]float32, n)
	for i := 0; i < n; i++ {
		v[i] = math.Float32frombits(binary.LittleEndian.Uint32(b[i*4:]))
	}
	return v
}
