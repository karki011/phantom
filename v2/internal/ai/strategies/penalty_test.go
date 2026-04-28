// penalty_test.go tests the time-decayed anti-repetition penalty.
// Author: Subash Karki
package strategies

import (
	"math"
	"testing"
	"time"
)

func TestApplyFailurePenalty_NoFailures(t *testing.T) {
	score, reason := ApplyFailurePenalty(0.9, "direct", nil)
	if score != 0.9 {
		t.Errorf("expected 0.9 with no failures, got %.4f", score)
	}
	if reason != "" {
		t.Errorf("expected empty reason, got %q", reason)
	}
}

func TestApplyFailurePenalty_RecentFailure(t *testing.T) {
	failures := []Failure{
		{StrategyID: "direct", CreatedAt: time.Now()},
	}
	score, _ := ApplyFailurePenalty(0.9, "direct", failures)

	// Recent failure: decay ~1.0, freqMultiplier=1.0, penalty ~0.3
	// Expected score: 0.9 - 0.3 = ~0.6
	if math.Abs(score-0.6) > 0.05 {
		t.Errorf("expected ~0.6 for recent single failure, got %.4f", score)
	}
}

func TestApplyFailurePenalty_14DaysAgo(t *testing.T) {
	failures := []Failure{
		{StrategyID: "direct", CreatedAt: time.Now().Add(-14 * 24 * time.Hour)},
	}
	score, _ := ApplyFailurePenalty(0.9, "direct", failures)

	// 14 days: decay = e^(-1) ≈ 0.368, penalty ≈ 0.3 * 0.368 ≈ 0.11
	// Expected score: 0.9 - 0.11 ≈ 0.79
	if score < 0.75 || score > 0.85 {
		t.Errorf("expected ~0.79 for 14d-old failure, got %.4f", score)
	}
}

func TestApplyFailurePenalty_30DaysAgo(t *testing.T) {
	failures := []Failure{
		{StrategyID: "direct", CreatedAt: time.Now().Add(-30 * 24 * time.Hour)},
	}
	score, _ := ApplyFailurePenalty(0.9, "direct", failures)

	// 30 days: decay = e^(-30/14) ≈ 0.117, penalty ≈ 0.3 * 0.117 ≈ 0.035
	// Expected score: 0.9 - 0.035 ≈ 0.865
	if score < 0.84 || score > 0.90 {
		t.Errorf("expected ~0.865 for 30d-old failure, got %.4f", score)
	}
}

func TestApplyFailurePenalty_MultipleFailures(t *testing.T) {
	now := time.Now()
	failures := []Failure{
		{StrategyID: "direct", CreatedAt: now},
		{StrategyID: "direct", CreatedAt: now.Add(-2 * 24 * time.Hour)},
		{StrategyID: "direct", CreatedAt: now.Add(-5 * 24 * time.Hour)},
	}
	score, _ := ApplyFailurePenalty(0.9, "direct", failures)

	// 3 failures: freqMultiplier = 1.0 + 2*0.25 = 1.5
	// Recent: decay ~1.0, penalty = 0.3 * 1.0 * 1.5 = 0.45 (hits MaxPenalty)
	// Expected score: 0.9 - 0.45 = 0.45
	if math.Abs(score-0.45) > 0.05 {
		t.Errorf("expected ~0.45 for 3 recent failures (1.5x multiplier), got %.4f", score)
	}
}

func TestApplyFailurePenalty_OtherStrategy(t *testing.T) {
	failures := []Failure{
		{StrategyID: "decompose", CreatedAt: time.Now()},
	}
	score, reason := ApplyFailurePenalty(0.9, "direct", failures)
	if score != 0.9 {
		t.Errorf("expected 0.9 when failures are for a different strategy, got %.4f", score)
	}
	if reason != "" {
		t.Errorf("expected empty reason, got %q", reason)
	}
}

func TestApplyFailurePenalty_FloorAtZero(t *testing.T) {
	now := time.Now()
	failures := []Failure{
		{StrategyID: "direct", CreatedAt: now},
		{StrategyID: "direct", CreatedAt: now},
		{StrategyID: "direct", CreatedAt: now},
	}
	score, _ := ApplyFailurePenalty(0.2, "direct", failures)
	if score < 0 {
		t.Errorf("score should not go below 0, got %.4f", score)
	}
}
