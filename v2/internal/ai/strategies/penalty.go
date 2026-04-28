// Package strategies provides AI prompt enhancement strategies.
// Penalty applies time-decayed anti-repetition scoring to prevent
// the system from re-selecting strategies that recently failed.
//
// Author: Subash Karki
package strategies

import (
	"fmt"
	"math"
	"time"
)

const (
	// BasePenalty is the starting penalty for a single recent failure.
	BasePenalty = 0.3
	// MaxPenalty caps the total penalty to avoid zeroing out scores entirely.
	MaxPenalty = 0.45
	// HalfLifeDays controls the exponential decay — penalty halves every 14 days.
	HalfLifeDays = 14.0
)

// Failure records a strategy that did not succeed.
type Failure struct {
	StrategyID string
	CreatedAt  time.Time
}

// ApplyFailurePenalty subtracts a time-decayed penalty from baseScore for the
// given strategy. Multiple failures increase the penalty via a frequency
// multiplier (capped at 1.5x). Returns the adjusted score and a reason string.
func ApplyFailurePenalty(baseScore float64, strategyID string, failures []Failure) (float64, string) {
	var relevant []Failure
	for _, f := range failures {
		if f.StrategyID == strategyID {
			relevant = append(relevant, f)
		}
	}
	if len(relevant) == 0 {
		return baseScore, ""
	}

	mostRecent := relevant[0]
	for _, f := range relevant[1:] {
		if f.CreatedAt.After(mostRecent.CreatedAt) {
			mostRecent = f
		}
	}

	daysSince := time.Since(mostRecent.CreatedAt).Hours() / 24
	decay := math.Exp(-daysSince / HalfLifeDays)
	freqMultiplier := math.Min(1.0+float64(len(relevant)-1)*0.25, 1.5)
	penalty := math.Min(BasePenalty*decay*freqMultiplier, MaxPenalty)

	return math.Max(0, baseScore-penalty),
		fmt.Sprintf("penalized: -%.2f, %d failures, %.0fd ago", penalty, len(relevant), daysSince)
}
