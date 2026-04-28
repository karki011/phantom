// auto_tune_test.go tests the ThresholdTracker with EMA smoothing,
// oscillation detection, and SQLite persistence.
// Author: Subash Karki
package strategies

import (
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"
)

func TestDefaultThresholds(t *testing.T) {
	cfg := DefaultThresholds()
	if cfg.SimpleMaxFiles != 2 {
		t.Errorf("SimpleMaxFiles = %d, want 2", cfg.SimpleMaxFiles)
	}
	if cfg.ModerateMaxFiles != 8 {
		t.Errorf("ModerateMaxFiles = %d, want 8", cfg.ModerateMaxFiles)
	}
	if cfg.ComplexMaxFiles != 20 {
		t.Errorf("ComplexMaxFiles = %d, want 20", cfg.ComplexMaxFiles)
	}
	if cfg.LowRiskMax != 3 {
		t.Errorf("LowRiskMax = %d, want 3", cfg.LowRiskMax)
	}
	if cfg.MediumRiskMax != 10 {
		t.Errorf("MediumRiskMax = %d, want 10", cfg.MediumRiskMax)
	}
	if cfg.HighRiskMax != 25 {
		t.Errorf("HighRiskMax = %d, want 25", cfg.HighRiskMax)
	}
}

func TestNewThresholdTracker(t *testing.T) {
	tt := NewThresholdTracker()
	if tt == nil {
		t.Fatal("NewThresholdTracker returned nil")
	}
	cfg := tt.GetConfig()
	want := DefaultThresholds()
	if cfg != want {
		t.Errorf("initial config = %+v, want %+v", cfg, want)
	}
	if tt.GetDecisionCount() != 0 {
		t.Errorf("initial decisions = %d, want 0", tt.GetDecisionCount())
	}
}

func TestRecordOutcome_CountsDecisions(t *testing.T) {
	tracker := NewThresholdTracker()
	for i := 0; i < 10; i++ {
		tracker.RecordOutcome(Simple, true, 1)
	}
	if tracker.GetDecisionCount() != 10 {
		t.Errorf("decisions = %d, want 10", tracker.GetDecisionCount())
	}
}

func TestRecalibration_LowersThresholdOnFailure(t *testing.T) {
	tracker := NewThresholdTracker()
	initialSimple := tracker.GetConfig().SimpleMaxFiles

	// Record 50 decisions for "simple" — all failures to trigger recalibration
	for i := 0; i < 50; i++ {
		tracker.RecordOutcome(Simple, false, 1)
	}

	cfg := tracker.GetConfig()
	if cfg.SimpleMaxFiles >= initialSimple {
		t.Errorf("expected SimpleMaxFiles to decrease from %d, got %d", initialSimple, cfg.SimpleMaxFiles)
	}
}

func TestRecalibration_RaisesThresholdOnSuccess(t *testing.T) {
	tracker := NewThresholdTracker()
	initialSimple := tracker.GetConfig().SimpleMaxFiles

	// Record 50 decisions for "simple" — all successes
	for i := 0; i < 50; i++ {
		tracker.RecordOutcome(Simple, true, 1)
	}

	cfg := tracker.GetConfig()
	if cfg.SimpleMaxFiles <= initialSimple {
		t.Errorf("expected SimpleMaxFiles to increase from %d, got %d", initialSimple, cfg.SimpleMaxFiles)
	}
}

func TestRecalibration_ModerateThreshold(t *testing.T) {
	tracker := NewThresholdTracker()
	initialModerate := tracker.GetConfig().ModerateMaxFiles

	// 50 failures for moderate
	for i := 0; i < 50; i++ {
		tracker.RecordOutcome(Moderate, false, 5)
	}

	cfg := tracker.GetConfig()
	if cfg.ModerateMaxFiles >= initialModerate {
		t.Errorf("expected ModerateMaxFiles to decrease from %d, got %d", initialModerate, cfg.ModerateMaxFiles)
	}
}

