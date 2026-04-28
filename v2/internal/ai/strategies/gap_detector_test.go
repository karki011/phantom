// gap_detector_test.go tests the GapDetector with an in-memory SQLite DB.
// Author: Subash Karki
package strategies

import (
	"database/sql"
	"testing"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

func setupGapTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS ai_decisions (
			id TEXT PRIMARY KEY,
			goal TEXT NOT NULL,
			strategy_id TEXT NOT NULL,
			confidence REAL DEFAULT 0,
			complexity TEXT DEFAULT '',
			risk TEXT DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE IF NOT EXISTS ai_outcomes (
			id TEXT PRIMARY KEY,
			decision_id TEXT REFERENCES ai_decisions(id),
			success INTEGER NOT NULL DEFAULT 0,
			failure_reason TEXT DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
	`)
	if err != nil {
		t.Fatalf("failed to create schema: %v", err)
	}

	return db
}

// insertDecisionWithOutcome adds a decision+outcome pair for testing.
func insertDecisionWithOutcome(t *testing.T, db *sql.DB, strategyID, complexity, risk string, success bool) {
	t.Helper()
	decID := uuid.New().String()
	outID := uuid.New().String()

	successInt := 0
	if success {
		successInt = 1
	}

	_, err := db.Exec(
		"INSERT INTO ai_decisions (id, goal, strategy_id, confidence, complexity, risk) VALUES (?, 'test goal', ?, 0.8, ?, ?)",
		decID, strategyID, complexity, risk,
	)
	if err != nil {
		t.Fatalf("failed to insert decision: %v", err)
	}

	_, err = db.Exec(
		"INSERT INTO ai_outcomes (id, decision_id, success) VALUES (?, ?, ?)",
		outID, decID, successInt,
	)
	if err != nil {
		t.Fatalf("failed to insert outcome: %v", err)
	}
}

func TestFindGaps_NoGapsWhenStrategiesWorkWell(t *testing.T) {
	db := setupGapTestDB(t)
	detector := NewGapDetector()

	// Insert 15 decisions for (simple, low) with 80% success rate.
	for i := 0; i < 15; i++ {
		insertDecisionWithOutcome(t, db, "direct", "simple", "low", i < 12)
	}

	gaps := detector.FindGaps(db)
	if len(gaps) != 0 {
		t.Errorf("expected 0 gaps when best rate is 80%%, got %d", len(gaps))
	}
}

func TestFindGaps_WarningGap(t *testing.T) {
	db := setupGapTestDB(t)
	detector := NewGapDetector()

	// Insert 20 decisions for (complex, high) with 45% success rate.
	for i := 0; i < 20; i++ {
		insertDecisionWithOutcome(t, db, "decompose", "complex", "high", i < 9)
	}

	gaps := detector.FindGaps(db)
	if len(gaps) != 1 {
		t.Fatalf("expected 1 gap, got %d", len(gaps))
	}
	if gaps[0].Severity != "warning" {
		t.Errorf("expected severity 'warning', got %q", gaps[0].Severity)
	}
	if gaps[0].Complexity != Complex {
		t.Errorf("expected complexity Complex, got %s", gaps[0].Complexity)
	}
	if gaps[0].Risk != HighRisk {
		t.Errorf("expected risk HighRisk, got %s", gaps[0].Risk)
	}
	if gaps[0].BestStrategy != "decompose" {
		t.Errorf("expected best strategy 'decompose', got %q", gaps[0].BestStrategy)
	}
}

func TestFindGaps_CriticalGap(t *testing.T) {
	db := setupGapTestDB(t)
	detector := NewGapDetector()

	// Insert 20 decisions for (critical, critical) with 25% success rate.
	for i := 0; i < 20; i++ {
		insertDecisionWithOutcome(t, db, "decompose", "critical", "critical", i < 5)
	}

	gaps := detector.FindGaps(db)
	if len(gaps) != 1 {
		t.Fatalf("expected 1 gap, got %d", len(gaps))
	}
	if gaps[0].Severity != "critical" {
		t.Errorf("expected severity 'critical', got %q", gaps[0].Severity)
	}
}

func TestFindGaps_InsufficientData(t *testing.T) {
	db := setupGapTestDB(t)
	detector := NewGapDetector()

	// Only 5 decisions — below the 10-decision threshold.
	for i := 0; i < 5; i++ {
		insertDecisionWithOutcome(t, db, "direct", "simple", "low", false)
	}

	gaps := detector.FindGaps(db)
	if len(gaps) != 0 {
		t.Errorf("expected 0 gaps with insufficient data (<10), got %d", len(gaps))
	}
}

func TestFindGaps_EmptyStore(t *testing.T) {
	db := setupGapTestDB(t)
	detector := NewGapDetector()

	gaps := detector.FindGaps(db)
	if len(gaps) != 0 {
		t.Errorf("expected 0 gaps for empty store, got %d", len(gaps))
	}
}

func TestFindGaps_MultipleStrategies_PicksBest(t *testing.T) {
	db := setupGapTestDB(t)
	detector := NewGapDetector()

	// Strategy A: 40% success (4/10)
	for i := 0; i < 10; i++ {
		insertDecisionWithOutcome(t, db, "strategy-a", "moderate", "medium", i < 4)
	}
	// Strategy B: 20% success (2/10) — worse
	for i := 0; i < 10; i++ {
		insertDecisionWithOutcome(t, db, "strategy-b", "moderate", "medium", i < 2)
	}

	gaps := detector.FindGaps(db)
	if len(gaps) != 1 {
		t.Fatalf("expected 1 gap, got %d", len(gaps))
	}
	// Best strategy is A at 40%.
	if gaps[0].BestStrategy != "strategy-a" {
		t.Errorf("expected best strategy 'strategy-a', got %q", gaps[0].BestStrategy)
	}
	if gaps[0].Severity != "warning" {
		t.Errorf("expected severity 'warning', got %q", gaps[0].Severity)
	}
}

func TestHasCriticalGaps_True(t *testing.T) {
	db := setupGapTestDB(t)
	detector := NewGapDetector()

	// 25% success — critical gap.
	for i := 0; i < 20; i++ {
		insertDecisionWithOutcome(t, db, "direct", "critical", "critical", i < 5)
	}

	if !detector.HasCriticalGaps(db) {
		t.Error("expected HasCriticalGaps to return true")
	}
}

func TestHasCriticalGaps_FalseWithWarnings(t *testing.T) {
	db := setupGapTestDB(t)
	detector := NewGapDetector()

	// 45% success — warning, not critical.
	for i := 0; i < 20; i++ {
		insertDecisionWithOutcome(t, db, "direct", "complex", "high", i < 9)
	}

	if detector.HasCriticalGaps(db) {
		t.Error("expected HasCriticalGaps to return false when only warnings exist")
	}
}

func TestHasCriticalGaps_FalseWhenEmpty(t *testing.T) {
	db := setupGapTestDB(t)
	detector := NewGapDetector()

	if detector.HasCriticalGaps(db) {
		t.Error("expected HasCriticalGaps to return false for empty store")
	}
}

func TestFindGaps_ExactlyAt30Percent(t *testing.T) {
	db := setupGapTestDB(t)
	detector := NewGapDetector()

	// Exactly 30% success (3/10) — should be warning, not critical.
	for i := 0; i < 10; i++ {
		insertDecisionWithOutcome(t, db, "direct", "simple", "low", i < 3)
	}

	gaps := detector.FindGaps(db)
	if len(gaps) != 1 {
		t.Fatalf("expected 1 gap, got %d", len(gaps))
	}
	if gaps[0].Severity != "warning" {
		t.Errorf("expected severity 'warning' at exactly 30%%, got %q", gaps[0].Severity)
	}
}

func TestFindGaps_ExactlyAt50Percent(t *testing.T) {
	db := setupGapTestDB(t)
	detector := NewGapDetector()

	// Exactly 50% success (5/10) — should NOT be a gap.
	for i := 0; i < 10; i++ {
		insertDecisionWithOutcome(t, db, "direct", "simple", "low", i < 5)
	}

	gaps := detector.FindGaps(db)
	if len(gaps) != 0 {
		t.Errorf("expected 0 gaps at exactly 50%%, got %d", len(gaps))
	}
}
