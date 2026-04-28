// decisions_test.go tests the DecisionStore with an in-memory SQLite DB.
// Author: Subash Karki
package knowledge

import (
	"database/sql"
	"math"
	"testing"

	_ "modernc.org/sqlite"
)

func setupTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestNewDecisionStore_CreatesSchema(t *testing.T) {
	db := setupTestDB(t)
	ds, err := NewDecisionStore(db)
	if err != nil {
		t.Fatalf("NewDecisionStore failed: %v", err)
	}
	if ds == nil {
		t.Fatal("expected non-nil DecisionStore")
	}

	// Verify tables exist by querying them.
	var count int
	err = db.QueryRow("SELECT COUNT(*) FROM ai_decisions").Scan(&count)
	if err != nil {
		t.Fatalf("ai_decisions table missing: %v", err)
	}
	err = db.QueryRow("SELECT COUNT(*) FROM ai_outcomes").Scan(&count)
	if err != nil {
		t.Fatalf("ai_outcomes table missing: %v", err)
	}
}

func TestDecisionStore_RecordAndFind(t *testing.T) {
	db := setupTestDB(t)
	ds, err := NewDecisionStore(db)
	if err != nil {
		t.Fatalf("NewDecisionStore failed: %v", err)
	}

	// Record a decision.
	id, err := ds.Record("refactor the user service", "decompose", 0.85, "complex", "high")
	if err != nil {
		t.Fatalf("Record failed: %v", err)
	}
	if id == "" {
		t.Fatal("expected non-empty ID")
	}

	// FindSimilar with exact match.
	results, err := ds.FindSimilar("refactor the user service", 0.5)
	if err != nil {
		t.Fatalf("FindSimilar failed: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	if results[0].StrategyID != "decompose" {
		t.Errorf("expected strategy 'decompose', got %q", results[0].StrategyID)
	}
}

func TestDecisionStore_FindSimilar_PartialMatch(t *testing.T) {
	db := setupTestDB(t)
	ds, err := NewDecisionStore(db)
	if err != nil {
		t.Fatalf("NewDecisionStore failed: %v", err)
	}

	_, _ = ds.Record("refactor the user service layer", "decompose", 0.85, "complex", "high")
	_, _ = ds.Record("add logging to payment handler", "direct", 0.9, "simple", "low")

	// Should match the first one (similar goal).
	results, err := ds.FindSimilar("refactor user service", 0.3)
	if err != nil {
		t.Fatalf("FindSimilar failed: %v", err)
	}
	if len(results) < 1 {
		t.Fatal("expected at least 1 similar result")
	}

	found := false
	for _, r := range results {
		if r.StrategyID == "decompose" {
			found = true
		}
	}
	if !found {
		t.Error("expected to find the 'decompose' decision in similar results")
	}
}

func TestDecisionStore_FindSimilar_NoMatch(t *testing.T) {
	db := setupTestDB(t)
	ds, err := NewDecisionStore(db)
	if err != nil {
		t.Fatalf("NewDecisionStore failed: %v", err)
	}

	_, _ = ds.Record("refactor the user service", "decompose", 0.85, "complex", "high")

	// Completely different goal — low similarity.
	results, err := ds.FindSimilar("deploy kubernetes cluster", 0.5)
	if err != nil {
		t.Fatalf("FindSimilar failed: %v", err)
	}
	if len(results) != 0 {
		t.Errorf("expected 0 results for unrelated goal, got %d", len(results))
	}
}

func TestDecisionStore_GetFailedApproaches(t *testing.T) {
	db := setupTestDB(t)
	ds, err := NewDecisionStore(db)
	if err != nil {
		t.Fatalf("NewDecisionStore failed: %v", err)
	}

	// Record a decision and mark it as failed.
	id, _ := ds.Record("refactor the user service", "decompose", 0.85, "complex", "high")
	err = ds.RecordOutcome(id, false, "too many files changed at once")
	if err != nil {
		t.Fatalf("RecordOutcome failed: %v", err)
	}

	// Should find the failed approach.
	failures, err := ds.GetFailedApproaches("refactor user service")
	if err != nil {
		t.Fatalf("GetFailedApproaches failed: %v", err)
	}
	if len(failures) != 1 {
		t.Fatalf("expected 1 failure, got %d", len(failures))
	}
	if failures[0].StrategyID != "decompose" {
		t.Errorf("expected strategy 'decompose', got %q", failures[0].StrategyID)
	}
}

func TestDecisionStore_GetFailedApproaches_SuccessNotReturned(t *testing.T) {
	db := setupTestDB(t)
	ds, err := NewDecisionStore(db)
	if err != nil {
		t.Fatalf("NewDecisionStore failed: %v", err)
	}

	id, _ := ds.Record("refactor the user service", "decompose", 0.85, "complex", "high")
	_ = ds.RecordOutcome(id, true, "")

	failures, err := ds.GetFailedApproaches("refactor user service")
	if err != nil {
		t.Fatalf("GetFailedApproaches failed: %v", err)
	}
	if len(failures) != 0 {
		t.Errorf("expected 0 failures for successful outcome, got %d", len(failures))
	}
}

func TestDecisionStore_GetSuccessRate(t *testing.T) {
	db := setupTestDB(t)
	ds, err := NewDecisionStore(db)
	if err != nil {
		t.Fatalf("NewDecisionStore failed: %v", err)
	}

	// 3 decisions: 2 succeed, 1 fails.
	for i := 0; i < 3; i++ {
		id, _ := ds.Record("task", "direct", 0.9, "simple", "low")
		_ = ds.RecordOutcome(id, i < 2, "")
	}

	rate, total, err := ds.GetSuccessRate("direct", "simple")
	if err != nil {
		t.Fatalf("GetSuccessRate failed: %v", err)
	}
	if total != 3 {
		t.Errorf("expected total=3, got %d", total)
	}
	expected := 2.0 / 3.0
	if math.Abs(rate-expected) > 0.01 {
		t.Errorf("expected rate=%.4f, got %.4f", expected, rate)
	}
}

func TestDecisionStore_GetSuccessRate_NoData(t *testing.T) {
	db := setupTestDB(t)
	ds, err := NewDecisionStore(db)
	if err != nil {
		t.Fatalf("NewDecisionStore failed: %v", err)
	}

	rate, total, err := ds.GetSuccessRate("direct", "simple")
	if err != nil {
		t.Fatalf("GetSuccessRate failed: %v", err)
	}
	if total != 0 || rate != 0 {
		t.Errorf("expected 0/0 for no data, got rate=%.4f total=%d", rate, total)
	}
}

func TestJaccardSimilarity(t *testing.T) {
	tests := []struct {
		name string
		a, b map[string]bool
		want float64
	}{
		{"identical", map[string]bool{"foo": true, "bar": true}, map[string]bool{"foo": true, "bar": true}, 1.0},
		{"disjoint", map[string]bool{"foo": true}, map[string]bool{"bar": true}, 0.0},
		{"partial", map[string]bool{"foo": true, "bar": true, "baz": true}, map[string]bool{"foo": true, "bar": true}, 2.0 / 3.0},
		{"both empty", map[string]bool{}, map[string]bool{}, 1.0},
		{"one empty", map[string]bool{"foo": true}, map[string]bool{}, 0.0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := jaccardSimilarity(tt.a, tt.b)
			if math.Abs(got-tt.want) > 0.001 {
				t.Errorf("jaccardSimilarity = %.4f, want %.4f", got, tt.want)
			}
		})
	}
}