func TestRecalibration_ComplexThreshold(t *testing.T) {
	tracker := NewThresholdTracker()
	initialComplex := tracker.GetConfig().ComplexMaxFiles

	// 50 successes for complex
	for i := 0; i < 50; i++ {
		tracker.RecordOutcome(Complex, true, 15)
	}

	cfg := tracker.GetConfig()
	if cfg.ComplexMaxFiles <= initialComplex {
		t.Errorf("expected ComplexMaxFiles to increase from %d, got %d", initialComplex, cfg.ComplexMaxFiles)
	}
}

func TestBoundsClamping_SimpleFloor(t *testing.T) {
	tracker := NewThresholdTracker()

	// Drive SimpleMaxFiles to the floor (1) by repeatedly failing
	for round := 0; round < 5; round++ {
		for i := 0; i < 50; i++ {
			tracker.RecordOutcome(Simple, false, 1)
		}
	}

	cfg := tracker.GetConfig()
	if cfg.SimpleMaxFiles < 1 {
		t.Errorf("SimpleMaxFiles = %d, should not go below 1", cfg.SimpleMaxFiles)
	}
}

func TestBoundsClamping_SimpleCeiling(t *testing.T) {
	tracker := NewThresholdTracker()

	// Drive SimpleMaxFiles to the ceiling (5)
	for round := 0; round < 10; round++ {
		for i := 0; i < 50; i++ {
			tracker.RecordOutcome(Simple, true, 1)
		}
	}

	cfg := tracker.GetConfig()
	if cfg.SimpleMaxFiles > 5 {
		t.Errorf("SimpleMaxFiles = %d, should not exceed 5", cfg.SimpleMaxFiles)
	}
}

func TestBoundsClamping_ModerateFloor(t *testing.T) {
	tracker := NewThresholdTracker()

	for round := 0; round < 5; round++ {
		for i := 0; i < 50; i++ {
			tracker.RecordOutcome(Moderate, false, 5)
		}
	}

	cfg := tracker.GetConfig()
	if cfg.ModerateMaxFiles < 4 {
		t.Errorf("ModerateMaxFiles = %d, should not go below 4", cfg.ModerateMaxFiles)
	}
}

func TestBoundsClamping_ComplexFloor(t *testing.T) {
	tracker := NewThresholdTracker()

	for round := 0; round < 5; round++ {
		for i := 0; i < 50; i++ {
			tracker.RecordOutcome(Complex, false, 15)
		}
	}

	cfg := tracker.GetConfig()
	if cfg.ComplexMaxFiles < 10 {
		t.Errorf("ComplexMaxFiles = %d, should not go below 10", cfg.ComplexMaxFiles)
	}
}

func TestNoRecalibrationBefore50(t *testing.T) {
	tracker := NewThresholdTracker()
	initial := tracker.GetConfig()

	// Record 49 failures — should NOT trigger recalibration
	for i := 0; i < 49; i++ {
		tracker.RecordOutcome(Simple, false, 1)
	}

	cfg := tracker.GetConfig()
	if cfg.SimpleMaxFiles != initial.SimpleMaxFiles {
		t.Errorf("expected no change before 50 decisions, got SimpleMaxFiles=%d", cfg.SimpleMaxFiles)
	}
}

func TestAssessorWithTracker(t *testing.T) {
	tracker := NewThresholdTracker()

	// Manually adjust config to verify the assessor reads from tracker
	tracker.mu.Lock()
	tracker.config.SimpleMaxFiles = 5
	tracker.mu.Unlock()

	assessor := NewAssessor()
	assessor.SetThresholdTracker(tracker)

	// 4 files should be "simple" with threshold at 5
	result := assessor.Assess("fix bug", 4, 1)
	if result.Complexity != Simple {
		t.Errorf("expected Simple with threshold 5, got %s for fileCount=4", result.Complexity)
	}
}

