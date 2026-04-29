// Package strategies provides AI prompt enhancement strategies.
// TreeOfThoughtStrategy explores multiple candidate approaches, scores each
// deterministically, and surfaces the highest-scoring branch alongside the
// alternatives. v1 generated the alternatives via an LLM and re-scored them
// via a second LLM call; v2 generates 3 fixed approaches (direct, conservative,
// refactor) and scores them with the same heuristic v1 used as a fallback.
//
// Author: Subash Karki
package strategies

import (
	"fmt"
	"math"
	"strings"
)

// TreeOfThoughtStrategy explores multiple branches for ambiguous tasks.
type TreeOfThoughtStrategy struct{}

// NewTreeOfThoughtStrategy creates a TreeOfThoughtStrategy.
func NewTreeOfThoughtStrategy() *TreeOfThoughtStrategy { return &TreeOfThoughtStrategy{} }

// ID returns the unique identifier for this strategy.
func (s *TreeOfThoughtStrategy) ID() string { return "tree-of-thought" }

// Name returns a human-readable name.
func (s *TreeOfThoughtStrategy) Name() string { return "Tree of Thoughts" }

// Description returns a brief explanation of what this strategy does.
func (s *TreeOfThoughtStrategy) Description() string {
	return "Explores multiple reasoning branches for ambiguous tasks, evaluates each, and selects the most promising one."
}

// ShouldActivate scores how strongly this strategy fits the task.
// Mirrors v1: ambiguous + (moderate|complex|critical) → 0.85,
// ambiguous + simple → 0.5, complex+risky → 0.6.
func (s *TreeOfThoughtStrategy) ShouldActivate(t TaskAssessment) (float64, string) {
	switch {
	case t.IsAmbiguous && (t.Complexity == Moderate || t.Complexity == Complex || t.Complexity == Critical):
		return 0.85, fmt.Sprintf("Ambiguous task with %s complexity — tree-of-thought exploration recommended", t.Complexity)
	case t.IsAmbiguous && t.Complexity == Simple:
		return 0.5, "Ambiguous but simple task — tree-of-thought may help but is not critical"
	case (t.Complexity == Complex || t.Complexity == Critical) &&
		(t.Risk == MediumRisk || t.Risk == HighRisk || t.Risk == CriticalRisk):
		return 0.6, fmt.Sprintf("Complex task (%s) with %s risk — multiple approaches worth exploring", t.Complexity, t.Risk)
	default:
		return 0.1, "Simple or low-risk task — single path sufficient"
	}
}

// Enrich emits a structured tree-of-thought prompt with three approaches and
// the deterministic winner pre-computed.
func (s *TreeOfThoughtStrategy) Enrich(message string, t TaskAssessment, graphCtx string) string {
	branches := scoreBranches(t)
	winner := branches[0]

	var lines []string
	for _, b := range branches {
		marker := "  "
		if b.id == winner.id {
			marker = "* "
		}
		lines = append(lines, fmt.Sprintf("%sBranch %d (%s): feasibility=%.2f risk=%.2f effort=%.2f combined=%.2f",
			marker, b.id, b.approach, b.feasibility, b.risk, b.effort, b.combined))
	}

	guidance := fmt.Sprintf(`<strategy-guidance kind="tree-of-thought">
Task profile: complexity=%s, risk=%s, ambiguity=%.1f, blastRadius=%d
Approaches considered (* = recommended):
%s
Recommendation:
1. Start with the marked branch ("%s"). Re-evaluate the score if assumptions change.
2. Keep the alternatives in mind — fall back if blockers appear.
%s</strategy-guidance>

%s`, t.Complexity, t.Risk, t.AmbiguityScore, t.BlastRadius,
		strings.Join(lines, "\n"), winner.approach, graphCtx, message)
	return guidance
}

// thoughtBranch holds a candidate approach and its scores.
type thoughtBranch struct {
	id          int
	approach    string
	feasibility float64
	risk        float64
	effort      float64
	combined    float64
}

// scoreBranches generates the same 3 fixed approaches v1 used and scores them
// using the deterministic fallback heuristic. Returned highest-combined first.
func scoreBranches(t TaskAssessment) []thoughtBranch {
	riskMult := 0.2
	switch t.Risk {
	case CriticalRisk:
		riskMult = 0.8
	case HighRisk:
		riskMult = 0.6
	case MediumRisk:
		riskMult = 0.4
	}
	blastRisk := math.Min(1.0, float64(t.BlastRadius)/20.0)

	branches := []thoughtBranch{
		{
			id:          1,
			approach:    "Direct — implement as described",
			feasibility: 0.8,
			risk:        round2(math.Min(1.0, riskMult+blastRisk*0.3)),
			effort:      0.5,
		},
		{
			id:          2,
			approach:    "Conservative — minimal changes, maximize reuse",
			feasibility: 0.9,
			risk:        0.2,
			effort:      0.3,
		},
		{
			id:          3,
			approach:    "Refactoring — restructure, then implement",
			feasibility: 0.6,
			risk:        0.5,
			effort:      0.8,
		},
	}
	for i := range branches {
		b := &branches[i]
		b.combined = round2((b.feasibility + (1 - b.risk) + (1 - b.effort)) / 3)
	}
	// Sort: highest combined first.
	for i := 0; i < len(branches); i++ {
		for j := i + 1; j < len(branches); j++ {
			if branches[j].combined > branches[i].combined {
				branches[i], branches[j] = branches[j], branches[i]
			}
		}
	}
	return branches
}

// round2 rounds a float to 2 decimal places (matches v1 Math.round(x*100)/100).
func round2(v float64) float64 {
	return math.Round(v*100) / 100
}
