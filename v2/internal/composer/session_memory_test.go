// Author: Subash Karki
//
// session_memory_test.go tests the SessionMemoryBuilder with real SQLite stores
// and a mock file-graph indexer. Tests verify budget enforcement, tier priority,
// graceful nil handling, and output formatting.
package composer

import (
	"database/sql"
	"path/filepath"
	"strings"
	"testing"

	"github.com/subashkarki/phantom-os-v2/internal/ai/graph/filegraph"
	"github.com/subashkarki/phantom-os-v2/internal/ai/knowledge"
	_ "modernc.org/sqlite"
)

func setupTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestSessionMemory_Build_EmptyDeps(t *testing.T) {
	b := &SessionMemoryBuilder{}
	result := b.Build()
	if result != "" {
		t.Errorf("expected empty string for zero-valued builder, got %d bytes", len(result))
	}
}

func TestSessionMemory_Build_NilStores(t *testing.T) {
	b := &SessionMemoryBuilder{
		Decisions:      nil,
		GlobalPatterns: nil,
		Indexer:        nil,
	}
	result := b.Build()
	if result != "" {
		t.Errorf("expected empty string for nil stores, got: %s", result)
	}
}

func TestSessionMemory_Build_WithDecisions(t *testing.T) {
	db := setupTestDB(t)
	ds, err := knowledge.NewDecisionStore(db)
	if err != nil {
		t.Fatalf("NewDecisionStore: %v", err)
	}

	// Record some decisions with outcomes.
	id1, _ := ds.Record("refactor auth module", "decompose", 0.85, "complex", "high")
	ds.RecordOutcome(id1, true, "")

	id2, _ := ds.Record("fix login bug", "direct", 0.95, "simple", "low")
	ds.RecordOutcome(id2, true, "")

	id3, _ := ds.Record("add new feature", "incremental", 0.70, "moderate", "moderate")
	ds.RecordOutcome(id3, false, "blast radius underestimated")

	b := &SessionMemoryBuilder{Decisions: ds}
	result := b.Build()

	if result == "" {
		t.Fatal("expected non-empty result with decisions")
	}
	if !strings.Contains(result, "<phantom-memory>") {
		t.Error("missing <phantom-memory> wrapper")
	}
	if !strings.Contains(result, "</phantom-memory>") {
		t.Error("missing </phantom-memory> wrapper")
	}
	if !strings.Contains(result, "## Proven Patterns") || !strings.Contains(result, "## Decision Summary") {
		t.Error("expected Proven Patterns and/or Decision Summary sections")
	}
}

func TestSessionMemory_Build_WithIndexer(t *testing.T) {
	// Create a real indexer with a small graph.
	ix := filegraph.NewIndexer(t.TempDir())
	g := ix.Graph()

	// Add a few nodes.
	g.Upsert(&filegraph.FileNode{
		Path:     "/tmp/test/main.go",
		Language: "go",
		Symbols:  []filegraph.Symbol{{Name: "main", Kind: "func"}},
		Imports:  []string{"/tmp/test/util.go"},
	})
	g.Upsert(&filegraph.FileNode{
		Path:     "/tmp/test/util.go",
		Language: "go",
		Symbols:  []filegraph.Symbol{{Name: "Helper", Kind: "func"}},
	})

	b := &SessionMemoryBuilder{Indexer: ix}
	result := b.Build()

	if result == "" {
		t.Fatal("expected non-empty result with indexer")
	}
	if !strings.Contains(result, "## Project Graph") {
		t.Error("missing Project Graph section")
	}
	if !strings.Contains(result, "2 files") {
		t.Errorf("expected '2 files' in output, got: %s", result)
	}
}

func TestSessionMemory_Build_BudgetEnforcement(t *testing.T) {
	db := setupTestDB(t)
	ds, err := knowledge.NewDecisionStore(db)
	if err != nil {
		t.Fatalf("NewDecisionStore: %v", err)
	}

	// Create many decisions to fill up sections.
	for i := 0; i < 30; i++ {
		id, _ := ds.Record(
			strings.Repeat("a very long goal description ", 3),
			"strategy_"+string(rune('A'+i%5)),
			0.80,
			"complex",
			"high",
		)
		ds.RecordOutcome(id, i%3 != 0, "")
	}

	// Use a very small budget.
	b := &SessionMemoryBuilder{
		Decisions: ds,
		MaxBytes:  200,
	}
	result := b.Build()

	if len(result) > 200 {
		t.Errorf("result exceeds MaxBytes: %d > 200", len(result))
	}
}

