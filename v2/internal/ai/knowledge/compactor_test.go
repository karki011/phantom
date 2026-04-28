// compactor_test.go tests knowledge compaction, pruning, and health scoring.
// Author: Subash Karki
package knowledge

import (
	"math"
	"testing"
	"time"
)

func setupCompactor(t *testing.T) (*Compactor, *DecisionStore) {
	t.Helper()
	db := setupTestDB(t)
	ds, err := NewDecisionStore(db)
	if err != nil {
		t.Fatalf("NewDecisionStore: %v", err)
	}
	c, err := NewCompactor(db)
	if err != nil {
		t.Fatalf("NewCompactor: %v", err)
	}
	return c, ds
}

func TestNewCompactor_CreatesTable(t *testing.T) {
	db := setupTestDB(t)
	_, err := NewDecisionStore(db) // ensure decision tables exist first
	if err != nil {
		t.Fatalf("NewDecisionStore: %v", err)
	}
	c, err := NewCompactor(db)
	if err != nil {
		t.Fatalf("NewCompactor: %v", err)
	}
	if c == nil {
		t.Fatal("expected non-nil Compactor")
	}

	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM ai_patterns").Scan(&count); err != nil {
		t.Fatalf("ai_patterns table missing: %v", err)
	}
}

func TestSynthesizePatterns_CreatesFromFivePlus(t *testing.T) {
	c, ds := setupCompactor(t)

	// Insert 6 decisions for one strategy group: 5 succeed, 1 fails.
	for i := 0; i < 6; i++ {
		id, _ := ds.Record("task", "decompose", 0.8, "complex", "high")
		_ = ds.RecordOutcome(id, i < 5, "")
	}

	if err := c.Run(); err != nil {
		t.Fatalf("Run: %v", err)
	}

	var count int
	if err := c.db.QueryRow("SELECT COUNT(*) FROM ai_patterns").Scan(&count); err != nil {
		t.Fatalf("query patterns: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 pattern, got %d", count)
	}

	var p CompactedPattern
	err := c.db.QueryRow(
		"SELECT id, strategy_id, complexity, risk, success_rate, sample_size, status FROM ai_patterns",
	).Scan(&p.ID, &p.StrategyID, &p.Complexity, &p.Risk, &p.SuccessRate, &p.SampleSize, &p.Status)
	if err != nil {
		t.Fatalf("scan pattern: %v", err)
	}
	if p.StrategyID != "decompose" {
		t.Errorf("strategy_id = %q, want decompose", p.StrategyID)
	}
	if p.SampleSize != 6 {
		t.Errorf("sample_size = %d, want 6", p.SampleSize)
	}
	expectedRate := 5.0 / 6.0
	if math.Abs(p.SuccessRate-expectedRate) > 0.01 {
		t.Errorf("success_rate = %.4f, want %.4f", p.SuccessRate, expectedRate)
	}
	if p.Status != "active" {
		t.Errorf("status = %q, want active", p.Status)
	}
}

func TestSynthesizePatterns_SkipsBelowMinSamples(t *testing.T) {
	c, ds := setupCompactor(t)

	// Only 3 decisions — below PatternMinSamples.
	for i := 0; i < 3; i++ {
		id, _ := ds.Record("task", "direct", 0.9, "simple", "low")
		_ = ds.RecordOutcome(id, true, "")
	}

	if err := c.Run(); err != nil {
		t.Fatalf("Run: %v", err)
	}

	var count int
	_ = c.db.QueryRow("SELECT COUNT(*) FROM ai_patterns").Scan(&count)
	if count != 0 {
		t.Errorf("expected 0 patterns for 3 decisions, got %d", count)
	}
}

func TestPruneStale_RemovesOldFailedDecisions(t *testing.T) {
	c, ds := setupCompactor(t)

	// Insert an old failed decision (8 days ago).
	id, _ := ds.Record("old task", "direct", 0.5, "simple", "low")
	_ = ds.RecordOutcome(id, false, "failed")
	eightDaysAgo := time.Now().Add(-8 * 24 * time.Hour)
	_, _ = c.db.Exec("UPDATE ai_decisions SET created_at = ? WHERE id = ?", eightDaysAgo, id)

	if err := c.pruneStale(); err != nil {
		t.Fatalf("pruneStale: %v", err)
	}

	var count int
	_ = c.db.QueryRow("SELECT COUNT(*) FROM ai_decisions").Scan(&count)
	if count != 0 {
		t.Errorf("expected 0 decisions after pruning, got %d", count)
	}
}

