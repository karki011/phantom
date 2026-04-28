// Package strategies provides AI prompt enhancement strategies.
// ThresholdTracker records decision outcomes and recalibrates
// complexity/risk thresholds using EMA smoothing with oscillation detection.
//
// Author: Subash Karki
package strategies

import (
	"database/sql"
	"math"
	"sync"
)

// smoothingFactor is the EMA alpha for threshold adjustments.
// Lower values produce smoother transitions; higher values react faster.
const smoothingFactor = 0.3

// adjustmentHistorySize is how many past values to track per threshold.
const adjustmentHistorySize = 5

// ThresholdConfig holds the file-count and blast-radius boundaries
// used by the assessor to classify tasks.
type ThresholdConfig struct {
	SimpleMaxFiles   int // upper bound for "simple" complexity (default 2)
	ModerateMaxFiles int // upper bound for "moderate" complexity (default 8)
	ComplexMaxFiles  int // upper bound for "complex" complexity (default 20)
	LowRiskMax       int // upper bound for "low" risk (default 3)
	MediumRiskMax    int // upper bound for "medium" risk (default 10)
	HighRiskMax      int // upper bound for "high" risk (default 25)
}

// DefaultThresholds returns the initial threshold configuration.
func DefaultThresholds() ThresholdConfig {
	return ThresholdConfig{
		SimpleMaxFiles:   2,
		ModerateMaxFiles: 8,
		ComplexMaxFiles:  20,
		LowRiskMax:       3,
		MediumRiskMax:    10,
		HighRiskMax:      25,
	}
}

// accuracyRecord tracks correct predictions vs total for a category.
type accuracyRecord struct {
	correct int
	total   int
}

// adjustmentHistory tracks the last N threshold values for oscillation detection.
type adjustmentHistory struct {
	values []int
}

// recordValue appends a value to the history, keeping only the last adjustmentHistorySize entries.
func (h *adjustmentHistory) recordValue(val int) {
	h.values = append(h.values, val)
	if len(h.values) > adjustmentHistorySize {
		h.values = h.values[len(h.values)-adjustmentHistorySize:]
	}
}

// ThresholdTracker accumulates decision outcomes and periodically
// recalibrates complexity thresholds using EMA smoothing.
type ThresholdTracker struct {
	mu          sync.RWMutex
	records     map[string]*accuracyRecord   // key: "complexity:<tier>" or "risk:<tier>"
	adjustments map[string]*adjustmentHistory // key: threshold key, tracks value history
	config      ThresholdConfig
	decisions   int
}

// NewThresholdTracker creates a tracker with default thresholds.
func NewThresholdTracker() *ThresholdTracker {
	return &ThresholdTracker{
		records:     make(map[string]*accuracyRecord),
		adjustments: make(map[string]*adjustmentHistory),
		config:      DefaultThresholds(),
	}
}

// RecordOutcome logs whether a prediction was correct and triggers
// recalibration every 50 decisions.
func (tt *ThresholdTracker) RecordOutcome(predicted TaskComplexity, actualSuccess bool, fileCount int) {
	tt.mu.Lock()
	defer tt.mu.Unlock()

	key := "complexity:" + string(predicted)
	r := tt.records[key]
	if r == nil {
		r = &accuracyRecord{}
		tt.records[key] = r
	}
	r.total++
	if actualSuccess {
		r.correct++
	}
	tt.decisions++

	// Recalibrate every 50 decisions
	if tt.decisions%50 == 0 {
		tt.recalibrate()
	}
}

// thresholdTier defines a threshold that can be auto-tuned.
type thresholdTier struct {
	key        string
	current    *int
	defaultVal int
	minVal     int
	maxVal     int
}