func TestAssessorWithoutTracker(t *testing.T) {
	assessor := NewAssessor()

	// 4 files should be "moderate" with default threshold of 2
	result := assessor.Assess("fix bug", 4, 1)
	if result.Complexity != Moderate {
		t.Errorf("expected Moderate with default thresholds, got %s for fileCount=4", result.Complexity)
	}
}

func TestMixedOutcomes_NoRecalibration(t *testing.T) {
	tracker := NewThresholdTracker()
	initial := tracker.GetConfig()

	// 35 successes + 15 failures = 70% success rate
	// Between 0.6 and 0.9 — should NOT trigger either adjustment branch
	for i := 0; i < 35; i++ {
		tracker.RecordOutcome(Simple, true, 1)
	}
	for i := 0; i < 15; i++ {
		tracker.RecordOutcome(Simple, false, 1)
	}

	cfg := tracker.GetConfig()
	if cfg.SimpleMaxFiles != initial.SimpleMaxFiles {
		t.Errorf("expected no threshold change at 70%% success rate, got SimpleMaxFiles=%d (was %d)",
			cfg.SimpleMaxFiles, initial.SimpleMaxFiles)
	}
}

// --- EMA Smoothing Tests ---

func TestEMASmoothing_GradualDecrease(t *testing.T) {
	tracker := NewThresholdTracker()

	// With EMA, a single recalibration should move the threshold gradually,
	// not by a fixed additive amount.
	// SimpleMaxFiles starts at 2. With all failures and EMA:
	// target = 2 * 0.85 = 1.7
	// smoothed = 0.3 * 1.7 + 0.7 * 2.0 = 0.51 + 1.4 = 1.91 → rounds to 2
	// So first round may not change (EMA is conservative).
	// After multiple rounds, it should converge toward 1.
	for round := 0; round < 10; round++ {
		for i := 0; i < 50; i++ {
			tracker.RecordOutcome(Simple, false, 1)
		}
	}

	cfg := tracker.GetConfig()
	if cfg.SimpleMaxFiles > 2 {
		t.Errorf("EMA should have lowered SimpleMaxFiles, got %d", cfg.SimpleMaxFiles)
	}
	if cfg.SimpleMaxFiles < 1 {
		t.Errorf("SimpleMaxFiles should not go below 1, got %d", cfg.SimpleMaxFiles)
	}
}

func TestEMASmoothing_GradualIncrease(t *testing.T) {
	tracker := NewThresholdTracker()

	// SimpleMaxFiles starts at 2. With all successes and EMA:
	// target = 2 * 1.15 = 2.3
	// smoothed = 0.3 * 2.3 + 0.7 * 2.0 = 0.69 + 1.4 = 2.09 → rounds to 2
	// Needs multiple rounds to move up gradually.
	for round := 0; round < 20; round++ {
		for i := 0; i < 50; i++ {
			tracker.RecordOutcome(Simple, true, 1)
		}
	}

	cfg := tracker.GetConfig()
	if cfg.SimpleMaxFiles <= 2 {
		t.Errorf("EMA should have raised SimpleMaxFiles over many rounds, got %d", cfg.SimpleMaxFiles)
	}
	if cfg.SimpleMaxFiles > 5 {
		t.Errorf("SimpleMaxFiles should not exceed 5, got %d", cfg.SimpleMaxFiles)
	}
}

// --- Oscillation Detection Tests ---

func TestSign(t *testing.T) {
	tests := []struct {
		input int
		want  int
	}{
		{5, 1},
		{-3, -1},
		{0, 0},
		{100, 1},
		{-1, -1},
	}
	for _, tc := range tests {
		got := sign(tc.input)
		if got != tc.want {
			t.Errorf("sign(%d) = %d, want %d", tc.input, got, tc.want)
		}
	}
}

func TestClamp(t *testing.T) {
	tests := []struct {
		val, lo, hi, want int
	}{
		{5, 1, 10, 5},
		{0, 1, 10, 1},
		{15, 1, 10, 10},
		{1, 1, 1, 1},
	}
	for _, tc := range tests {
		got := clamp(tc.val, tc.lo, tc.hi)
		if got != tc.want {
			t.Errorf("clamp(%d, %d, %d) = %d, want %d", tc.val, tc.lo, tc.hi, got, tc.want)
		}
	}
}