func TestPruneStale_KeepsSuccessfulOldDecisions(t *testing.T) {
	c, ds := setupCompactor(t)

	// Insert an old successful decision (10 days ago).
	id, _ := ds.Record("old success", "direct", 0.9, "simple", "low")
	_ = ds.RecordOutcome(id, true, "")
	tenDaysAgo := time.Now().Add(-10 * 24 * time.Hour)
	_, _ = c.db.Exec("UPDATE ai_decisions SET created_at = ? WHERE id = ?", tenDaysAgo, id)

	if err := c.pruneStale(); err != nil {
		t.Fatalf("pruneStale: %v", err)
	}

	var count int
	_ = c.db.QueryRow("SELECT COUNT(*) FROM ai_decisions").Scan(&count)
	if count != 1 {
		t.Errorf("expected 1 decision (successful kept), got %d", count)
	}
}

func TestPruneStale_KeepsRecentFailedDecisions(t *testing.T) {
	c, ds := setupCompactor(t)

	// Recent failed decision (2 days old) — should survive.
	id, _ := ds.Record("recent fail", "direct", 0.5, "simple", "low")
	_ = ds.RecordOutcome(id, false, "failed")
	twoDaysAgo := time.Now().Add(-2 * 24 * time.Hour)
	_, _ = c.db.Exec("UPDATE ai_decisions SET created_at = ? WHERE id = ?", twoDaysAgo, id)

	if err := c.pruneStale(); err != nil {
		t.Fatalf("pruneStale: %v", err)
	}

	var count int
	_ = c.db.QueryRow("SELECT COUNT(*) FROM ai_decisions").Scan(&count)
	if count != 1 {
		t.Errorf("expected 1 decision (recent kept), got %d", count)
	}
}

func TestDemoteFailingPatterns(t *testing.T) {
	c, ds := setupCompactor(t)

	// Create 5 decisions that all fail — success rate 0%.
	for i := 0; i < 5; i++ {
		id, _ := ds.Record("task", "bad-strategy", 0.3, "complex", "high")
		_ = ds.RecordOutcome(id, false, "always fails")
	}

	if err := c.Run(); err != nil {
		t.Fatalf("Run: %v", err)
	}

	var status string
	err := c.db.QueryRow("SELECT status FROM ai_patterns WHERE strategy_id = 'bad-strategy'").Scan(&status)
	if err != nil {
		t.Fatalf("query pattern status: %v", err)
	}
	if status != "deprecated" {
		t.Errorf("status = %q, want deprecated for 0%% success rate", status)
	}
}

func TestDemoteFailingPatterns_ActiveAboveThreshold(t *testing.T) {
	c, ds := setupCompactor(t)

	// 5 decisions, 4 succeed = 80% — well above threshold.
	for i := 0; i < 5; i++ {
		id, _ := ds.Record("task", "good-strategy", 0.9, "simple", "low")
		_ = ds.RecordOutcome(id, i < 4, "")
	}

	if err := c.Run(); err != nil {
		t.Fatalf("Run: %v", err)
	}

	var status string
	err := c.db.QueryRow("SELECT status FROM ai_patterns WHERE strategy_id = 'good-strategy'").Scan(&status)
	if err != nil {
		t.Fatalf("query pattern status: %v", err)
	}
	if status != "active" {
		t.Errorf("status = %q, want active for 80%% success rate", status)
	}
}

func TestHealth_EmptyStore(t *testing.T) {
	c, _ := setupCompactor(t)

	h, err := c.Health()
	if err != nil {
		t.Fatalf("Health: %v", err)
	}
	if h.TotalDecisions != 0 {
		t.Errorf("TotalDecisions = %d, want 0", h.TotalDecisions)
	}
	if h.ActivePatterns != 0 {
		t.Errorf("ActivePatterns = %d, want 0", h.ActivePatterns)
	}
	// Empty store: no active patterns (0) + 0 avg success (0) + no stale (0.3) = 0.3
	expected := 0.3
	if math.Abs(h.HealthScore-expected) > 0.01 {
		t.Errorf("HealthScore = %.4f, want %.4f", h.HealthScore, expected)
	}
}