// recalibrate adjusts thresholds using EMA smoothing with oscillation detection.
// Called under write lock.
func (tt *ThresholdTracker) recalibrate() {
	tiers := []thresholdTier{
		{"complexity:simple", &tt.config.SimpleMaxFiles, 2, 1, 5},
		{"complexity:moderate", &tt.config.ModerateMaxFiles, 8, 4, 15},
		{"complexity:complex", &tt.config.ComplexMaxFiles, 20, 10, 30},
	}

	for _, tier := range tiers {
		r := tt.records[tier.key]
		if r == nil || r.total < 10 {
			continue
		}

		successRate := float64(r.correct) / float64(r.total)

		// Target: if success rate < 60%, threshold is too high (lower it)
		// If success rate > 90%, threshold is too conservative (raise it)
		var target float64
		if successRate < 0.6 {
			target = float64(*tier.current) * 0.85
		} else if successRate > 0.9 {
			target = float64(*tier.current) * 1.15
		} else {
			continue // In the sweet spot, don't adjust
		}

		// EMA smoothing
		smoothed := smoothingFactor*target + (1-smoothingFactor)*float64(*tier.current)
		clamped := clamp(int(math.Round(smoothed)), tier.minVal, tier.maxVal)

		// Oscillation detection — skip if threshold is bouncing
		if tt.isOscillating(tier.key, clamped) {
			continue
		}

		tt.recordAdjustment(tier.key, *tier.current, clamped)
		*tier.current = clamped
	}
}

// isOscillating checks if a threshold is bouncing between values.
// Returns true if the last two direction changes alternate (up-down-up or down-up-down).
func (tt *ThresholdTracker) isOscillating(key string, newValue int) bool {
	hist := tt.adjustments[key]
	if hist == nil || len(hist.values) < 2 {
		return false
	}

	vals := hist.values
	last := vals[len(vals)-1]
	prev := vals[len(vals)-2]

	dir1 := sign(last - prev)
	dir2 := sign(newValue - last)

	// If directions alternate (1,-1 or -1,1), it's oscillating
	return dir1 != 0 && dir2 != 0 && dir1 != dir2
}

// recordAdjustment logs a threshold change in the adjustment history.
func (tt *ThresholdTracker) recordAdjustment(key string, oldVal, newVal int) {
	hist := tt.adjustments[key]
	if hist == nil {
		hist = &adjustmentHistory{}
		tt.adjustments[key] = hist
		// Seed with old value so direction can be computed on next adjustment
		hist.recordValue(oldVal)
	}
	hist.recordValue(newVal)
}

// sign returns -1, 0, or 1 for negative, zero, or positive values.
func sign(n int) int {
	if n > 0 {
		return 1
	}
	if n < 0 {
		return -1
	}
	return 0
}

// clamp restricts val to the range [lo, hi].
func clamp(val, lo, hi int) int {
	if val < lo {
		return lo
	}
	if val > hi {
		return hi
	}
	return val
}

// GetConfig returns a snapshot of the current threshold configuration.
func (tt *ThresholdTracker) GetConfig() ThresholdConfig {
	tt.mu.RLock()
	defer tt.mu.RUnlock()
	return tt.config
}

// GetDecisionCount returns the total number of recorded decisions.
func (tt *ThresholdTracker) GetDecisionCount() int {
	tt.mu.RLock()
	defer tt.mu.RUnlock()
	return tt.decisions
}

// GetAdjustmentHistory returns a copy of the adjustment history for a key.
// Useful for testing and diagnostics.
func (tt *ThresholdTracker) GetAdjustmentHistory(key string) []int {
	tt.mu.RLock()
	defer tt.mu.RUnlock()
	hist := tt.adjustments[key]
	if hist == nil {
		return nil
	}
	out := make([]int, len(hist.values))
	copy(out, hist.values)
	return out
}

// --- SQLite Persistence ---

