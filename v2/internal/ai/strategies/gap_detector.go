// Package strategies provides AI prompt enhancement strategies.
// GapDetector identifies complexity/risk combinations where no strategy
// performs well, surfacing areas that need new or improved approaches.
//
// Author: Subash Karki
package strategies

import "database/sql"

// Gap represents a complexity/risk combination where the best available
// strategy has a poor success rate.
type Gap struct {
	Complexity   TaskComplexity
	Risk         TaskRisk
	BestStrategy string
	BestRate     float64
	SampleSize   int
	Severity     string // "critical" (<30%) or "warning" (<50%)
}

// GapDetector analyzes decision history to find poorly-served task profiles.
type GapDetector struct{}

// NewGapDetector creates a GapDetector.
func NewGapDetector() *GapDetector { return &GapDetector{} }

// allComplexities enumerates every TaskComplexity value.
var allComplexities = []TaskComplexity{Simple, Moderate, Complex, Critical}

// allRisks enumerates every TaskRisk value.
var allRisks = []TaskRisk{LowRisk, MediumRisk, HighRisk, CriticalRisk}

// strategyPerformance holds the best strategy for a (complexity, risk) pair.
type strategyPerformance struct {
	strategyID string
	rate       float64
	total      int
}

// FindGaps examines the database for every (complexity, risk) pair that has
// 10+ decisions. For each, it finds the best-performing strategy. If the best
// success rate is below 50%, it is flagged as a gap.
//
// The db must contain ai_decisions and ai_outcomes tables (the schema created
// by knowledge.DecisionStore).
func (gd *GapDetector) FindGaps(db *sql.DB) []Gap {
	var gaps []Gap

	for _, complexity := range allComplexities {
		for _, risk := range allRisks {
			best := gd.bestStrategyForPair(db, string(complexity), string(risk))
			if best == nil || best.total < 10 {
				continue
			}

			var severity string
			switch {
			case best.rate < 0.3:
				severity = "critical"
			case best.rate < 0.5:
				severity = "warning"
			default:
				continue // No gap.
			}

			gaps = append(gaps, Gap{
				Complexity:   complexity,
				Risk:         risk,
				BestStrategy: best.strategyID,
				BestRate:     best.rate,
				SampleSize:   best.total,
				Severity:     severity,
			})
		}
	}

	return gaps
}

// bestStrategyForPair queries the decision + outcome tables to find the
// strategy with the highest success rate for a given (complexity, risk) pair.
// Returns nil if no decisions exist for this pair.
func (gd *GapDetector) bestStrategyForPair(db *sql.DB, complexity, risk string) *strategyPerformance {
	rows, err := db.Query(`
		SELECT d.strategy_id,
			   COUNT(*) as total,
			   COALESCE(SUM(CASE WHEN o.success = 1 THEN 1 ELSE 0 END), 0) as successes
		FROM ai_decisions d
		JOIN ai_outcomes o ON o.decision_id = d.id
		WHERE d.complexity = ? AND d.risk = ?
		GROUP BY d.strategy_id
	`, complexity, risk)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var best *strategyPerformance
	totalForPair := 0

	for rows.Next() {
		var strategyID string
		var total, successes int
		if err := rows.Scan(&strategyID, &total, &successes); err != nil {
			continue
		}

		totalForPair += total
		rate := float64(successes) / float64(total)

		if best == nil || rate > best.rate {
			best = &strategyPerformance{
				strategyID: strategyID,
				rate:       rate,
				total:      total,
			}
		}
	}

	if best != nil {
		// Use total across all strategies for the pair as the sample size threshold.
		best.total = totalForPair
	}
	return best
}

// HasCriticalGaps returns true if any critical-severity gap exists.
func (gd *GapDetector) HasCriticalGaps(db *sql.DB) bool {
	for _, gap := range gd.FindGaps(db) {
		if gap.Severity == "critical" {
			return true
		}
	}
	return false
}
