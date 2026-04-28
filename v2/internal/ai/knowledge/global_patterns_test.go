// global_patterns_test.go tests cross-project knowledge transfer via GlobalPatternStore.
// Author: Subash Karki
package knowledge

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

// createProjectDB creates a per-project SQLite DB with the ai_patterns table
// and inserts the given active patterns. Returns the project ID (filename stem).
func createProjectDB(t *testing.T, dir, projectID string, patterns []projectPattern) {
	t.Helper()
	dbPath := filepath.Join(dir, projectID+".db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("failed to create project db %s: %v", projectID, err)
	}
	defer db.Close()

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS ai_patterns (
			id TEXT PRIMARY KEY,
			strategy_id TEXT NOT NULL,
			complexity TEXT NOT NULL,
			risk TEXT NOT NULL,
			success_rate REAL NOT NULL,
			status TEXT NOT NULL DEFAULT 'active'
		);
	`)
	if err != nil {
		t.Fatalf("failed to create ai_patterns table for %s: %v", projectID, err)
	}

	for i, p := range patterns {
		id := projectID + "-" + string(rune('a'+i))
		_, err = db.Exec(
			"INSERT INTO ai_patterns (id, strategy_id, complexity, risk, success_rate, status) VALUES (?, ?, ?, ?, ?, 'active')",
			id, p.StrategyID, p.Complexity, p.Risk, p.SuccessRate,
		)
		if err != nil {
			t.Fatalf("failed to insert pattern for %s: %v", projectID, err)
		}
	}
}

func TestAggregate_PromotesPatternIn3PlusProjects(t *testing.T) {
	dir := t.TempDir()

	pattern := projectPattern{StrategyID: "decompose", Complexity: "complex", Risk: "high", SuccessRate: 0.85}
	createProjectDB(t, dir, "proj-a", []projectPattern{pattern})
	createProjectDB(t, dir, "proj-b", []projectPattern{pattern})
	createProjectDB(t, dir, "proj-c", []projectPattern{pattern})

	store, err := NewGlobalPatternStore(dir)
	if err != nil {
		t.Fatalf("NewGlobalPatternStore failed: %v", err)
	}
	defer store.Close()

	err = store.Aggregate()
	if err != nil {
		t.Fatalf("Aggregate failed: %v", err)
	}

	all := store.GetAll()
	if len(all) != 1 {
		t.Fatalf("expected 1 global pattern, got %d", len(all))
	}
	if all[0].StrategyID != "decompose" {
		t.Errorf("expected strategy 'decompose', got %q", all[0].StrategyID)
	}
	if all[0].ProjectCount != 3 {
		t.Errorf("expected project_count=3, got %d", all[0].ProjectCount)
	}
	if all[0].SuccessRate != 0.85 {
		t.Errorf("expected success_rate=0.85, got %.4f", all[0].SuccessRate)
	}
}

func TestAggregate_DoesNotPromoteBelow3Projects(t *testing.T) {
	dir := t.TempDir()

	pattern := projectPattern{StrategyID: "direct", Complexity: "simple", Risk: "low", SuccessRate: 0.9}
	createProjectDB(t, dir, "proj-a", []projectPattern{pattern})
	createProjectDB(t, dir, "proj-b", []projectPattern{pattern})

	store, err := NewGlobalPatternStore(dir)
	if err != nil {
		t.Fatalf("NewGlobalPatternStore failed: %v", err)
	}
	defer store.Close()

	err = store.Aggregate()
	if err != nil {
		t.Fatalf("Aggregate failed: %v", err)
	}

	all := store.GetAll()
	if len(all) != 0 {
		t.Fatalf("expected 0 global patterns (only 2 projects), got %d", len(all))
	}
}

func TestAggregate_DoesNotPromoteLowSuccessRate(t *testing.T) {
	dir := t.TempDir()

	pattern := projectPattern{StrategyID: "direct", Complexity: "critical", Risk: "high", SuccessRate: 0.5}
	createProjectDB(t, dir, "proj-a", []projectPattern{pattern})
	createProjectDB(t, dir, "proj-b", []projectPattern{pattern})
	createProjectDB(t, dir, "proj-c", []projectPattern{pattern})

	store, err := NewGlobalPatternStore(dir)
	if err != nil {
		t.Fatalf("NewGlobalPatternStore failed: %v", err)
	}
	defer store.Close()

	err = store.Aggregate()
	if err != nil {
		t.Fatalf("Aggregate failed: %v", err)
	}

	all := store.GetAll()
	if len(all) != 0 {
		t.Fatalf("expected 0 global patterns (avg rate 0.5 <= 0.7), got %d", len(all))
	}
}

func TestAggregate_SkipsInactivePatterns(t *testing.T) {
	dir := t.TempDir()

	// Manually create a project DB with an inactive pattern.
	dbPath := filepath.Join(dir, "proj-inactive.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("failed to create project db: %v", err)
	}
	_, err = db.Exec(`
		CREATE TABLE ai_patterns (
			id TEXT PRIMARY KEY,
			strategy_id TEXT NOT NULL,
			complexity TEXT NOT NULL,
			risk TEXT NOT NULL,
			success_rate REAL NOT NULL,
			status TEXT NOT NULL DEFAULT 'active'
		);
		INSERT INTO ai_patterns (id, strategy_id, complexity, risk, success_rate, status)
		VALUES ('p1', 'decompose', 'complex', 'high', 0.9, 'deprecated');
	`)
	db.Close()
	if err != nil {
		t.Fatalf("failed to set up inactive pattern: %v", err)
	}

	// Create 2 more project DBs with active patterns (total only 2 active).
	pattern := projectPattern{StrategyID: "decompose", Complexity: "complex", Risk: "high", SuccessRate: 0.9}
	createProjectDB(t, dir, "proj-a", []projectPattern{pattern})
	createProjectDB(t, dir, "proj-b", []projectPattern{pattern})

	store, err := NewGlobalPatternStore(dir)
	if err != nil {
		t.Fatalf("NewGlobalPatternStore failed: %v", err)
	}
	defer store.Close()

	err = store.Aggregate()
	if err != nil {
		t.Fatalf("Aggregate failed: %v", err)
	}

	all := store.GetAll()
	if len(all) != 0 {
		t.Fatalf("expected 0 global patterns (inactive should be excluded, only 2 active), got %d", len(all))
	}
}

func TestAggregate_SkipsGlobalDB(t *testing.T) {
	dir := t.TempDir()

	pattern := projectPattern{StrategyID: "decompose", Complexity: "complex", Risk: "high", SuccessRate: 0.9}
	createProjectDB(t, dir, "proj-a", []projectPattern{pattern})
	createProjectDB(t, dir, "proj-b", []projectPattern{pattern})

	store, err := NewGlobalPatternStore(dir)
	if err != nil {
		t.Fatalf("NewGlobalPatternStore failed: %v", err)
	}
	defer store.Close()

	// global.db now exists in the directory. It should not be scanned as a project.
	err = store.Aggregate()
	if err != nil {
		t.Fatalf("Aggregate failed: %v", err)
	}

	// Only 2 projects, so nothing should be promoted.
	all := store.GetAll()
	if len(all) != 0 {
		t.Fatalf("expected 0 global patterns (global.db must be excluded), got %d", len(all))
	}
}

func TestAggregate_SkipsProjectsWithoutPatternsTable(t *testing.T) {
	dir := t.TempDir()

	// Create a project DB without the ai_patterns table.
	dbPath := filepath.Join(dir, "proj-no-table.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("failed to create project db: %v", err)
	}
	_, _ = db.Exec("CREATE TABLE IF NOT EXISTS ai_decisions (id TEXT PRIMARY KEY)")
	db.Close()

	pattern := projectPattern{StrategyID: "decompose", Complexity: "complex", Risk: "high", SuccessRate: 0.9}
	createProjectDB(t, dir, "proj-a", []projectPattern{pattern})
	createProjectDB(t, dir, "proj-b", []projectPattern{pattern})

	store, err := NewGlobalPatternStore(dir)
	if err != nil {
		t.Fatalf("NewGlobalPatternStore failed: %v", err)
	}
	defer store.Close()

	// Should not error — just skip the project without the table.
	err = store.Aggregate()
	if err != nil {
		t.Fatalf("Aggregate failed: %v", err)
	}
}

func TestSeedProject_ReturnsQualifyingPatterns(t *testing.T) {
	dir := t.TempDir()

	pattern := projectPattern{StrategyID: "decompose", Complexity: "complex", Risk: "high", SuccessRate: 0.85}
	createProjectDB(t, dir, "proj-a", []projectPattern{pattern})
	createProjectDB(t, dir, "proj-b", []projectPattern{pattern})
	createProjectDB(t, dir, "proj-c", []projectPattern{pattern})

	store, err := NewGlobalPatternStore(dir)
	if err != nil {
		t.Fatalf("NewGlobalPatternStore failed: %v", err)
	}
	defer store.Close()

	_ = store.Aggregate()

	seeds := store.SeedProject("new-project")
	if len(seeds) != 1 {
		t.Fatalf("expected 1 seed pattern, got %d", len(seeds))
	}
	if seeds[0].StrategyID != "decompose" {
		t.Errorf("expected strategy 'decompose', got %q", seeds[0].StrategyID)
	}
	if seeds[0].SuccessRate != 0.85 {
		t.Errorf("expected success_rate=0.85, got %.4f", seeds[0].SuccessRate)
	}
}

func TestSeedProject_ExcludesBorderlinePatterns(t *testing.T) {
	dir := t.TempDir()

	// Insert a pattern directly with exactly 0.7 success rate — should NOT be seeded (> 0.7 required).
	store, err := NewGlobalPatternStore(dir)
	if err != nil {
		t.Fatalf("NewGlobalPatternStore failed: %v", err)
	}
	defer store.Close()

	_, err = store.db.Exec(`
		INSERT INTO global_patterns (id, strategy_id, complexity, risk, success_rate, project_count, project_ids)
		VALUES ('p1', 'direct', 'simple', 'low', 0.7, 3, 'a,b,c')
	`)
	if err != nil {
		t.Fatalf("failed to insert borderline pattern: %v", err)
	}

	seeds := store.SeedProject("new-project")
	if len(seeds) != 0 {
		t.Fatalf("expected 0 seeds (rate=0.7 not > 0.7), got %d", len(seeds))
	}
}

func TestSeedProject_EmptyStore(t *testing.T) {
	dir := t.TempDir()

	store, err := NewGlobalPatternStore(dir)
	if err != nil {
		t.Fatalf("NewGlobalPatternStore failed: %v", err)
	}
	defer store.Close()

	seeds := store.SeedProject("new-project")
	if len(seeds) != 0 {
		t.Fatalf("expected 0 seeds for empty store, got %d", len(seeds))
	}
}

func TestGetAll_EmptyStore(t *testing.T) {
	dir := t.TempDir()

	store, err := NewGlobalPatternStore(dir)
	if err != nil {
		t.Fatalf("NewGlobalPatternStore failed: %v", err)
	}
	defer store.Close()

	all := store.GetAll()
	if len(all) != 0 {
		t.Fatalf("expected 0 patterns for empty store, got %d", len(all))
	}
}

func TestGetAll_ReturnsProjectIDs(t *testing.T) {
	dir := t.TempDir()

	pattern := projectPattern{StrategyID: "decompose", Complexity: "complex", Risk: "high", SuccessRate: 0.85}
	createProjectDB(t, dir, "proj-a", []projectPattern{pattern})
	createProjectDB(t, dir, "proj-b", []projectPattern{pattern})
	createProjectDB(t, dir, "proj-c", []projectPattern{pattern})

	store, err := NewGlobalPatternStore(dir)
	if err != nil {
		t.Fatalf("NewGlobalPatternStore failed: %v", err)
	}
	defer store.Close()

	_ = store.Aggregate()

	all := store.GetAll()
	if len(all) != 1 {
		t.Fatalf("expected 1 pattern, got %d", len(all))
	}
	if len(all[0].ProjectIDs) != 3 {
		t.Errorf("expected 3 project IDs, got %d", len(all[0].ProjectIDs))
	}
}

func TestAggregate_MultiplePatterns(t *testing.T) {
	dir := t.TempDir()

	high := projectPattern{StrategyID: "decompose", Complexity: "complex", Risk: "high", SuccessRate: 0.85}
	low := projectPattern{StrategyID: "direct", Complexity: "simple", Risk: "low", SuccessRate: 0.95}

	createProjectDB(t, dir, "proj-a", []projectPattern{high, low})
	createProjectDB(t, dir, "proj-b", []projectPattern{high, low})
	createProjectDB(t, dir, "proj-c", []projectPattern{high, low})

	store, err := NewGlobalPatternStore(dir)
	if err != nil {
		t.Fatalf("NewGlobalPatternStore failed: %v", err)
	}
	defer store.Close()

	err = store.Aggregate()
	if err != nil {
		t.Fatalf("Aggregate failed: %v", err)
	}

	all := store.GetAll()
	if len(all) != 2 {
		t.Fatalf("expected 2 global patterns, got %d", len(all))
	}
}

func TestAggregate_EmptyDirectory(t *testing.T) {
	dir := t.TempDir()

	store, err := NewGlobalPatternStore(dir)
	if err != nil {
		t.Fatalf("NewGlobalPatternStore failed: %v", err)
	}
	defer store.Close()

	err = store.Aggregate()
	if err != nil {
		t.Fatalf("Aggregate on empty dir failed: %v", err)
	}

	all := store.GetAll()
	if len(all) != 0 {
		t.Fatalf("expected 0 patterns for empty directory, got %d", len(all))
	}
}

func TestAggregate_SkipsNonDBFiles(t *testing.T) {
	dir := t.TempDir()

	// Create a non-.db file that should be ignored.
	err := os.WriteFile(filepath.Join(dir, "notes.txt"), []byte("hello"), 0644)
	if err != nil {
		t.Fatalf("failed to write text file: %v", err)
	}

	store, err := NewGlobalPatternStore(dir)
	if err != nil {
		t.Fatalf("NewGlobalPatternStore failed: %v", err)
	}
	defer store.Close()

	err = store.Aggregate()
	if err != nil {
		t.Fatalf("Aggregate failed: %v", err)
	}
}
