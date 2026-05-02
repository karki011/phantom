// decisions_test.go tests the DecisionStore with an in-memory SQLite DB.
// Author: Subash Karki
package knowledge

import (
	"database/sql"
	"math"
	"testing"
	"time"

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
		{"synonym no shared trigrams", "refactor", "restructure", 0.0},
		{"disjoint", "hello", "world", 0.0},
		{"substring overlap", "authentication", "auth flow", 0.05},
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
		{"partial token overlap", "refactor authentication", "restructure auth flow", 0.01},
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

	// Record decisions with shared keywords — trigram matching works on
	// character overlap, not semantic meaning. "fix auth bug" will match
	// "fix auth issue" because they share "fix" and "auth" tokens/trigrams.
	_, _ = ds.Record("fix auth bug", "decompose", 0.85, "complex", "high")
	_, _ = ds.Record("deploy kubernetes cluster", "direct", 0.9, "simple", "low")

	results, err := ds.FindSimilar("fix auth issue", 0.01)
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
		t.Error("expected trigram matching to find 'fix auth bug' when searching 'fix auth issue'")
	}

	// "deploy kubernetes cluster" should NOT match "fix auth issue"
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

// --- Confidence decay tests ---

func TestDecayHalfLife(t *testing.T) {
	tests := []struct {
		risk string
		want float64
	}{
		{"high", 14.0},
		{"medium", 30.0},
		{"low", 60.0},
		{"user-override", 180.0},
		{"unknown", 30.0},
		{"", 30.0},
	}
	for _, tt := range tests {
		t.Run("risk="+tt.risk, func(t *testing.T) {
			got := decayHalfLife(tt.risk)
			if got != tt.want {
				t.Errorf("decayHalfLife(%q) = %.1f, want %.1f", tt.risk, got, tt.want)
			}
		})
	}
}

func TestEffectiveConfidence_NewDecision(t *testing.T) {
	now := time.Now()
	d := Decision{
		Confidence:  0.9,
		Risk:        "medium",
		CreatedAt:   now,
		AccessCount: 0,
	}
	ec := effectiveConfidence(d, now)
	// age=0: decay=1.0, accessBoost=1.0+0.1*ln(1)=1.0 → ec ≈ 0.9
	if math.Abs(ec-0.9) > 0.01 {
		t.Errorf("new decision: effectiveConfidence = %.4f, want ~0.9", ec)
	}
}

func TestEffectiveConfidence_OldDecision(t *testing.T) {
	now := time.Now()
	d := Decision{
		Confidence:  0.8,
		Risk:        "medium", // half-life = 30 days
		CreatedAt:   now.Add(-60 * 24 * time.Hour), // 60 days old
		AccessCount: 0,
	}
	ec := effectiveConfidence(d, now)
	// After 2 half-lives (60d / 30d), decay ≈ 0.25 → ec ≈ 0.8 * 0.25 = 0.2
	if ec < 0.15 || ec > 0.25 {
		t.Errorf("60d-old medium decision: effectiveConfidence = %.4f, want ~0.20", ec)
	}
}

func TestEffectiveConfidence_VeryOld(t *testing.T) {
	now := time.Now()
	d := Decision{
		Confidence:  0.9,
		Risk:        "high", // half-life = 14 days
		CreatedAt:   now.Add(-365 * 24 * time.Hour), // 1 year old
		AccessCount: 0,
	}
	ec := effectiveConfidence(d, now)
	// After ~26 half-lives, decay ≈ 0 → ec ≈ 0
	if ec > 0.001 {
		t.Errorf("365d-old high-risk decision: effectiveConfidence = %.6f, want near 0", ec)
	}
}

func TestEffectiveConfidence_HighAccessBoost(t *testing.T) {
	now := time.Now()
	d := Decision{
		Confidence:  0.5,
		Risk:        "medium",
		CreatedAt:   now,
		AccessCount: 100,
	}
	ec := effectiveConfidence(d, now)
	// accessBoost = 1 + 0.1*ln(101) ≈ 1 + 0.1*4.615 ≈ 1.46
	// ec ≈ 0.5 * 1.0 * 1.46 = 0.73
	if ec < 0.65 || ec > 0.80 {
		t.Errorf("high-access decision: effectiveConfidence = %.4f, want ~0.73", ec)
	}
}

