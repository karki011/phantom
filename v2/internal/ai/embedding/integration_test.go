// Author: Subash Karki
//
// Integration tests for the VectorStore semantic pipeline: store -> find -> delete -> prune.
package embedding

import (
	"testing"
	"time"
)

// TestVectorStore_SemanticPipeline exercises the full lifecycle:
// store decisions -> find similar -> delete one -> verify removal -> prune expired.
func TestVectorStore_SemanticPipeline(t *testing.T) {
	db := openTestDB(t)
	embedder := NewMockEmbedder()
	vs, err := NewVectorStore(db, embedder)
	if err != nil {
		t.Fatalf("NewVectorStore: %v", err)
	}

	// Store 5 decisions with different text.
	decisions := []struct {
		src, text string
	}{
		{"d-1", "refactor authentication module for better security"},
		{"d-2", "add caching layer to database queries"},
		{"d-3", "fix authentication bug in login flow"},
		{"d-4", "deploy kubernetes cluster monitoring"},
		{"d-5", "optimize database connection pooling"},
	}
	for _, d := range decisions {
		if err := vs.Store("decision", d.src, d.text); err != nil {
			t.Fatalf("Store %s: %v", d.src, err)
		}
	}

	// Verify all 5 are stored.
	stats := vs.Stats()
	if stats.TotalMemories != 5 {
		t.Fatalf("expected 5 memories after store, got %d", stats.TotalMemories)
	}

	// FindSimilar with exact text should return the exact entry as top-1.
	results, err := vs.FindSimilar("refactor authentication module for better security", 3)
	if err != nil {
		t.Fatalf("FindSimilar: %v", err)
	}
	if len(results) != 3 {
		t.Fatalf("FindSimilar: expected 3 results, got %d", len(results))
	}

	// The closest match should be d-1 (exact text match).
	if results[0].SourceID != "d-1" {
		t.Errorf("expected exact-text match d-1 as top result, got %q", results[0].SourceID)
	}
	// Exact match should have near-perfect similarity.
	if results[0].Score < 0.99 {
		t.Errorf("exact-text similarity should be ~1.0, got %f", results[0].Score)
	}

	// Verify scores are descending.
	for i := 1; i < len(results); i++ {
		if results[i].Score > results[i-1].Score {
			t.Errorf("results not sorted: [%d].Score=%f > [%d].Score=%f",
				i, results[i].Score, i-1, results[i-1].Score)
		}
	}

	// Delete one decision.
	if err := vs.Delete("decision", "d-1"); err != nil {
		t.Fatalf("Delete d-1: %v", err)
	}

	// Verify it's no longer returned.
	results, err = vs.FindSimilar("refactor authentication module for better security", 10)
	if err != nil {
		t.Fatalf("FindSimilar after delete: %v", err)
	}
	for _, r := range results {
		if r.SourceID == "d-1" {
			t.Error("deleted decision d-1 still returned by FindSimilar")
		}
	}

	// Verify count is 4.
	stats = vs.Stats()
	if stats.TotalMemories != 4 {
		t.Fatalf("expected 4 memories after delete, got %d", stats.TotalMemories)
	}
}

// TestVectorStore_StoreAndPruneExpired tests TTL-based storage and pruning.
func TestVectorStore_StoreAndPruneExpired(t *testing.T) {
	db := openTestDB(t)
	embedder := NewMockEmbedder()
	vs, err := NewVectorStore(db, embedder)
	if err != nil {
		t.Fatalf("NewVectorStore: %v", err)
	}

	// Store one with already-expired TTL.
	if err := vs.StoreWithTTL("session", "s-expired", "old session data", -1*time.Hour); err != nil {
		t.Fatalf("StoreWithTTL (expired): %v", err)
	}
	// Store one with a future TTL.
	if err := vs.StoreWithTTL("session", "s-active", "active session data", 24*time.Hour); err != nil {
		t.Fatalf("StoreWithTTL (active): %v", err)
	}
	// Store one without TTL.
	if err := vs.Store("decision", "d-permanent", "permanent decision"); err != nil {
		t.Fatalf("Store (permanent): %v", err)
	}

	// FindSimilar should skip expired entries.
	results, err := vs.FindSimilar("session data", 10)
	if err != nil {
		t.Fatalf("FindSimilar: %v", err)
	}
	for _, r := range results {
		if r.SourceID == "s-expired" {
			t.Error("expired memory returned by FindSimilar")
		}
	}

	// PruneExpired should remove the expired entry.
	pruned, err := vs.PruneExpired()
	if err != nil {
		t.Fatalf("PruneExpired: %v", err)
	}
	if pruned != 1 {
		t.Errorf("expected 1 pruned, got %d", pruned)
	}

	// Verify only 2 remain.
	stats := vs.Stats()
	if stats.TotalMemories != 2 {
		t.Errorf("expected 2 memories after prune, got %d", stats.TotalMemories)
	}
}

// TestVectorStore_RebuildAndPersistence verifies that data survives a rebuild.
func TestVectorStore_RebuildAndPersistence(t *testing.T) {
	db := openTestDB(t)
	embedder := NewMockEmbedder()
	vs, err := NewVectorStore(db, embedder)
	if err != nil {
		t.Fatalf("NewVectorStore: %v", err)
	}

	// Store data.
	if err := vs.Store("file", "f-1", "main.go authentication handler"); err != nil {
		t.Fatalf("Store: %v", err)
	}
	if err := vs.Store("file", "f-2", "utils.go string helpers"); err != nil {
		t.Fatalf("Store: %v", err)
	}

	// Rebuild index from SQLite.
	if err := vs.RebuildIndex(); err != nil {
		t.Fatalf("RebuildIndex: %v", err)
	}

	// Data should still be findable — exact text query should return that entry first.
	results, err := vs.FindSimilar("main.go authentication handler", 5)
	if err != nil {
		t.Fatalf("FindSimilar after rebuild: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 results after rebuild, got %d", len(results))
	}

	// Verify both entries survived the rebuild.
	sourceIDs := map[string]bool{}
	for _, r := range results {
		sourceIDs[r.SourceID] = true
	}
	if !sourceIDs["f-1"] || !sourceIDs["f-2"] {
		t.Errorf("expected both f-1 and f-2 after rebuild, got %v", sourceIDs)
	}
}

// TestVectorStore_TypeFilterPipeline verifies filtering across multiple types.
func TestVectorStore_TypeFilterPipeline(t *testing.T) {
	db := openTestDB(t)
	embedder := NewMockEmbedder()
	vs, err := NewVectorStore(db, embedder)
	if err != nil {
		t.Fatalf("NewVectorStore: %v", err)
	}

	// Store entries across different types.
	_ = vs.Store("decision", "d-1", "fix authentication bug")
	_ = vs.Store("pattern", "p-1", "authentication middleware pattern")
	_ = vs.Store("file", "f-1", "auth.go file content")
	_ = vs.Store("session", "s-1", "debugging authentication session")

	// Filter to "decision" type only.
	results, err := vs.FindSimilar("authentication", 10, "decision")
	if err != nil {
		t.Fatalf("FindSimilar with type filter: %v", err)
	}
	for _, r := range results {
		if r.MemoryType != "decision" {
			t.Errorf("type filter leak: got %q, want 'decision'", r.MemoryType)
		}
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result for decision filter, got %d", len(results))
	}

	// Filter to multiple types.
	results, err = vs.FindSimilar("authentication", 10, "decision", "pattern")
	if err != nil {
		t.Fatalf("FindSimilar with multi-type filter: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 results for decision+pattern filter, got %d", len(results))
	}
}