// SaveThresholds persists the current threshold config and adjustment history to SQLite.
func (tt *ThresholdTracker) SaveThresholds(db *sql.DB) error {
	tt.mu.RLock()
	defer tt.mu.RUnlock()

	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS ai_thresholds (
		key TEXT PRIMARY KEY,
		value INTEGER NOT NULL
	)`); err != nil {
		return err
	}

	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS ai_threshold_history (
		key TEXT NOT NULL,
		seq INTEGER NOT NULL,
		value INTEGER NOT NULL,
		PRIMARY KEY(key, seq)
	)`); err != nil {
		return err
	}

	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS ai_threshold_records (
		key TEXT PRIMARY KEY,
		correct INTEGER NOT NULL,
		total INTEGER NOT NULL
	)`); err != nil {
		return err
	}

	// Save config values
	configEntries := map[string]int{
		"simple_max_files":   tt.config.SimpleMaxFiles,
		"moderate_max_files": tt.config.ModerateMaxFiles,
		"complex_max_files":  tt.config.ComplexMaxFiles,
		"low_risk_max":       tt.config.LowRiskMax,
		"medium_risk_max":    tt.config.MediumRiskMax,
		"high_risk_max":      tt.config.HighRiskMax,
		"decisions":          tt.decisions,
	}
	for k, v := range configEntries {
		if _, err := db.Exec(`INSERT OR REPLACE INTO ai_thresholds (key, value) VALUES (?, ?)`, k, v); err != nil {
			return err
		}
	}

	// Save adjustment history
	for key, hist := range tt.adjustments {
		// Clear old entries for this key
		if _, err := db.Exec(`DELETE FROM ai_threshold_history WHERE key = ?`, key); err != nil {
			return err
		}
		for i, val := range hist.values {
			if _, err := db.Exec(`INSERT INTO ai_threshold_history (key, seq, value) VALUES (?, ?, ?)`, key, i, val); err != nil {
				return err
			}
		}
	}

	// Save accuracy records
	for key, r := range tt.records {
		if _, err := db.Exec(`INSERT OR REPLACE INTO ai_threshold_records (key, correct, total) VALUES (?, ?, ?)`, key, r.correct, r.total); err != nil {
			return err
		}
	}

	return nil
}

// LoadThresholds restores threshold config, adjustment history, and accuracy records from SQLite.
func (tt *ThresholdTracker) LoadThresholds(db *sql.DB) error {
	tt.mu.Lock()
	defer tt.mu.Unlock()

	// Load config values
	rows, err := db.Query(`SELECT key, value FROM ai_thresholds`)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var key string
		var val int
		if err := rows.Scan(&key, &val); err != nil {
			return err
		}
		switch key {
		case "simple_max_files":
			tt.config.SimpleMaxFiles = val
		case "moderate_max_files":
			tt.config.ModerateMaxFiles = val
		case "complex_max_files":
			tt.config.ComplexMaxFiles = val
		case "low_risk_max":
			tt.config.LowRiskMax = val
		case "medium_risk_max":
			tt.config.MediumRiskMax = val
		case "high_risk_max":
			tt.config.HighRiskMax = val
		case "decisions":
			tt.decisions = val
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}

	// Load adjustment history
	histRows, err := db.Query(`SELECT key, value FROM ai_threshold_history ORDER BY key, seq`)
	if err != nil {
		return err
	}
	defer histRows.Close()

	tt.adjustments = make(map[string]*adjustmentHistory)
	for histRows.Next() {
		var key string
		var val int
		if err := histRows.Scan(&key, &val); err != nil {
			return err
		}
		hist := tt.adjustments[key]
		if hist == nil {
			hist = &adjustmentHistory{}
			tt.adjustments[key] = hist
		}
		hist.values = append(hist.values, val)
	}
	if err := histRows.Err(); err != nil {
		return err
	}

	// Load accuracy records
	recRows, err := db.Query(`SELECT key, correct, total FROM ai_threshold_records`)
	if err != nil {
		return err
	}
	defer recRows.Close()

	tt.records = make(map[string]*accuracyRecord)
	for recRows.Next() {
		var key string
		var correct, total int
		if err := recRows.Scan(&key, &correct, &total); err != nil {
			return err
		}
		tt.records[key] = &accuracyRecord{correct: correct, total: total}
	}
	return recRows.Err()
}