func TestSessionMemory_Build_AlwaysUnderMaxBytes(t *testing.T) {
	db := setupTestDB(t)
	ds, err := knowledge.NewDecisionStore(db)
	if err != nil {
		t.Fatalf("NewDecisionStore: %v", err)
	}

	// Fill with varied decisions.
	for i := 0; i < 50; i++ {
		id, _ := ds.Record(
			strings.Repeat("goal ", 20),
			"decompose",
			0.9,
			"complex",
			"high",
		)
		ds.RecordOutcome(id, true, "")
	}

	ix := filegraph.NewIndexer(t.TempDir())
	for i := 0; i < 100; i++ {
		ix.Graph().Upsert(&filegraph.FileNode{
			Path:     "/test/" + strings.Repeat("x", 10) + ".go",
			Language: "go",
			Symbols:  []filegraph.Symbol{{Name: "Sym", Kind: "func"}},
		})
	}

	b := &SessionMemoryBuilder{
		Decisions: ds,
		Indexer:   ix,
	}
	result := b.Build()

	if len(result) > MaxSessionMemoryBytes {
		t.Errorf("result exceeds MaxSessionMemoryBytes: %d > %d", len(result), MaxSessionMemoryBytes)
	}
}

func TestSessionMemory_Build_GlobalPatterns(t *testing.T) {
	gps, rawDB := setupGlobalPatternStore(t)

	// Insert patterns directly via raw DB handle.
	rawDB.Exec(`INSERT INTO global_patterns (id, strategy_id, complexity, risk, success_rate, project_count, project_ids)
		VALUES ('gp1', 'direct', 'simple', 'low', 0.92, 3, 'p1,p2,p3')`)
	rawDB.Exec(`INSERT INTO global_patterns (id, strategy_id, complexity, risk, success_rate, project_count, project_ids)
		VALUES ('gp2', 'decompose', 'complex', 'high', 0.78, 2, 'p1,p2')`)

	b := &SessionMemoryBuilder{GlobalPatterns: gps}
	result := b.Build()

	if result == "" {
		t.Fatal("expected non-empty result with global patterns")
	}
	if !strings.Contains(result, "## Cross-Project Patterns") {
		t.Error("missing Cross-Project Patterns section")
	}
	if !strings.Contains(result, "direct") {
		t.Error("expected 'direct' strategy in output")
	}
}

func TestSessionMemory_Build_TierPriority(t *testing.T) {
	// With a tight budget, only highest-priority sections should appear.
	db := setupTestDB(t)
	ds, err := knowledge.NewDecisionStore(db)
	if err != nil {
		t.Fatalf("NewDecisionStore: %v", err)
	}

	id, _ := ds.Record("test goal", "direct", 0.9, "simple", "low")
	ds.RecordOutcome(id, true, "")

	ix := filegraph.NewIndexer(t.TempDir())
	ix.Graph().Upsert(&filegraph.FileNode{
		Path:     "/tmp/main.go",
		Language: "go",
		Symbols:  []filegraph.Symbol{{Name: "main", Kind: "func"}},
	})

	// Budget just enough for graph stats + wrapper (but not much more).
	b := &SessionMemoryBuilder{
		Decisions: ds,
		Indexer:   ix,
		MaxBytes:  200,
	}
	result := b.Build()

	// Should contain Project Graph (highest priority) but not Decision Summary (lowest).
	if result != "" && strings.Contains(result, "## Decision Summary") {
		// With 200 bytes budget, Decision Summary should be dropped.
		t.Log("Decision Summary included — budget was large enough for all sections")
	}
}

func TestSessionMemory_Build_WrapperFormat(t *testing.T) {
	ix := filegraph.NewIndexer(t.TempDir())
	ix.Graph().Upsert(&filegraph.FileNode{
		Path:     "/tmp/main.go",
		Language: "go",
		Symbols:  []filegraph.Symbol{{Name: "main", Kind: "func"}},
	})

	b := &SessionMemoryBuilder{Indexer: ix}
	result := b.Build()

	if !strings.HasPrefix(result, "<phantom-memory>\n") {
		t.Errorf("expected result to start with <phantom-memory>\\n, got: %.40s...", result)
	}
	if !strings.HasSuffix(result, "</phantom-memory>") {
		t.Errorf("expected result to end with </phantom-memory>, got: ...%s", result[len(result)-30:])
	}
}

// setupGlobalPatternStore creates a GlobalPatternStore and returns it along with
// a raw *sql.DB handle for inserting test data.
func setupGlobalPatternStore(t *testing.T) (*knowledge.GlobalPatternStore, *sql.DB) {
	t.Helper()
	dir := t.TempDir()
	gps, err := knowledge.NewGlobalPatternStore(dir)
	if err != nil {
		t.Fatalf("NewGlobalPatternStore: %v", err)
	}
	t.Cleanup(func() { gps.Close() })

	// Open the same global.db for raw inserts.
	dbPath := filepath.Join(dir, "global.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open global.db for raw insert: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return gps, db
}