func TestIsOscillating_NotEnoughHistory(t *testing.T) {
	tracker := NewThresholdTracker()
	// No history — should not detect oscillation
	if tracker.isOscillating("test", 5) {
		t.Error("should not detect oscillation with no history")
	}

	// One entry — still not enough
	tracker.adjustments["test"] = &adjustmentHistory{values: []int{3}}
	if tracker.isOscillating("test", 5) {
		t.Error("should not detect oscillation with only 1 history entry")
	}
}

func TestIsOscillating_Detected(t *testing.T) {
	tracker := NewThresholdTracker()
	// History: [3, 5] (went up), new value 4 (goes down) → oscillation
	tracker.adjustments["test"] = &adjustmentHistory{values: []int{3, 5}}
	if !tracker.isOscillating("test", 4) {
		t.Error("expected oscillation: 3→5→4 (up then down)")
	}
}

func TestIsOscillating_NotDetected_SameDirection(t *testing.T) {
	tracker := NewThresholdTracker()
	// History: [3, 5] (went up), new value 7 (still up) → not oscillating
	tracker.adjustments["test"] = &adjustmentHistory{values: []int{3, 5}}
	if tracker.isOscillating("test", 7) {
		t.Error("should not detect oscillation when direction is consistent: 3→5→7")
	}
}

func TestIsOscillating_ZeroDirection(t *testing.T) {
	tracker := NewThresholdTracker()
	// History: [3, 3] (no change), new value 4 → not oscillating (zero direction)
	tracker.adjustments["test"] = &adjustmentHistory{values: []int{3, 3}}
	if tracker.isOscillating("test", 4) {
		t.Error("should not detect oscillation when previous direction is zero")
	}
}

func TestRecordAdjustment(t *testing.T) {
	tracker := NewThresholdTracker()

	tracker.recordAdjustment("test", 2, 3)
	hist := tracker.GetAdjustmentHistory("test")
	if len(hist) != 2 {
		t.Fatalf("expected 2 entries (seed + new), got %d", len(hist))
	}
	if hist[0] != 2 || hist[1] != 3 {
		t.Errorf("expected [2, 3], got %v", hist)
	}

	tracker.recordAdjustment("test", 3, 4)
	hist = tracker.GetAdjustmentHistory("test")
	if len(hist) != 3 {
		t.Fatalf("expected 3 entries, got %d", len(hist))
	}
	if hist[2] != 4 {
		t.Errorf("expected last entry 4, got %d", hist[2])
	}
}

func TestAdjustmentHistory_CapsAtSize(t *testing.T) {
	h := &adjustmentHistory{}
	for i := 0; i < 10; i++ {
		h.recordValue(i)
	}
	if len(h.values) != adjustmentHistorySize {
		t.Errorf("expected history length %d, got %d", adjustmentHistorySize, len(h.values))
	}
	// Should have the last 5 values: 5, 6, 7, 8, 9
	if h.values[0] != 5 {
		t.Errorf("expected oldest value 5, got %d", h.values[0])
	}
}

func TestGetAdjustmentHistory_NilKey(t *testing.T) {
	tracker := NewThresholdTracker()
	hist := tracker.GetAdjustmentHistory("nonexistent")
	if hist != nil {
		t.Errorf("expected nil for nonexistent key, got %v", hist)
	}
}

// --- SQLite Persistence Tests ---

func openTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("failed to open test DB: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestThresholdTracker_SaveLoadRoundTrip(t *testing.T) {
	db := openTestDB(t)

	// Build a tracker with non-default state
	original := NewThresholdTracker()
	original.mu.Lock()
	original.config.SimpleMaxFiles = 3
	original.config.ModerateMaxFiles = 10
	original.config.ComplexMaxFiles = 25
	original.decisions = 150
	original.records["complexity:simple"] = &accuracyRecord{correct: 80, total: 100}
	original.records["complexity:moderate"] = &accuracyRecord{correct: 40, total: 50}
	original.adjustments["complexity:simple"] = &adjustmentHistory{values: []int{2, 3, 3}}
	original.mu.Unlock()

	if err := original.SaveThresholds(db); err != nil {
		t.Fatalf("SaveThresholds failed: %v", err)
	}

	// Load into a fresh tracker
	loaded := NewThresholdTracker()
	if err := loaded.LoadThresholds(db); err != nil {
		t.Fatalf("LoadThresholds failed: %v", err)
	}

	// Verify config
	if loaded.config.SimpleMaxFiles != 3 {
		t.Errorf("SimpleMaxFiles = %d, want 3", loaded.config.SimpleMaxFiles)
	}
	if loaded.config.ModerateMaxFiles != 10 {
		t.Errorf("ModerateMaxFiles = %d, want 10", loaded.config.ModerateMaxFiles)
	}
	if loaded.config.ComplexMaxFiles != 25 {
		t.Errorf("ComplexMaxFiles = %d, want 25", loaded.config.ComplexMaxFiles)
	}
	if loaded.decisions != 150 {
		t.Errorf("decisions = %d, want 150", loaded.decisions)
	}

	// Verify accuracy records
	r := loaded.records["complexity:simple"]
	if r == nil || r.correct != 80 || r.total != 100 {
		t.Errorf("simple record = %+v, want {80, 100}", r)
	}
	r = loaded.records["complexity:moderate"]
	if r == nil || r.correct != 40 || r.total != 50 {
		t.Errorf("moderate record = %+v, want {40, 50}", r)
	}

	// Verify adjustment history
	hist := loaded.adjustments["complexity:simple"]
	if hist == nil || len(hist.values) != 3 {
		t.Fatalf("expected 3 history values, got %v", hist)
	}
	if hist.values[0] != 2 || hist.values[1] != 3 || hist.values[2] != 3 {
		t.Errorf("history values = %v, want [2, 3, 3]", hist.values)
	}
}

func TestThresholdTracker_LoadFromEmpty(t *testing.T) {
	db := openTestDB(t)

	// Create the tables but leave them empty
	tracker := NewThresholdTracker()
	if err := tracker.SaveThresholds(db); err != nil {
		t.Fatalf("SaveThresholds (default) failed: %v", err)
	}

	// Load — should get default values
	loaded := NewThresholdTracker()
	loaded.mu.Lock()
	loaded.config.SimpleMaxFiles = 99 // set non-default to verify overwrite
	loaded.mu.Unlock()

	if err := loaded.LoadThresholds(db); err != nil {
		t.Fatalf("LoadThresholds failed: %v", err)
	}

	cfg := loaded.GetConfig()
	if cfg.SimpleMaxFiles != 2 {
		t.Errorf("SimpleMaxFiles = %d, want default 2", cfg.SimpleMaxFiles)
	}
}

func TestPerformanceStore_SaveLoadRoundTrip(t *testing.T) {
	db := openTestDB(t)

	original := NewPerformanceStore()
	original.Record("direct", Simple, true)
	original.Record("direct", Simple, true)
	original.Record("direct", Simple, false)
	original.Record("decompose", Complex, true)

	if err := original.Save(db); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	loaded := NewPerformanceStore()
	if err := loaded.Load(db); err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	// Check direct/simple: 2 successes, 3 total
	w := loaded.GetHistoricalWeight("direct", Simple)
	if w == 1.0 {
		t.Error("expected non-neutral weight for direct/simple after 3 records")
	}

	// Check decompose/complex: 1 success, 1 total — too few for weight
	w = loaded.GetHistoricalWeight("decompose", Complex)
	if w != 1.0 {
		t.Errorf("expected neutral weight for decompose/complex (only 1 record), got %f", w)
	}
}