func TestEffectiveConfidence_ZeroAccess(t *testing.T) {
	now := time.Now()
	d := Decision{
		Confidence:  0.7,
		Risk:        "low",
		CreatedAt:   now,
		AccessCount: 0,
	}
	ec := effectiveConfidence(d, now)
	// accessBoost = 1 + 0.1*ln(1) = 1.0 → no boost
	if math.Abs(ec-0.7) > 0.01 {
		t.Errorf("zero-access decision: effectiveConfidence = %.4f, want ~0.7", ec)
	}
}

func TestEffectiveConfidence_CappedAt1(t *testing.T) {
	now := time.Now()
	d := Decision{
		Confidence:  0.99,
		Risk:        "low",
		CreatedAt:   now,
		AccessCount: 1000, // huge boost
	}
	ec := effectiveConfidence(d, now)
	if ec > 1.0 {
		t.Errorf("effectiveConfidence should be capped at 1.0, got %.4f", ec)
	}
}

func TestEffectiveConfidence_UserOverrideDecaysSlow(t *testing.T) {
	now := time.Now()
	d := Decision{
		Confidence:  0.9,
		Risk:        "user-override", // half-life = 180 days
		CreatedAt:   now.Add(-60 * 24 * time.Hour), // 60 days old
		AccessCount: 0,
	}
	ec := effectiveConfidence(d, now)
	// decay = exp(-60/180 * 0.693) ≈ exp(-0.231) ≈ 0.794
	// ec ≈ 0.9 * 0.794 = 0.715
	if ec < 0.65 || ec > 0.80 {
		t.Errorf("60d-old user-override: effectiveConfidence = %.4f, want ~0.71", ec)
	}
}

func TestFindSimilar_PrefersRecent(t *testing.T) {
	db := setupTestDB(t)
	ds, err := NewDecisionStore(db)
	if err != nil {
		t.Fatalf("NewDecisionStore failed: %v", err)
	}

	// Insert an old decision (90 days ago) with high confidence.
	oldID := "old-decision"
	_, err = db.Exec(
		"INSERT INTO ai_decisions (id, goal, strategy_id, confidence, complexity, risk, created_at, access_count, last_accessed_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)",
		oldID, "refactor the user service", "old-strategy", 0.95, "complex", "high",
		time.Now().Add(-90*24*time.Hour), time.Now().Add(-90*24*time.Hour),
	)
	if err != nil {
		t.Fatalf("insert old decision: %v", err)
	}

	// Insert a recent decision with lower confidence.
	recentID := "recent-decision"
	_, err = db.Exec(
		"INSERT INTO ai_decisions (id, goal, strategy_id, confidence, complexity, risk, created_at, access_count, last_accessed_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)",
		recentID, "refactor the user service", "recent-strategy", 0.80, "complex", "high",
		time.Now(), time.Now(),
	)
	if err != nil {
		t.Fatalf("insert recent decision: %v", err)
	}

	results, err := ds.FindSimilar("refactor the user service", 0.01)
	if err != nil {
		t.Fatalf("FindSimilar failed: %v", err)
	}
	if len(results) < 2 {
		t.Fatalf("expected at least 2 results, got %d", len(results))
	}

	// The recent decision should rank first despite lower base confidence,
	// because the old one (90d with 14d half-life) is heavily decayed.
	if results[0].ID != recentID {
		t.Errorf("expected recent decision first, got ID=%s strategy=%s", results[0].ID, results[0].StrategyID)
	}
}

func TestIncrementAccess(t *testing.T) {
	db := setupTestDB(t)
	ds, err := NewDecisionStore(db)
	if err != nil {
		t.Fatalf("NewDecisionStore failed: %v", err)
	}

	id, err := ds.Record("refactor the user service", "decompose", 0.85, "complex", "high")
	if err != nil {
		t.Fatalf("Record failed: %v", err)
	}

	// Increment twice.
	if err := ds.IncrementAccess(id); err != nil {
		t.Fatalf("IncrementAccess failed: %v", err)
	}
	if err := ds.IncrementAccess(id); err != nil {
		t.Fatalf("IncrementAccess (2nd) failed: %v", err)
	}

	// Verify access_count = 2.
	var count int
	err = db.QueryRow("SELECT access_count FROM ai_decisions WHERE id = ?", id).Scan(&count)
	if err != nil {
		t.Fatalf("query access_count: %v", err)
	}
	if count != 2 {
		t.Errorf("expected access_count=2, got %d", count)
	}
}
