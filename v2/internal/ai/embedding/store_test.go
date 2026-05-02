// Author: Subash Karki
package embedding

import (
	"crypto/sha256"
	"database/sql"
	"encoding/binary"
	"math"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

// MockEmbedder returns deterministic vectors by hashing the input text.
// This makes test assertions stable and reproducible.
type MockEmbedder struct {
	dim int
}

func NewMockEmbedder() *MockEmbedder {
	return &MockEmbedder{dim: Dimensions}
}

func (m *MockEmbedder) Embed(text string) ([]float32, error) {
	return deterministicVector(text, m.dim), nil
}

func (m *MockEmbedder) EmbedBatch(texts []string) ([][]float32, error) {
	out := make([][]float32, len(texts))
	for i, t := range texts {
		out[i] = deterministicVector(t, m.dim)
	}
	return out, nil
}

func (m *MockEmbedder) Dimensions() int { return m.dim }
func (m *MockEmbedder) Close() error    { return nil }

// deterministicVector produces a normalized float32 vector from a text hash.
func deterministicVector(text string, dim int) []float32 {
	h := sha256.Sum256([]byte(text))
	v := make([]float32, dim)
	for i := range v {
		// Cycle through hash bytes to fill the vector.
		idx := i % len(h)
		v[i] = float32(h[idx]) / 255.0
		// Add position-dependent variation so "hello" != shifted "hello".
		v[i] += float32(i) * 0.001
	}
	return Normalize(v)
}

// openTestDB creates a fresh in-memory SQLite database for testing.
func openTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestVectorStore_StoreAndRetrieve(t *testing.T) {
	db := openTestDB(t)
	embedder := NewMockEmbedder()
	vs, err := NewVectorStore(db, embedder)
	if err != nil {
		t.Fatalf("NewVectorStore: %v", err)
	}

	// Store a memory.
	if err := vs.Store("decision", "d-1", "refactor authentication module"); err != nil {
		t.Fatalf("Store: %v", err)
	}

	// Retrieve by querying the same text — should get high similarity.
	results, err := vs.FindSimilar("refactor authentication module", 5)
	if err != nil {
		t.Fatalf("FindSimilar: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("want 1 result, got %d", len(results))
	}
	if results[0].SourceID != "d-1" {
		t.Errorf("want sourceID 'd-1', got %q", results[0].SourceID)
	}
	if results[0].Score < 0.99 {
		t.Errorf("same-text similarity should be ~1.0, got %f", results[0].Score)
	}
}

func TestVectorStore_FindSimilar_Ordering(t *testing.T) {
	db := openTestDB(t)
	embedder := NewMockEmbedder()
	vs, err := NewVectorStore(db, embedder)
	if err != nil {
		t.Fatalf("NewVectorStore: %v", err)
	}

	// Store several memories with different texts.
	texts := []struct {
		typ, src, text string
	}{
		{"pattern", "p-1", "golang error handling best practices"},
		{"pattern", "p-2", "python error handling best practices"},
		{"pattern", "p-3", "kubernetes deployment strategies"},
	}
	for _, tt := range texts {
		if err := vs.Store(tt.typ, tt.src, tt.text); err != nil {
			t.Fatalf("Store %s: %v", tt.src, err)
		}
	}

	results, err := vs.FindSimilar("golang error handling best practices", 3)
	if err != nil {
		t.Fatalf("FindSimilar: %v", err)
	}
	if len(results) != 3 {
		t.Fatalf("want 3 results, got %d", len(results))
	}

	// The exact match should be first.
	if results[0].SourceID != "p-1" {
		t.Errorf("first result: want 'p-1' (exact match), got %q", results[0].SourceID)
	}
	// Scores should be descending.
	for i := 1; i < len(results); i++ {
		if results[i].Score > results[i-1].Score {
			t.Errorf("results not sorted: [%d].Score=%f > [%d].Score=%f",
				i, results[i].Score, i-1, results[i-1].Score)
		}
	}
}

func TestVectorStore_FindSimilar_TypeFilter(t *testing.T) {
	db := openTestDB(t)
	embedder := NewMockEmbedder()
	vs, err := NewVectorStore(db, embedder)
	if err != nil {
		t.Fatalf("NewVectorStore: %v", err)
	}

	_ = vs.Store("decision", "d-1", "some decision")
	_ = vs.Store("pattern", "p-1", "some pattern")

	// Filter to only "pattern" type.
	results, err := vs.FindSimilar("some", 10, "pattern")
	if err != nil {
		t.Fatalf("FindSimilar: %v", err)
	}
	for _, r := range results {
		if r.MemoryType != "pattern" {
			t.Errorf("type filter leak: got type %q, want 'pattern'", r.MemoryType)
		}
	}
}

func TestVectorStore_Delete(t *testing.T) {
	db := openTestDB(t)
	embedder := NewMockEmbedder()
	vs, err := NewVectorStore(db, embedder)
	if err != nil {
		t.Fatalf("NewVectorStore: %v", err)
	}

	_ = vs.Store("decision", "d-1", "delete me")
	_ = vs.Store("decision", "d-2", "keep me")

	if err := vs.Delete("decision", "d-1"); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	results, err := vs.FindSimilar("delete me", 10)
	if err != nil {
		t.Fatalf("FindSimilar: %v", err)
	}
	for _, r := range results {
		if r.SourceID == "d-1" {
			t.Error("deleted memory still returned by FindSimilar")
		}
	}

	// Verify only d-2 remains.
	stats := vs.Stats()
	if stats.TotalMemories != 1 {
		t.Errorf("want 1 memory after delete, got %d", stats.TotalMemories)
	}
}

func TestVectorStore_PruneExpired(t *testing.T) {
	db := openTestDB(t)
	embedder := NewMockEmbedder()
	vs, err := NewVectorStore(db, embedder)
	if err != nil {
		t.Fatalf("NewVectorStore: %v", err)
	}

	// Store one with TTL already expired.
	if err := vs.StoreWithTTL("session", "s-1", "expired session", -1*time.Hour); err != nil {
		t.Fatalf("StoreWithTTL: %v", err)
	}
	// Store one that won't expire.
	if err := vs.Store("session", "s-2", "active session"); err != nil {
		t.Fatalf("Store: %v", err)
	}

	pruned, err := vs.PruneExpired()
	if err != nil {
		t.Fatalf("PruneExpired: %v", err)
	}
	if pruned != 1 {
		t.Errorf("want 1 pruned, got %d", pruned)
	}

	stats := vs.Stats()
	if stats.TotalMemories != 1 {
		t.Errorf("want 1 remaining after prune, got %d", stats.TotalMemories)
	}
}

func TestVectorStore_Stats(t *testing.T) {
	db := openTestDB(t)
	embedder := NewMockEmbedder()
	vs, err := NewVectorStore(db, embedder)
	if err != nil {
		t.Fatalf("NewVectorStore: %v", err)
	}

	_ = vs.Store("decision", "d-1", "decision one")
	_ = vs.Store("decision", "d-2", "decision two")
	_ = vs.Store("pattern", "p-1", "pattern one")

	stats := vs.Stats()
	if stats.TotalMemories != 3 {
		t.Errorf("TotalMemories: want 3, got %d", stats.TotalMemories)
	}
	if stats.ByType["decision"] != 2 {
		t.Errorf("ByType[decision]: want 2, got %d", stats.ByType["decision"])
	}
	if stats.ByType["pattern"] != 1 {
		t.Errorf("ByType[pattern]: want 1, got %d", stats.ByType["pattern"])
	}
	if !stats.EmbedderActive {
		t.Error("EmbedderActive should be true")
	}
}

func TestVectorStore_Upsert(t *testing.T) {
	db := openTestDB(t)
	embedder := NewMockEmbedder()
	vs, err := NewVectorStore(db, embedder)
	if err != nil {
		t.Fatalf("NewVectorStore: %v", err)
	}

	// Store then re-store with same type+source.
	_ = vs.Store("decision", "d-1", "original text")
	_ = vs.Store("decision", "d-1", "updated text")

	stats := vs.Stats()
	if stats.TotalMemories != 1 {
		t.Errorf("upsert should yield 1 memory, got %d", stats.TotalMemories)
	}

	results, err := vs.FindSimilar("updated text", 1)
	if err != nil {
		t.Fatalf("FindSimilar: %v", err)
	}
	if len(results) == 0 {
		t.Fatal("expected 1 result after upsert")
	}
	if results[0].TextContent != "updated text" {
		t.Errorf("upsert text: want 'updated text', got %q", results[0].TextContent)
	}
}

func TestVectorStore_RebuildIndex(t *testing.T) {
	db := openTestDB(t)
	embedder := NewMockEmbedder()
	vs, err := NewVectorStore(db, embedder)
	if err != nil {
		t.Fatalf("NewVectorStore: %v", err)
	}

	_ = vs.Store("file", "f-1", "main.go contents")
	_ = vs.Store("file", "f-2", "util.go contents")

	if err := vs.RebuildIndex(); err != nil {
		t.Fatalf("RebuildIndex: %v", err)
	}

	stats := vs.Stats()
	if stats.TotalMemories != 2 {
		t.Errorf("after rebuild: want 2 memories, got %d", stats.TotalMemories)
	}
}

func TestVectorToBlob_RoundTrip(t *testing.T) {
	original := []float32{1.0, -0.5, 0.0, math.MaxFloat32, math.SmallestNonzeroFloat32}
	blob := vectorToBlob(original)
	recovered := blobToVector(blob)

	if len(recovered) != len(original) {
		t.Fatalf("length mismatch: want %d, got %d", len(original), len(recovered))
	}
	for i := range original {
		if original[i] != recovered[i] {
			bits := binary.LittleEndian.Uint32(blob[i*4:])
			t.Errorf("index %d: want %f, got %f (bits: %032b)", i, original[i], recovered[i], bits)
		}
	}
}
