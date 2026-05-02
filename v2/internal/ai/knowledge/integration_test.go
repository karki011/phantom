// Author: Subash Karki
//
// Integration tests for DecisionStore with confidence decay and time-based retrieval.
package knowledge

import (
	"database/sql"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

func openTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

// TestFindSimilar_TimeDecayIntegration verifies that FindSimilar respects
// confidence decay — recent decisions rank higher than old ones with similar text.
func TestFindSimilar_TimeDecayIntegration(t *testing.T) {
	t.Parallel()

	db := openTestDB(t)
	ds, err := NewDecisionStore(db)
	if err != nil {
		t.Fatalf("NewDecisionStore: %v", err)
	}

	// Record decision A: "fix auth bug" — created 60 days ago, high risk.
	idA, err := ds.Record("fix auth bug", "strategy-patch", 0.8, "medium", "high")
	if err != nil {
		t.Fatalf("Record A: %v", err)
	}
	// Backdate decision A to 60 days ago.
	sixtyDaysAgo := time.Now().UTC().Add(-60 * 24 * time.Hour)
	_, err = db.Exec("UPDATE ai_decisions SET created_at = ? WHERE id = ?", sixtyDaysAgo, idA)
	if err != nil {
		t.Fatalf("backdate A: %v", err)
	}

	// Record decision B: "fix auth issue" — created 1 day ago, high risk.
	idB, err := ds.Record("fix auth issue", "strategy-refactor", 0.8, "medium", "high")
	if err != nil {
		t.Fatalf("Record B: %v", err)
	}
	// Backdate decision B to 1 day ago.
	oneDayAgo := time.Now().UTC().Add(-1 * 24 * time.Hour)
	_, err = db.Exec("UPDATE ai_decisions SET created_at = ? WHERE id = ?", oneDayAgo, idB)
	if err != nil {
		t.Fatalf("backdate B: %v", err)
	}

	// FindSimilar with "fix authentication" — B should rank higher (recency wins).
	results, err := ds.FindSimilar("fix authentication", 0.0)
	if err != nil {
		t.Fatalf("FindSimilar: %v", err)
	}
	if len(results) < 2 {
		t.Fatalf("expected at least 2 results, got %d", len(results))
	}

	// Decision B (recent) should be first.
	if results[0].ID != idB {
		t.Errorf("expected recent decision B (%s) to rank first, got %s (goal=%q)",
			idB, results[0].ID, results[0].Goal)
	}
	if results[1].ID != idA {
		t.Errorf("expected older decision A (%s) to rank second, got %s (goal=%q)",
			idA, results[1].ID, results[1].Goal)
	}
}

// TestEffectiveConfidence_RiskTiers verifies that different risk levels decay at
// different rates.
func TestEffectiveConfidence_RiskTiers(t *testing.T) {
	t.Parallel()

	now := time.Now()
	thirtyDaysAgo := now.Add(-30 * 24 * time.Hour)

	tests := []struct {
		risk     string
		halfLife float64
	}{
		{"high", 14.0},
		{"medium", 30.0},
		{"low", 60.0},
		{"user-override", 180.0},
	}

	for _, tt := range tests {
		d := Decision{
			Confidence: 1.0,
			Risk:       tt.risk,
			CreatedAt:  thirtyDaysAgo,
		}
		eff := effectiveConfidence(d, now)
		if eff <= 0 || eff > 1.0 {
			t.Errorf("risk=%q: effectiveConfidence out of range: %f", tt.risk, eff)
		}
	}

	// High-risk should decay faster than low-risk.
	highRisk := Decision{Confidence: 1.0, Risk: "high", CreatedAt: thirtyDaysAgo}
	lowRisk := Decision{Confidence: 1.0, Risk: "low", CreatedAt: thirtyDaysAgo}
	highEff := effectiveConfidence(highRisk, now)
	lowEff := effectiveConfidence(lowRisk, now)

	if highEff >= lowEff {
		t.Errorf("expected high-risk (%.4f) < low-risk (%.4f) after 30 days", highEff, lowEff)
	}
}

// TestAccessBoost verifies that frequently accessed decisions get boosted.
func TestAccessBoost(t *testing.T) {
	t.Parallel()

	now := time.Now()
	d := Decision{
		Confidence:  0.8,
		Risk:        "medium",
		CreatedAt:   now.Add(-5 * 24 * time.Hour),
		AccessCount: 0,
	}

	noAccess := effectiveConfidence(d, now)

	d.AccessCount = 10
	withAccess := effectiveConfidence(d, now)

	if withAccess <= noAccess {
		t.Errorf("expected access boost: withAccess=%.4f should be > noAccess=%.4f",
			withAccess, noAccess)
	}
}

// TestDecisionStore_RecordAndRetrieve tests the full record -> list -> find cycle.
func TestDecisionStore_RecordAndRetrieve(t *testing.T) {
	t.Parallel()

	db := openTestDB(t)
	ds, err := NewDecisionStore(db)
	if err != nil {
		t.Fatalf("NewDecisionStore: %v", err)
	}

	// Record several decisions.
	id1, err := ds.Record("implement user authentication", "strategy-oauth", 0.9, "high", "medium")
	if err != nil {
		t.Fatalf("Record 1: %v", err)
	}
	id2, err := ds.Record("optimize database queries", "strategy-index", 0.7, "medium", "low")
	if err != nil {
		t.Fatalf("Record 2: %v", err)
	}

	// Verify IDs are non-empty.
	if id1 == "" || id2 == "" {
		t.Fatal("expected non-empty decision IDs")
	}

	// ListRecent should return both.
	recent, err := ds.ListRecent(10)
	if err != nil {
		t.Fatalf("ListRecent: %v", err)
	}
	if len(recent) != 2 {
		t.Fatalf("expected 2 recent decisions, got %d", len(recent))
	}

	// FindSimilar should find the auth decision.
	similar, err := ds.FindSimilar("authentication login", 0.0)
	if err != nil {
		t.Fatalf("FindSimilar: %v", err)
	}
	if len(similar) == 0 {
		t.Fatal("expected at least 1 similar result for 'authentication login'")
	}
}

// TestDecisionStore_OutcomesAndSuccessRate tests the outcome recording and
// success rate calculation pipeline.
func TestDecisionStore_OutcomesAndSuccessRate(t *testing.T) {
	t.Parallel()

	db := openTestDB(t)
	ds, err := NewDecisionStore(db)
	if err != nil {
		t.Fatalf("NewDecisionStore: %v", err)
	}

	// Record 3 decisions with same strategy and complexity.
	for i := 0; i < 3; i++ {
		id, err := ds.Record("fix bug", "strategy-patch", 0.8, "low", "low")
		if err != nil {
			t.Fatalf("Record %d: %v", i, err)
		}
		// 2 successes, 1 failure.
		success := i < 2
		if err := ds.RecordOutcome(id, success, ""); err != nil {
			t.Fatalf("RecordOutcome %d: %v", i, err)
		}
	}

	rate, total, err := ds.GetSuccessRate("strategy-patch", "low")
	if err != nil {
		t.Fatalf("GetSuccessRate: %v", err)
	}
	if total != 3 {
		t.Fatalf("expected 3 total outcomes, got %d", total)
	}
	// 2/3 = 0.666...
	if rate < 0.66 || rate > 0.67 {
		t.Errorf("expected success rate ~0.667, got %.3f", rate)
	}
}

// TestDecisionStore_FailedApproaches verifies that failed strategies are
// correctly surfaced.
func TestDecisionStore_FailedApproaches(t *testing.T) {
	t.Parallel()

	db := openTestDB(t)
	ds, err := NewDecisionStore(db)
	if err != nil {
		t.Fatalf("NewDecisionStore: %v", err)
	}

	// Record a successful decision.
	idOk, _ := ds.Record("fix auth bug in login", "strategy-patch", 0.8, "medium", "medium")
	ds.RecordOutcome(idOk, true, "")

	// Record a failed decision with very similar text.
	idFail, _ := ds.Record("fix auth bug in login module", "strategy-rewrite", 0.6, "high", "high")
	ds.RecordOutcome(idFail, false, "rewrite caused regressions")

	// Query with nearly identical text to ensure high trigram similarity.
	failures, err := ds.GetFailedApproaches("fix auth bug in login")
	if err != nil {
		t.Fatalf("GetFailedApproaches: %v", err)
	}

	found := false
	for _, f := range failures {
		if f.StrategyID == "strategy-rewrite" {
			found = true
		}
	}
	if !found {
		t.Error("expected strategy-rewrite in failed approaches")
	}
}

// TestDecisionStore_IncrementAccess tests the access counter.
func TestDecisionStore_IncrementAccess(t *testing.T) {
	t.Parallel()

	db := openTestDB(t)
	ds, err := NewDecisionStore(db)
	if err != nil {
		t.Fatalf("NewDecisionStore: %v", err)
	}

	id, _ := ds.Record("some goal", "some-strategy", 0.8, "low", "low")

	// Increment 5 times.
	for i := 0; i < 5; i++ {
		if err := ds.IncrementAccess(id); err != nil {
			t.Fatalf("IncrementAccess: %v", err)
		}
	}

	// Verify the counter.
	var accessCount int
	err = db.QueryRow("SELECT access_count FROM ai_decisions WHERE id = ?", id).Scan(&accessCount)
	if err != nil {
		t.Fatalf("query access_count: %v", err)
	}
	if accessCount != 5 {
		t.Errorf("expected access_count=5, got %d", accessCount)
	}
}

// TestDecisionStore_EmptyFieldsRejected verifies validation.
func TestDecisionStore_EmptyFieldsRejected(t *testing.T) {
	t.Parallel()

	db := openTestDB(t)
	ds, err := NewDecisionStore(db)
	if err != nil {
		t.Fatalf("NewDecisionStore: %v", err)
	}

	_, err = ds.Record("", "strategy", 0.5, "", "")
	if err != ErrInvalidDecision {
		t.Errorf("expected ErrInvalidDecision for empty goal, got %v", err)
	}

	_, err = ds.Record("goal", "", 0.5, "", "")
	if err != ErrInvalidDecision {
		t.Errorf("expected ErrInvalidDecision for empty strategy, got %v", err)
	}
}

// TestDecisionStore_OrchestratorVsVerifierPhase verifies that orchestrator-phase
// outcomes are excluded from GetSuccessRate.
func TestDecisionStore_OrchestratorVsVerifierPhase(t *testing.T) {
	t.Parallel()

	db := openTestDB(t)
	ds, err := NewDecisionStore(db)
	if err != nil {
		t.Fatalf("NewDecisionStore: %v", err)
	}

	id, _ := ds.Record("fix something", "my-strategy", 0.8, "low", "low")

	// Record orchestrator outcome (optimistic auto-record).
	ds.RecordOrchestratorOutcome(id, true, "")

	// GetSuccessRate should return 0 total (orchestrator phase excluded).
	_, total, _ := ds.GetSuccessRate("my-strategy", "low")
	if total != 0 {
		t.Errorf("expected 0 total for orchestrator-only outcomes, got %d", total)
	}

	// Record verifier outcome.
	ds.RecordOutcome(id, true, "")

	// Now GetSuccessRate should see 1 total.
	rate, total, _ := ds.GetSuccessRate("my-strategy", "low")
	if total != 1 {
		t.Errorf("expected 1 total with verifier outcome, got %d", total)
	}
	if rate != 1.0 {
		t.Errorf("expected rate=1.0, got %.2f", rate)
	}
}