func TestHealth_FullStore(t *testing.T) {
	c, ds := setupCompactor(t)

	// 6 decisions, all succeed.
	for i := 0; i < 6; i++ {
		id, _ := ds.Record("task", "direct", 0.9, "simple", "low")
		_ = ds.RecordOutcome(id, true, "")
	}

	_ = c.Run()

	h, err := c.Health()
	if err != nil {
		t.Fatalf("Health: %v", err)
	}
	if h.TotalDecisions != 6 {
		t.Errorf("TotalDecisions = %d, want 6", h.TotalDecisions)
	}
	if h.ActivePatterns != 1 {
		t.Errorf("ActivePatterns = %d, want 1", h.ActivePatterns)
	}
	if h.StaleDecisions != 0 {
		t.Errorf("StaleDecisions = %d, want 0", h.StaleDecisions)
	}
	// active (0.3) + 1.0*0.4 (0.4) + no stale (0.3) = 1.0
	if math.Abs(h.HealthScore-1.0) > 0.01 {
		t.Errorf("HealthScore = %.4f, want 1.0", h.HealthScore)
	}
}

func TestHealth_WithStaleDecisions(t *testing.T) {
	c, ds := setupCompactor(t)

	// Insert old decision with no outcome (stale).
	id, _ := ds.Record("stale task", "direct", 0.5, "simple", "low")
	tenDaysAgo := time.Now().Add(-10 * 24 * time.Hour)
	_, _ = c.db.Exec("UPDATE ai_decisions SET created_at = ? WHERE id = ?", tenDaysAgo, id)
	_ = id

	h, err := c.Health()
	if err != nil {
		t.Fatalf("Health: %v", err)
	}
	if h.StaleDecisions != 1 {
		t.Errorf("StaleDecisions = %d, want 1", h.StaleDecisions)
	}
	// no active (0) + 0 avg (0) + 1 stale: max(0, 0.3-0.03) = 0.27
	expected := 0.27
	if math.Abs(h.HealthScore-expected) > 0.01 {
		t.Errorf("HealthScore = %.4f, want %.4f", h.HealthScore, expected)
	}
}

func TestHealth_ManyStaleDecisionsClampToZero(t *testing.T) {
	c, ds := setupCompactor(t)

	// 15 stale decisions — should clamp the stale component to 0.
	for i := 0; i < 15; i++ {
		id, _ := ds.Record("stale task", "direct", 0.5, "simple", "low")
		tenDaysAgo := time.Now().Add(-10 * 24 * time.Hour)
		_, _ = c.db.Exec("UPDATE ai_decisions SET created_at = ? WHERE id = ?", tenDaysAgo, id)
	}

	h, err := c.Health()
	if err != nil {
		t.Fatalf("Health: %v", err)
	}
	if h.StaleDecisions != 15 {
		t.Errorf("StaleDecisions = %d, want 15", h.StaleDecisions)
	}
	// no active (0) + 0 avg (0) + max(0, 0.3-15*0.03)=0 → 0
	if math.Abs(h.HealthScore-0) > 0.01 {
		t.Errorf("HealthScore = %.4f, want 0", h.HealthScore)
	}
}

func TestShouldRun_BelowThreshold(t *testing.T) {
	c, ds := setupCompactor(t)

	// 50 decisions — below the 100 threshold.
	for i := 0; i < 50; i++ {
		id, _ := ds.Record("task", "direct", 0.9, "simple", "low")
		_ = ds.RecordOutcome(id, true, "")
	}

	should, err := c.ShouldRun()
	if err != nil {
		t.Fatalf("ShouldRun: %v", err)
	}
	if should {
		t.Error("ShouldRun = true, want false for 50 decisions")
	}
}