func TestTokenize(t *testing.T) {
	tokens := tokenize("Refactor the user service layer!")
	expected := map[string]bool{"refactor": true, "user": true, "service": true, "layer": true}

	for k := range expected {
		if !tokens[k] {
			t.Errorf("expected token %q not found", k)
		}
	}

	// "the" is a stop word — should not appear.
	if tokens["the"] {
		t.Error("stop word 'the' should be excluded")
	}
}

// --- Trigram similarity tests ---

func TestExtractTrigrams(t *testing.T) {
	trigrams := extractTrigrams("hello")
	expected := map[string]bool{"hel": true, "ell": true, "llo": true}

	for k := range expected {
		if !trigrams[k] {
			t.Errorf("expected trigram %q not found", k)
		}
	}
	if len(trigrams) != 3 {
		t.Errorf("expected 3 trigrams, got %d", len(trigrams))
	}
}

func TestExtractTrigrams_ShortString(t *testing.T) {
	// Strings shorter than 3 chars produce no trigrams.
	trigrams := extractTrigrams("hi")
	if len(trigrams) != 0 {
		t.Errorf("expected 0 trigrams for 2-char string, got %d", len(trigrams))
	}
}

func TestTrigramSimilarity(t *testing.T) {
	tests := []struct {
		name    string
		a, b    string
		minSim  float64
	}{
		{"identical", "refactor", "refactor", 1.0},
		{"synonym overlap", "refactor", "restructure", 0.1},
		{"disjoint", "hello", "world", 0.0},
		{"partial overlap", "authentication", "auth flow", 0.15},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sim := trigramSimilarity(tt.a, tt.b)
			if sim < tt.minSim {
				t.Errorf("trigramSimilarity(%q, %q) = %.4f, want >= %.4f", tt.a, tt.b, sim, tt.minSim)
			}
		})
	}
}

func TestCombinedSimilarity(t *testing.T) {
	tests := []struct {
		name    string
		a, b    string
		minSim  float64
	}{
		{"exact match", "refactor auth service", "refactor auth service", 0.99},
		{"synonym words with shared trigrams", "refactor authentication", "restructure auth flow", 0.1},
		{"totally unrelated", "deploy kubernetes cluster", "paint the house blue", 0.0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			aLower := tt.a
			aTrigrams := extractTrigrams(aLower)
			aTokens := tokenize(tt.a)
			sim := combinedSimilarity(aLower, aTrigrams, aTokens, tt.b)
			if sim < tt.minSim {
				t.Errorf("combinedSimilarity(%q, %q) = %.4f, want >= %.4f", tt.a, tt.b, sim, tt.minSim)
			}
		})
	}
}

func TestFindSimilar_TrigramMatching(t *testing.T) {
	db := setupTestDB(t)
	ds, err := NewDecisionStore(db)
	if err != nil {
		t.Fatalf("NewDecisionStore failed: %v", err)
	}

	// "restructure auth flow" should be found when searching "refactor authentication"
	// because they share trigrams even though word overlap is zero.
	_, _ = ds.Record("restructure auth flow", "decompose", 0.85, "complex", "high")
	_, _ = ds.Record("deploy kubernetes cluster", "direct", 0.9, "simple", "low")

	results, err := ds.FindSimilar("refactor authentication", 0.1)
	if err != nil {
		t.Fatalf("FindSimilar failed: %v", err)
	}

	found := false
	for _, r := range results {
		if r.StrategyID == "decompose" {
			found = true
		}
	}
	if !found {
		t.Error("expected trigram matching to find 'restructure auth flow' when searching 'refactor authentication'")
	}

	// "deploy kubernetes cluster" should NOT match "refactor authentication"
	for _, r := range results {
		if r.Goal == "deploy kubernetes cluster" {
			t.Error("unrelated goal should not match")
		}
	}
}

func TestFindSimilar_LimitParam(t *testing.T) {
	db := setupTestDB(t)
	ds, err := NewDecisionStore(db)
	if err != nil {
		t.Fatalf("NewDecisionStore failed: %v", err)
	}

	// Insert many similar decisions.
	for i := 0; i < 10; i++ {
		_, _ = ds.Record("refactor the user service", "decompose", 0.85, "complex", "high")
	}

	// Limit to 3.
	results, err := ds.FindSimilar("refactor user service", 0.1, 3)
	if err != nil {
		t.Fatalf("FindSimilar failed: %v", err)
	}
	if len(results) > 3 {
		t.Errorf("expected at most 3 results with limit, got %d", len(results))
	}
}