func TestShouldRun_AtThreshold(t *testing.T) {
	c, ds := setupCompactor(t)

	// 100 decisions with no prior compaction.
	for i := 0; i < 100; i++ {
		id, _ := ds.Record("task", "direct", 0.9, "simple", "low")
		_ = ds.RecordOutcome(id, true, "")
	}

	should, err := c.ShouldRun()
	if err != nil {
		t.Fatalf("ShouldRun: %v", err)
	}
	if !should {
		t.Error("ShouldRun = false, want true for 100 uncompacted decisions")
	}
}

func TestShouldRun_AfterCompaction(t *testing.T) {
	c, ds := setupCompactor(t)

	// 100 decisions, then compact — should return false after.
	for i := 0; i < 100; i++ {
		id, _ := ds.Record("task", "direct", 0.9, "simple", "low")
		_ = ds.RecordOutcome(id, true, "")
	}

	_ = c.Run()

	should, err := c.ShouldRun()
	if err != nil {
		t.Fatalf("ShouldRun: %v", err)
	}
	if should {
		t.Error("ShouldRun = true after compaction, want false")
	}
}

func TestPatternKey_Deterministic(t *testing.T) {
	a := patternKey("decompose", "complex", "high")
	b := patternKey("decompose", "complex", "high")
	if a != b {
		t.Errorf("patternKey not deterministic: %q != %q", a, b)
	}

	c := patternKey("direct", "simple", "low")
	if a == c {
		t.Error("different inputs should produce different keys")
	}
}

func TestRun_MultipleGroups(t *testing.T) {
	c, ds := setupCompactor(t)

	// Group 1: 5 decisions, all succeed.
	for i := 0; i < 5; i++ {
		id, _ := ds.Record("task", "decompose", 0.8, "complex", "high")
		_ = ds.RecordOutcome(id, true, "")
	}
	// Group 2: 5 decisions, all fail.
	for i := 0; i < 5; i++ {
		id, _ := ds.Record("task", "direct", 0.3, "simple", "low")
		_ = ds.RecordOutcome(id, false, "nope")
	}

	if err := c.Run(); err != nil {
		t.Fatalf("Run: %v", err)
	}

	var count int
	_ = c.db.QueryRow("SELECT COUNT(*) FROM ai_patterns").Scan(&count)
	if count != 2 {
		t.Fatalf("expected 2 patterns, got %d", count)
	}

	// Verify statuses.
	var activeStatus, deprecatedStatus string
	_ = c.db.QueryRow("SELECT status FROM ai_patterns WHERE strategy_id = 'decompose'").Scan(&activeStatus)
	_ = c.db.QueryRow("SELECT status FROM ai_patterns WHERE strategy_id = 'direct'").Scan(&deprecatedStatus)

	if activeStatus != "active" {
		t.Errorf("decompose status = %q, want active", activeStatus)
	}
	if deprecatedStatus != "deprecated" {
		t.Errorf("direct status = %q, want deprecated", deprecatedStatus)
	}
}

func TestRun_UpsertUpdatesExisting(t *testing.T) {
	c, ds := setupCompactor(t)

	// Initial 5 decisions — all succeed.
	for i := 0; i < 5; i++ {
		id, _ := ds.Record("task", "decompose", 0.8, "complex", "high")
		_ = ds.RecordOutcome(id, true, "")
	}
	_ = c.Run()

	// Add 5 more — all fail. Now 5/10 = 50%.
	for i := 0; i < 5; i++ {
		id, _ := ds.Record("task", "decompose", 0.8, "complex", "high")
		_ = ds.RecordOutcome(id, false, "")
	}
	_ = c.Run()

	var p CompactedPattern
	_ = c.db.QueryRow(
		"SELECT success_rate, sample_size, status FROM ai_patterns WHERE strategy_id = 'decompose'",
	).Scan(&p.SuccessRate, &p.SampleSize, &p.Status)

	if p.SampleSize != 10 {
		t.Errorf("sample_size = %d, want 10", p.SampleSize)
	}
	if math.Abs(p.SuccessRate-0.5) > 0.01 {
		t.Errorf("success_rate = %.4f, want 0.5", p.SuccessRate)
	}
	if p.Status != "active" {
		t.Errorf("status = %q, want active (50%% > 40%%)", p.Status)
	}
}
